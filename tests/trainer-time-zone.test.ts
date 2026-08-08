import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, insertTask, labelsFor, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way settlement.test.ts does — see trainer-provisioning.test.ts for
 * the fuller rationale on the `next/headers` mock.
 *
 * This suite covers what settlement.test.ts's forced `last_settled_day`
 * deliberately can't: the seeding trigger itself, and a trainer settling
 * through the real sign-in path with nothing forced at all — which is
 * exactly the shape of the bug that shipped (#17). The forcing technique
 * remains valid for settlement.test.ts's own scenarios, which exercise the
 * reducer's commit behaviour rather than provisioning.
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

const { ensureTrainer, updateTimeZoneAction } = await import("@/app/actions/trainer");
const { settleOnEntry } = await import("@/app/actions/settlement");
const { addDays, dayKeyInTimeZone } = await import("@/lib/day/day");
const { DatabaseError } = await import("@/lib/supabase/errors");

const ALLOW_LISTED = "dawn@twinleaf.example";
// The schema's own default (20260808120000_trainer_time_zone.sql) — a
// freshly-provisioned trainer who hasn't visited Settings yet gets this,
// never anything detected from a browser.
const DEFAULT_ZONE = "America/Vancouver";

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = ALLOW_LISTED;
});

afterEach(async () => {
  vi.useRealTimers();
  for (const id of created) {
    await deleteAccount(id);
  }
  jarRef.current = null;
});

type TrainerRow = {
  last_settled_day: string;
  created_at: string;
  time_zone: string;
};

async function trainerRow(trainerId: string): Promise<TrainerRow> {
  const { data, error } = await adminClient()
    .from("trainer")
    .select("last_settled_day, created_at, time_zone")
    .eq("id", trainerId)
    .single<TrainerRow>();
  if (error) throw new Error(`Reading trainer failed: ${JSON.stringify(error)}`);
  return data;
}

type LedgerRow = { day: string; points_earned: number; outcome: string };

async function ledgerFor(trainerId: string): Promise<LedgerRow[]> {
  const { data, error } = await adminClient()
    .from("day_ledger")
    .select("day, points_earned, outcome")
    .eq("trainer_id", trainerId)
    .order("day")
    .returns<LedgerRow[]>();
  if (error) throw new Error(`Reading ledger failed: ${JSON.stringify(error)}`);
  return data;
}

describe("seeding last_settled_day at signup", () => {
  it("seeds the day before the trainer's local creation day, across zones spanning the offset range", async () => {
    // Far east, UTC, and far west of it: whichever hour this suite happens
    // to run, at least one of these differs from the others' local date —
    // the exact shape of the production failure (a trainer west of UTC,
    // signing up in the evening, lost a day nobody west of UTC would lose
    // if the watermark were computed in the server's own zone).
    const zones = ["Pacific/Kiritimati", "UTC", "Pacific/Pago_Pago"];

    for (const zone of zones) {
      const account = await createAccount(`${zone.replace("/", "-")}@kanto.example`);
      created.push(account.id);

      const beforeInsert = new Date();
      const { data, error } = await adminClient()
        .from("trainer")
        .insert({ id: account.id, email: account.email, time_zone: zone })
        .select("last_settled_day, created_at")
        .single<{ last_settled_day: string; created_at: string }>();
      if (error) throw new Error(`Inserting trainer failed: ${JSON.stringify(error)}`);

      // The trigger computes from Postgres's own `now()`, not this
      // process's clock — `created_at` (also `now()`, same statement) is
      // the trustworthy anchor, not `beforeInsert`. `beforeInsert` is only
      // a sanity bound: the insert cannot have taken so long that the two
      // clocks landed on different local dates in every zone under test.
      expect(new Date(data.created_at).getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 5000);

      const localCreationDay = dayKeyInTimeZone(new Date(data.created_at), zone);
      expect(data.last_settled_day).toBe(addDays(localCreationDay, -1));
    }
  });

  it("cannot be forged by a trainer's own JWT supplying a chosen value", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);
    await signIn(jar, account);

    const { error } = await clientForJar(jar).from("trainer").insert({
      id: account.id,
      email: account.email,
      last_settled_day: "2099-01-01",
    });
    expect(error).toBeNull();

    const row = await trainerRow(account.id);
    expect(row.last_settled_day).not.toBe("2099-01-01");
    expect(row.last_settled_day).toBe(addDays(dayKeyInTimeZone(new Date(row.created_at), row.time_zone), -1));
  });

  it("refuses a time zone that isn't a real IANA name", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);

    const { error } = await adminClient()
      .from("trainer")
      .insert({ id: account.id, email: account.email, time_zone: "Mars/Cydonia" });

    expect(error).not.toBeNull();
  });
});

describe("a trainer provisioned through the real sign-in path, with nothing forced", () => {
  it("settles their creation day, and only their creation day, the next time they open the app", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);
    await signIn(jar, account);

    // A task predating the account entirely — adopted-from-elsewhere task
    // history, the exact shape #17 was filed over. It must never surface in
    // settlement: there is no day in `days` it could land in.
    const longAgo = new Date();
    longAgo.setUTCDate(longAgo.getUTCDate() - 30);

    const trainer = await ensureTrainer();
    const [label] = await labelsFor(trainer.id);
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: longAgo.toISOString(),
    });

    const creationRow = await trainerRow(trainer.id);
    const creationDay = dayKeyInTimeZone(new Date(creationRow.created_at), DEFAULT_ZONE);
    expect(creationRow.last_settled_day).toBe(addDays(creationDay, -1));

    // Effort actually earned on the creation day itself — three large-task
    // points, exactly meeting the default target of 3.
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: new Date().toISOString(),
    });

    // A faked clock doesn't move Postgres's — the trigger already seeded
    // from the real database time above. Advancing the clock here only
    // moves what application code (this settle() call) computes as "today".
    // A flat 24-hour jump, computed before the clock is faked, guarantees
    // the next calendar day in any zone without machine-local-time or DST
    // ambiguity.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(tomorrow);

    await settleOnEntry();

    const ledger = await ledgerFor(trainer.id);
    expect(ledger).toEqual([{ day: creationDay, points_earned: 3, outcome: "bond" }]);

    // Opening the app again the same (faked) day settles nothing further.
    await settleOnEntry();
    expect(await ledgerFor(trainer.id)).toEqual(ledger);
  });
});

describe("saving a time zone from Settings", () => {
  it("succeeds for a valid zone and changes the trainer's stored value", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);
    await signIn(jar, account);
    await ensureTrainer();

    const formData = new FormData();
    formData.set("timeZone", "Europe/London");
    const updated = await updateTimeZoneAction(formData);

    expect(updated.timeZone).toBe("Europe/London");
    expect((await trainerRow(updated.id)).time_zone).toBe("Europe/London");
  });

  it("is rejected by the database for an invalid zone", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);
    await signIn(jar, account);
    await ensureTrainer();

    const formData = new FormData();
    formData.set("timeZone", "Not/AZone");

    await expect(updateTimeZoneAction(formData)).rejects.toBeInstanceOf(DatabaseError);
  });
});
