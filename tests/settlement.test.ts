import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import {
  adminClient,
  clientForJar,
  createAccount,
  deleteAccount,
  insertTask,
  labelsFor,
  signIn,
} from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way every other suite touching a server action does — see
 * trainer-provisioning.test.ts for the fuller rationale on the
 * `next/headers` mock.
 *
 * The pure day-by-day decision logic is tested with no database at all in
 * settlement-reducer.test.ts; this suite covers what only the real schema
 * can prove — the trigger, the transaction, permanence, and row-level
 * security.
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
const { settleOnEntry } = await import("@/app/actions/settlement");
const { dayKeyInTimeZone } = await import("@/lib/day/day");
const { NotSignedInError } = await import("@/lib/trainer/errors");

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
 * Every existing test in this file settles forced-past days rather than the
 * creation day itself, so it needs a stable, known zone to compute expected
 * day keys against — UTC, matching `TIME_ZONE`. Real trainers keep whatever
 * zone they set in Settings (America/Vancouver by default); the seeding
 * trigger's own zone handling is covered without this override in
 * trainer-time-zone.test.ts.
 */
async function signedInTrainer(email: string) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(jar, account);
  const trainer = await ensureTrainer();
  await setTimeZone(trainer.id, TIME_ZONE);
  return trainer;
}

async function setTimeZone(trainerId: string, timeZone: string) {
  const { error } = await adminClient().from("trainer").update({ time_zone: timeZone }).eq("id", trainerId);
  if (error) throw new Error(`Forcing time_zone failed: ${JSON.stringify(error)}`);
}

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

type TrainerSettlementRow = {
  happiness: number;
  active_instance_id: string | null;
  last_settled_day: string;
};

async function trainerRow(trainerId: string): Promise<TrainerSettlementRow> {
  const { data, error } = await adminClient()
    .from("trainer")
    .select("happiness, active_instance_id, last_settled_day")
    .eq("id", trainerId)
    .single<TrainerSettlementRow>();
  if (error) throw new Error(`Reading trainer failed: ${JSON.stringify(error)}`);
  return data;
}

type LedgerRow = {
  day: string;
  points_earned: number;
  target: number;
  delta: number;
  happiness_after: number;
  active_instance_id: string | null;
  outcome: string;
};

async function ledgerFor(trainerId: string): Promise<LedgerRow[]> {
  const { data, error } = await adminClient()
    .from("day_ledger")
    .select("day, points_earned, target, delta, happiness_after, active_instance_id, outcome")
    .eq("trainer_id", trainerId)
    .order("day")
    .returns<LedgerRow[]>();
  if (error) throw new Error(`Reading ledger failed: ${JSON.stringify(error)}`);
  return data;
}

async function bondLevelOf(instanceId: string): Promise<number> {
  const { data, error } = await adminClient()
    .from("instance")
    .select("bond_level")
    .eq("id", instanceId)
    .single<{ bond_level: number }>();
  if (error) throw new Error(`Reading bond level failed: ${JSON.stringify(error)}`);
  return data.bond_level;
}

describe("triggering settlement", () => {
  it("refuses without a session", async () => {
    await expect(settleOnEntry()).rejects.toBeInstanceOf(NotSignedInError);
  });

  it("does nothing, and writes nothing, for a freshly-created trainer — their creation day isn't owed yet", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    // Seeded to the day before creation, in whatever zone was in effect at
    // INSERT time (the schema default — `signedInTrainer`'s own
    // `setTimeZone` call runs after the row already exists, so it has no
    // effect on the seeded value). Read it back rather than recomputing it
    // against a different zone, which trainer-time-zone.test.ts already
    // covers directly.
    const before = await trainerRow(trainer.id);

    await settleOnEntry();

    // Today is the creation day itself, which never settles while still in
    // progress, so there is nothing to do yet and the watermark stays put.
    expect(await ledgerFor(trainer.id)).toEqual([]);
    expect((await trainerRow(trainer.id)).last_settled_day).toBe(before.last_settled_day);
  });
});

describe("settling missed days", () => {
  it("settles one row per day, oldest first, stopping before today, counting an unopened day as zero", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    await setLastSettledDay(trainer.id, dayKey(3));

    // Two days are owed (2 and 1 days ago; 3 days ago is the already-settled
    // anchor and today is never settled). Only the first has any
    // completions -- the second is the trainer never having opened the app.
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(2)),
    });

    await settleOnEntry();

    const ledger = await ledgerFor(trainer.id);
    expect(ledger.map((row) => row.day)).toEqual([dayKey(2), dayKey(1)]);
    expect(ledger.map((row) => row.points_earned)).toEqual([3, 0]);
    expect(ledger.some((row) => row.day === dayKey(0))).toBe(false);
  });

  it("is a no-op the second time the app opens the same day", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await setLastSettledDay(trainer.id, dayKey(2));

    await settleOnEntry();
    const afterFirst = await ledgerFor(trainer.id);
    const stateAfterFirst = await trainerRow(trainer.id);

    await settleOnEntry();
    const afterSecond = await ledgerFor(trainer.id);
    const stateAfterSecond = await trainerRow(trainer.id);

    expect(afterSecond).toEqual(afterFirst);
    expect(stateAfterSecond).toEqual(stateAfterFirst);
  });

  it("refuses to rewrite an already-settled day even when re-triggered", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await setLastSettledDay(trainer.id, dayKey(2));

    await settleOnEntry();
    const settledDay = dayKey(1);
    expect((await ledgerFor(trainer.id)).map((row) => row.day)).toContain(settledDay);

    // Not reachable through the app, which only ever advances
    // last_settled_day forward -- this simulates it happening anyway, to
    // prove the database's own uniqueness constraint, not just the app's
    // own care, is what makes a settled day permanent.
    await setLastSettledDay(trainer.id, dayKey(2));
    await expect(settleOnEntry()).rejects.toThrow();

    const ledger = await ledgerFor(trainer.id);
    expect(ledger.filter((row) => row.day === settledDay)).toHaveLength(1);
  });
});

describe("what a day does to the active Pokémon", () => {
  it("raises happiness and bond on a day at or above target", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    const before = await trainerRow(trainer.id);
    const activeId = before.active_instance_id;
    expect(activeId).not.toBeNull();
    const bondBefore = await bondLevelOf(activeId!);

    await setLastSettledDay(trainer.id, dayKey(2));
    // Exactly the default daily target (3): a delta of zero, still a good day.
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(1)),
    });

    await settleOnEntry();

    const after = await trainerRow(trainer.id);
    expect(after.active_instance_id).toBe(activeId);
    expect(after.happiness).toBe(before.happiness);
    expect(await bondLevelOf(activeId!)).toBe(bondBefore + 1);

    const ledger = await ledgerFor(trainer.id);
    expect(ledger[0]).toMatchObject({
      day: dayKey(1),
      delta: 0,
      outcome: "bond",
      active_instance_id: activeId,
    });
  });

  it("clears the active Pokémon when happiness falls below zero, keeping its bond", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const before = await trainerRow(trainer.id);
    const activeId = before.active_instance_id!;
    const bondBefore = await bondLevelOf(activeId);

    await setLastSettledDay(trainer.id, dayKey(2));
    // No completions: a full absence. Default target 3 and happiness
    // starting at 0 sends it negative on the very first missed day.

    await settleOnEntry();

    const after = await trainerRow(trainer.id);
    expect(after.active_instance_id).toBeNull();
    expect(after.happiness).toBe(0);
    expect(await bondLevelOf(activeId)).toBe(bondBefore);

    const ledger = await ledgerFor(trainer.id);
    expect(ledger.some((row) => row.outcome === "left" && row.active_instance_id === activeId)).toBe(true);
  });

  it("draws an Arrival on the Approaching day itself, active from the very next day settled", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);

    const { error } = await adminClient()
      .from("trainer")
      .update({ active_instance_id: null })
      .eq("id", trainer.id);
    if (error) throw new Error(JSON.stringify(error));

    await setLastSettledDay(trainer.id, dayKey(3));
    // Two days ago meets target (2 large tasks = 6 vs target 3, delta 3): the
    // Approaching day. Yesterday exactly meets target too (1 large task, delta
    // 0), the Arrival's first day — an ordinary bond day, its own effort
    // counted rather than discarded (ADR-0007).
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(2)),
    });
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(2)),
    });
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(1)),
    });

    await settleOnEntry();

    const after = await trainerRow(trainer.id);
    expect(after.active_instance_id).not.toBeNull();
    expect(after.happiness).toBe(3);

    const ledger = await ledgerFor(trainer.id);
    const approachingRow = ledger.find((row) => row.day === dayKey(2));
    expect(approachingRow).toMatchObject({ outcome: "approaching", active_instance_id: null, happiness_after: 0 });

    const arrivalRow = ledger.find((row) => row.day === dayKey(1));
    expect(arrivalRow).toMatchObject({
      outcome: "bond",
      active_instance_id: after.active_instance_id,
      happiness_after: 3,
    });
    expect(await bondLevelOf(after.active_instance_id!)).toBe(1);

    const { data: ownedInstance } = await adminClient()
      .from("instance")
      .select("id")
      .eq("id", after.active_instance_id!)
      .eq("trainer_id", trainer.id)
      .maybeSingle();
    expect(ownedInstance).not.toBeNull();
  });

  it("draws an Arrival even when the Approaching day is the last one settled", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);

    const { error } = await adminClient()
      .from("trainer")
      .update({ active_instance_id: null })
      .eq("id", trainer.id);
    if (error) throw new Error(JSON.stringify(error));

    await setLastSettledDay(trainer.id, dayKey(2));
    // Yesterday meets target (2 large tasks = 6 vs target 3, delta 3) and is
    // the last day this run settles — the bug ADR-0007 fixes: a trainer who
    // hits their target must not go a second day without a Pokémon.
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(1)),
    });
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(1)),
    });

    await settleOnEntry();

    const after = await trainerRow(trainer.id);
    expect(after.active_instance_id).not.toBeNull();
    expect(after.happiness).toBe(3);

    const ledger = await ledgerFor(trainer.id);
    expect(ledger).toMatchObject([{ day: dayKey(1), outcome: "approaching", active_instance_id: null }]);
  });
});

describe("row-level security", () => {
  it("hides one trainer's ledger from another", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    expect(await ledgerFor(trainer.id)).not.toEqual([]);

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(RIVAL);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);

    const { data } = await clientForJar(rivalJar).from("day_ledger").select("id").eq("trainer_id", trainer.id);
    expect(data).toEqual([]);
  });

  it("refuses a trainer's own JWT writing to the ledger directly", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    const { error } = await clientForJar(jar).from("day_ledger").insert({
      trainer_id: trainer.id,
      day: dayKey(1),
      points_earned: 999,
      target: 1,
      delta: 998,
      happiness_after: 999,
      outcome: "bond",
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("refuses a trainer's own JWT calling apply_settlement at all, even naming themselves", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const before = await trainerRow(trainer.id);

    // apply_settlement trusts its jsonb input completely -- happiness, bond
    // increments, an arriving instance, all supplied wholesale rather than
    // derived from real task data. Only `service_role` (never a trainer's
    // own JWT, no matter whose id it names) may call it at all -- see
    // @/lib/supabase/service and the settlement migration's comment on why.
    const { error } = await clientForJar(jar).rpc("apply_settlement", {
      p_trainer_id: trainer.id,
      p_expected_last_settled_day: before.last_settled_day,
      p_rows: [],
      p_ending_happiness: 999999,
      p_ending_active_instance_id: before.active_instance_id,
      p_ending_last_settled_day: before.last_settled_day,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(await trainerRow(trainer.id)).toEqual(before);
  });

  it("refuses that same call naming another trainer, proving it isn't just an ownership check", async () => {
    await signedInTrainer(ALLOW_LISTED); // establishes `jar`'s session

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(RIVAL);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);
    jarRef.current = rivalJar;
    const rival = await ensureTrainer();
    jarRef.current = jar;

    const rivalBefore = await trainerRow(rival.id);

    const { error } = await clientForJar(jar).rpc("apply_settlement", {
      p_trainer_id: rival.id,
      p_expected_last_settled_day: rivalBefore.last_settled_day,
      p_rows: [],
      p_ending_happiness: 999999,
      p_ending_active_instance_id: rivalBefore.active_instance_id,
      p_ending_last_settled_day: rivalBefore.last_settled_day,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(await trainerRow(rival.id)).toEqual(rivalBefore);
  });
});
