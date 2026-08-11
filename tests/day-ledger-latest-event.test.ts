import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, insertTask, labelsFor, signIn } from "./helpers/supabase";

/**
 * `findLatestDayLedgerEvent` (#23), against the real schema: it reads only
 * the single most recent settled day rather than `listDayLedger`'s whole
 * history, so this proves it agrees with what `listDayLedger` already reads
 * — see day-ledger-read.test.ts for the fuller read-side coverage this
 * doesn't repeat.
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
const { findLatestDayLedgerEvent } = await import("@/lib/settlement/ledger");

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

describe("reading the latest day ledger event", () => {
  it("returns null for a trainer with no settled days", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    expect(await findLatestDayLedgerEvent(clientForJar(jar), trainer.id)).toBeNull();
  });

  it("reports the most recently settled day's delta, not an earlier day's", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    await setLastSettledDay(trainer.id, dayKey(3));
    // Two days ago: a surplus (delta 3). Yesterday: exactly on target (delta
    // 0). Both settle as "bond" days, so only the delta distinguishes which
    // one this read is supposed to have picked.
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

    const latest = await findLatestDayLedgerEvent(clientForJar(jar), trainer.id);
    expect(latest).toMatchObject({ event: "bond", delta: 0 });
  });

  it("names the Pokémon that left, on the day it left", async () => {
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

    const latest = await findLatestDayLedgerEvent(clientForJar(jar), trainer.id);
    expect(latest).toMatchObject({ event: "left", pokemonName: speciesName });
    expect(latest!.delta).toBeLessThan(0);
  });

  it("marks an Approaching day distinct from an ordinary uneventful day", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    const { error } = await adminClient().from("trainer").update({ active_instance_id: null }).eq("id", trainer.id);
    if (error) throw new Error(JSON.stringify(error));

    await setLastSettledDay(trainer.id, dayKey(2));
    // Yesterday meets target (2 large tasks = 6 vs target 3) and is the most
    // recent — and only — settled day: the Approaching day itself, naming no
    // Pokémon even though the draw already happened.
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

    const latest = await findLatestDayLedgerEvent(clientForJar(jar), trainer.id);
    expect(latest?.event).toBe("approaching");
    expect(latest?.pokemonName).toBeNull();
  });

  it("hides one trainer's latest event from another", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await setLastSettledDay(trainer.id, dayKey(2));
    await settleOnEntry();
    expect(await findLatestDayLedgerEvent(clientForJar(jar), trainer.id)).not.toBeNull();

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(RIVAL);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);

    expect(await findLatestDayLedgerEvent(clientForJar(rivalJar), trainer.id)).toBeNull();
  });
});
