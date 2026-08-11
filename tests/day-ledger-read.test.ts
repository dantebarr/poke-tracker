import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, insertTask, labelsFor, signIn } from "./helpers/supabase";

/**
 * The history screen's read side (#11), against the real schema: the joins
 * to instance and species, row-level security, and ordering. `event` is read
 * straight off the stored `outcome` (ADR-0007), so there is no separate
 * inference logic to cover here. Settlement itself (the trigger, the ledger
 * rows it produces) is covered in settlement.test.ts. This suite only proves
 * `listDayLedger` reads what settlement already wrote, correctly.
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
const { listDayLedger } = await import("@/lib/settlement/ledger");

const ALLOW_LISTED = "misty@cerulean.example";
const RIVAL = "brock@pewter.example";
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

async function speciesNameOf(instanceId: string): Promise<string> {
  const { data, error } = await adminClient()
    .from("instance")
    .select("species:species_id(name)")
    .eq("id", instanceId)
    .single<{ species: { name: string } }>();
  if (error) throw new Error(`Reading instance failed: ${JSON.stringify(error)}`);
  return data.species.name;
}

describe("reading the day ledger", () => {
  it("returns nothing for a trainer with no settled days", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    expect(await listDayLedger(clientForJar(jar), trainer.id)).toEqual([]);
  });

  it("orders settled days most recent first, and never includes today", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    await setLastSettledDay(trainer.id, dayKey(3));
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(2)),
    });

    await settleOnEntry();

    const ledger = await listDayLedger(clientForJar(jar), trainer.id);
    expect(ledger.map((entry) => entry.day)).toEqual([dayKey(1), dayKey(2)]);
    expect(ledger.some((entry) => entry.day === dayKey(0))).toBe(false);
  });

  it("reports points earned, the target at the time, and the delta", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    await setLastSettledDay(trainer.id, dayKey(2));
    await insertTask({
      trainerId: trainer.id,
      labelId: label.id,
      size: "large",
      status: "done",
      completedAt: noonOf(dayKey(1)),
    });

    await settleOnEntry();

    const [entry] = await listDayLedger(clientForJar(jar), trainer.id);
    expect(entry).toMatchObject({ day: dayKey(1), pointsEarned: 3, target: 3, delta: 0, event: "bond" });
  });

  it("names which Pokémon left, on the day it left", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const trainerRowBefore = await adminClient()
      .from("trainer")
      .select("active_instance_id")
      .eq("id", trainer.id)
      .single<{ active_instance_id: string }>();
    const leavingInstanceId = trainerRowBefore.data!.active_instance_id;
    const speciesName = await speciesNameOf(leavingInstanceId);

    await setLastSettledDay(trainer.id, dayKey(2));
    // No completions: happiness starts at 0, so the first missed day sends it negative.

    await settleOnEntry();

    const ledger = await listDayLedger(clientForJar(jar), trainer.id);
    const leftEntry = ledger.find((entry) => entry.event === "left");
    expect(leftEntry).toMatchObject({ pokemon: { name: speciesName } });
  });

  it("marks the Approaching day distinct from an ordinary uneventful day, naming no Pokémon", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    const { error } = await adminClient().from("trainer").update({ active_instance_id: null }).eq("id", trainer.id);
    if (error) throw new Error(JSON.stringify(error));

    await setLastSettledDay(trainer.id, dayKey(3));
    // Two days ago meets target (2 large tasks = 6 vs target 3): the
    // Approaching day. Yesterday is untouched, an ordinary day for the
    // Arrival it earned.
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

    await settleOnEntry();

    const ledger = await listDayLedger(clientForJar(jar), trainer.id);
    const approachingEntry = ledger.find((entry) => entry.day === dayKey(2));
    expect(approachingEntry?.event).toBe("approaching");
    expect(approachingEntry?.pokemon).toBeNull();

    const arrivalDayEntry = ledger.find((entry) => entry.day === dayKey(1));
    expect(arrivalDayEntry?.pokemon).not.toBeNull();
  });

  it("hides one trainer's ledger from another", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    expect(await listDayLedger(clientForJar(jar), trainer.id)).not.toEqual([]);

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(RIVAL);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);

    expect(await listDayLedger(clientForJar(rivalJar), trainer.id)).toEqual([]);
  });
});
