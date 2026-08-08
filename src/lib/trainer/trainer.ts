import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError, unwrap } from "@/lib/supabase/errors";

/**
 * A trainer, as the app reads one. The database column names are an
 * implementation detail that stops here.
 */
export type Trainer = {
  id: string;
  email: string;
  displayName: string | null;
  dailyTarget: number;
  timeZone: string;
};

/**
 * Who a signed-in Google account is, as far as provisioning is concerned.
 *
 * Deliberately not a Trainer: this is the Supabase auth identity, which exists
 * for every account that completes Google sign-in, including the ones the
 * allow-list is about to turn away.
 */
export type TrainerIdentity = {
  id: string;
  email: string;
  displayName: string | null;
};

type TrainerRow = {
  id: string;
  email: string;
  display_name: string | null;
  daily_target: number;
  time_zone: string;
};

const COLUMNS = "id, email, display_name, daily_target, time_zone";

function toTrainer(row: TrainerRow): Trainer {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    dailyTarget: row.daily_target,
    timeZone: row.time_zone,
  };
}

/**
 * Gives an allow-listed identity its trainer record, or hands back the one it
 * already has. Signing in a second time reuses the existing record rather than
 * creating a second one, and leaves everything the trainer has since changed
 * untouched.
 *
 * Insert-or-nothing rather than a read-then-insert, so two sign-ins racing each
 * other cannot produce two rows or a spurious failure — and rather than a true
 * upsert, so that provisioning needs no update privilege whatsoever. A
 * trainer's own JWT may change their daily target and nothing else.
 *
 * The caller is responsible for the allow-list check. This function is reached
 * only once that has passed.
 */
export async function provisionTrainer(
  client: SupabaseClient,
  identity: TrainerIdentity,
): Promise<Trainer> {
  const { error } = await client.from("trainer").upsert(
    {
      id: identity.id,
      email: identity.email,
      display_name: identity.displayName,
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (error) {
    throw new DatabaseError("Provisioning trainer", error);
  }

  const trainer = await findTrainer(client, identity.id);
  if (!trainer) {
    // Only reachable if the row were deleted between the two statements, and
    // nothing is granted delete.
    throw new Error("Provisioning trainer: the record was not there afterwards");
  }
  return trainer;
}

/**
 * The trainer record for the given identity, or null if there is none. Under
 * row-level security this can only ever return the caller's own row.
 */
export async function findTrainer(
  client: SupabaseClient,
  id: string,
): Promise<Trainer | null> {
  const { data, error } = await client
    .from("trainer")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle<TrainerRow>();

  // Not `unwrap`: here a missing row is an answer, not a failure.
  if (error) {
    throw new DatabaseError("Reading trainer", error);
  }

  return data ? toTrainer(data) : null;
}

/**
 * Sets the trainer's daily target. A target below 1 would make every absent
 * day neutral, so neglect would earn Pokémon instead of costing them — the
 * check constraint refuses it, not this function (ADR-0001).
 *
 * Only ever future-facing: nothing already settled reads today's target, so
 * changing it cannot rewrite what a past day was worth.
 */
export async function updateDailyTarget(
  client: SupabaseClient,
  trainerId: string,
  target: number,
): Promise<Trainer> {
  const row = unwrap(
    "Setting daily target",
    await client
      .from("trainer")
      .update({ daily_target: target })
      .eq("id", trainerId)
      .select(COLUMNS)
      .single<TrainerRow>(),
  );
  return toTrainer(row);
}

/**
 * Sets the trainer's time zone. Never detected from the browser (ADR-0004) —
 * this is the only way it changes, and it is always the trainer's own act.
 * An invalid IANA name is refused by the database's own validation trigger,
 * not here (ADR-0001).
 */
export async function updateTimeZone(
  client: SupabaseClient,
  trainerId: string,
  timeZone: string,
): Promise<Trainer> {
  const row = unwrap(
    "Setting time zone",
    await client
      .from("trainer")
      .update({ time_zone: timeZone })
      .eq("id", trainerId)
      .select(COLUMNS)
      .single<TrainerRow>(),
  );
  return toTrainer(row);
}
