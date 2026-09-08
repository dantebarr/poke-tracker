import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Task } from "@/lib/task/task";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, createAccount, deleteAccount, labelsFor, signIn } from "./helpers/supabase";

/**
 * A **Recurrence**'s tasks arriving during **settlement** (#14), driven through
 * the real settle-on-entry action against a real local Supabase — the same
 * harness tests/settlement.test.ts uses, and for the same reason: what is under
 * test is the orchestration, and the orchestration is the part no pure test can
 * see.
 *
 * The date arithmetic itself is proved with no database at all in
 * tests/recurrence-dates.test.ts, and generation's own idempotence and label
 * check in tests/recurrence-writes.test.ts. What is here is only what needs
 * settlement to be true: that every rule is generated at all, that each is
 * asked for its own horizon of today plus one interval, and that a rule
 * generation cannot write does not cost the trainer their ledger.
 *
 * Like settlement.test.ts, nothing here fakes the clock — the tests force the
 * trainer's settlement watermark back to owe days and assert against day keys
 * relative to a real today.
 */
const jarRef = vi.hoisted(() => ({ current: null as CookieJar | null }));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!jarRef.current) {
      throw new Error("No request cookies in scope");
    }
    return jarRef.current;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { ensureTrainer } = await import("@/app/actions/trainer");
const { createRecurrenceAction } = await import("@/app/actions/recurrence");
const { settleOnEntry } = await import("@/app/actions/settlement");
const { dayKeyInTimeZone, dayKeyToUtcDate } = await import("@/lib/day/day");
const { bucketOpenTasks } = await import("@/lib/task/dates");
const { EFFORT_POINTS, listTasks } = await import("@/lib/task/task");

const ALLOW_LISTED = "ash@pallet.example";
const RIVAL = "gary@oak.example";
const TIME_ZONE = "UTC";

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = `${ALLOW_LISTED},${RIVAL}`;
});

afterEach(async () => {
  for (const id of created) {
    await deleteAccount(id);
  }
  jarRef.current = null;
});

/**
 * As in settlement.test.ts: a known zone to compute expected day keys against,
 * forced after provisioning. Real trainers keep whatever zone Settings holds.
 */
async function signedInTrainer(email: string, targetJar: CookieJar = jar) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(targetJar, account);
  const trainer = await as(targetJar, ensureTrainer);
  const { error } = await adminClient().from("trainer").update({ time_zone: TIME_ZONE }).eq("id", trainer.id);
  if (error) throw new Error(`Forcing time_zone failed: ${JSON.stringify(error)}`);
  return trainer;
}

/** Runs `fn` as if the given jar's session were the request's own. */
async function as<T>(otherJar: CookieJar, fn: () => Promise<T>): Promise<T> {
  const previous = jarRef.current;
  jarRef.current = otherJar;
  try {
    return await fn();
  } finally {
    jarRef.current = previous;
  }
}

/** Days ago, so negative reaches forward: `dayKey(-1)` is tomorrow. */
function dayKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return dayKeyInTimeZone(date, TIME_ZONE);
}

function noonOf(day: string): string {
  return `${day}T12:00:00.000Z`;
}

async function setLastSettledDay(trainerId: string, day: string) {
  const { error } = await adminClient().from("trainer").update({ last_settled_day: day }).eq("id", trainerId);
  if (error) throw new Error(`Forcing last_settled_day failed: ${JSON.stringify(error)}`);
}

/**
 * A second app entry on the same day, with settlement's own work undone: the
 * ledger rows cleared and the watermark put back where it was. Settlement
 * refuses to rewrite a settled day, so this is what it takes to make it walk
 * the same days twice — and it deliberately leaves the *recurrence's* own
 * watermark alone, that being the thing under test. Generation runs again,
 * asked for the same horizon, and must write nothing.
 */
async function rewindSettlement(trainerId: string, to: string) {
  const { error } = await adminClient().from("day_ledger").delete().eq("trainer_id", trainerId);
  if (error) throw new Error(`Clearing ledger failed: ${JSON.stringify(error)}`);
  await setLastSettledDay(trainerId, to);
}

/** What a real `<form>` submission produces — the action takes one of these. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

/**
 * A trainer's tasks as an auditor would see them. Read through the admin
 * client rather than the app's own `currentTasks`, which memoizes per request
 * — these tests read the same trainer either side of a write and need the
 * second read to be a real one.
 */
async function tasksFor(trainerId: string): Promise<Task[]> {
  return listTasks(adminClient(), trainerId);
}

async function dueDatesFor(trainerId: string): Promise<string[]> {
  return (await tasksFor(trainerId)).map((task) => task.dueDate);
}

type LedgerRow = { day: string; points_earned: number };

async function ledgerFor(trainerId: string): Promise<LedgerRow[]> {
  const { data, error } = await adminClient()
    .from("day_ledger")
    .select("day, points_earned")
    .eq("trainer_id", trainerId)
    .order("day")
    .returns<LedgerRow[]>();
  if (error) throw new Error(`Reading ledger failed: ${JSON.stringify(error)}`);
  return data;
}

/** A daily rule anchored `daysAgo` days back, whose creation writes that one task. */
async function dailyRule(labelId: string, daysAgo: number, fields: Record<string, string> = {}) {
  await createRecurrenceAction(
    formData({
      title: "Water the plants",
      startsOn: dayKey(daysAgo),
      labelId,
      size: "small",
      frequency: "daily",
      ...fields,
    }),
  );
}

describe("the tasks a recurrence owes arrive on the way in", () => {
  it("brings back one task per date the trainer was away for, and one more beyond today", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    // Creation generates the start date's task and nothing else (#13), so
    // every date from there on is settlement's to produce.
    await dailyRule(personal.id, 3);
    expect(await dueDatesFor(trainer.id)).toEqual([dayKey(3)]);

    await setLastSettledDay(trainer.id, dayKey(3));
    await settleOnEntry();

    // Uncapped, and reaching one interval past today: nothing about being away
    // is forgiven, and tomorrow's task is already waiting (ADR-0010).
    expect(await dueDatesFor(trainer.id)).toEqual([dayKey(3), dayKey(2), dayKey(1), dayKey(0), dayKey(-1)]);
  });

  it("generates every one of the trainer's rules, each to its own horizon", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal, babylon] = await labelsFor(trainer.id);
    const startsOn = dayKey(3);

    await dailyRule(personal.id, 3);
    await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn,
        labelId: babylon.id,
        size: "medium",
        frequency: "weekly",
        // The weekday the series already starts on, so its dates are the start
        // date and every seventh day after it.
        dayOfWeek: String(dayKeyToUtcDate(startsOn).getUTCDay()),
      }),
    );

    await setLastSettledDay(trainer.id, dayKey(3));
    await settleOnEntry();

    const tasks = await tasksFor(trainer.id);
    const datesFor = (title: string) =>
      tasks.filter((task) => task.title === title).map((task) => task.dueDate);

    expect(datesFor("Water the plants")).toEqual([dayKey(3), dayKey(2), dayKey(1), dayKey(0), dayKey(-1)]);
    // A week's lead, not a day's: the horizon is one interval of the rule being
    // generated, so the weekly rule reaches next week rather than tomorrow.
    expect(datesFor("Bins out")).toEqual([dayKey(3), dayKey(-4)]);
  });

  it("leaves the dates it missed in overdue while the new ones land in today and tomorrow", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await dailyRule(personal.id, 3);

    await setLastSettledDay(trainer.id, dayKey(3));
    await settleOnEntry();

    // A generated task is bucketed by its due date like any other; missing one
    // does not stop the next arriving.
    const buckets = bucketOpenTasks(await tasksFor(trainer.id), dayKey(0));
    expect(buckets.overdue.map((task) => task.dueDate)).toEqual([dayKey(3), dayKey(2), dayKey(1)]);
    expect(buckets.today.map((task) => task.dueDate)).toEqual([dayKey(0)]);
    expect(buckets.tomorrow.map((task) => task.dueDate)).toEqual([dayKey(-1)]);
    expect(buckets.later).toEqual([]);
  });
});

describe("opening the app again", () => {
  it("produces no duplicates the second time the same day", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await dailyRule(personal.id, 2);

    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    const afterFirst = await dueDatesFor(trainer.id);

    await rewindSettlement(trainer.id, dayKey(2));
    await settleOnEntry();

    expect(await dueDatesFor(trainer.id)).toEqual(afterFirst);
  });

  it("leaves a rule created after the day's first entry on its one creation task until tomorrow", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    // The day's entry has already happened and settled what it owed, so a rule
    // created now finds no owed day left to carry it — the gate that keeps
    // generation to once a day is also what defers its lead by one. Creation
    // gives it exactly one task (#13) and tomorrow's entry gives it the rest.
    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    await dailyRule(personal.id, 0);

    await settleOnEntry();

    expect(await dueDatesFor(trainer.id)).toEqual([dayKey(0)]);
  });

  it("produces nothing new when the pending task has already been completed early", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await dailyRule(personal.id, 2);

    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    const afterFirst = await dueDatesFor(trainer.id);

    // Tomorrow's task, done today. Its date has already been generated and the
    // watermark has already passed it, so nothing takes its place — working
    // ahead is free and can never pay twice (ADR-0010).
    const tomorrow = (await tasksFor(trainer.id)).find((task) => task.dueDate === dayKey(-1));
    const { error } = await adminClient()
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", tomorrow!.id);
    if (error) throw new Error(JSON.stringify(error));

    await rewindSettlement(trainer.id, dayKey(2));
    await settleOnEntry();

    expect(await dueDatesFor(trainer.id)).toEqual(afterFirst);
  });
});

describe("a generated task is a task like any other", () => {
  it("is worth nothing while it is open, and its effort points on the day it is completed", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await dailyRule(personal.id, 2, { size: "large" });

    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();

    // Yesterday had a generated task on it and settled at zero: an open task is
    // worth nothing, so no settled day changes meaning (ADR-0010).
    expect(await ledgerFor(trainer.id)).toEqual([{ day: dayKey(1), points_earned: 0 }]);

    const yesterdays = (await tasksFor(trainer.id)).find((task) => task.dueDate === dayKey(1));
    const { error } = await adminClient()
      .from("tasks")
      .update({ status: "done", completed_at: noonOf(dayKey(1)) })
      .eq("id", yesterdays!.id);
    if (error) throw new Error(JSON.stringify(error));

    await rewindSettlement(trainer.id, dayKey(2));
    await settleOnEntry();

    // Its size is the rule's, and it counts toward the daily target exactly as
    // a hand-typed task of that size would.
    expect(await ledgerFor(trainer.id)).toEqual([{ day: dayKey(1), points_earned: EFFORT_POINTS.large }]);
  });
});

describe("a rule that cannot be generated", () => {
  /**
   * Only service-role can put a rule in this state; row-level security refuses
   * it to a trainer's own JWT. Generation runs as service-role too, so it does
   * not get to assume it cannot happen — a task carrying a foreign label reads
   * back with a null label and crashes the label chip's render rather than
   * merely hiding data.
   */
  async function ruleWithAForeignLabel(trainerId: string, labelId: string) {
    await dailyRule(labelId, 2);

    const rivalJar = createCookieJar();
    const rival = await signedInTrainer(RIVAL, rivalJar);
    const [rivalLabel] = await labelsFor(rival.id);
    const { error } = await adminClient()
      .from("recurrence")
      .update({ label_id: rivalLabel.id })
      .eq("trainer_id", trainerId);
    if (error) throw new Error(JSON.stringify(error));
  }

  it("generates nothing rather than stamping a label the trainer does not own", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await ruleWithAForeignLabel(trainer.id, personal.id);

    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();

    expect(await dueDatesFor(trainer.id)).toEqual([dayKey(2)]);
  });

  it("does not cost the trainer their ledger", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await ruleWithAForeignLabel(trainer.id, personal.id);

    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();

    // Settlement is triggered by a client effect that swallows every error, so
    // a rule generation cannot write has to degrade rather than throw: the day
    // still settles and the happiness ledger is still written.
    expect((await ledgerFor(trainer.id)).map((row) => row.day)).toEqual([dayKey(1)]);
  });
});
