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
  happiness: number;
  lastSettledDay: string | null;
  timezone: string | null;
};

/** Who a signed-in account is, as far as provisioning is concerned. */
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
  happiness: number;
  last_settled_day: string | null;
  timezone: string | null;
};

const COLUMNS =
  "id, email, display_name, daily_target, happiness, last_settled_day, timezone";

function toTrainer(row: TrainerRow): Trainer {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    dailyTarget: row.daily_target,
    happiness: row.happiness,
    lastSettledDay: row.last_settled_day,
    timezone: row.timezone,
  };
}

/**
 * Gives an allow-listed account its trainer record, or hands back the one it
 * already has. Signing in a second time reuses the existing record rather than
 * creating a second one, and leaves everything the trainer has since changed —
 * their daily target, their happiness — untouched.
 *
 * Written as a single upsert rather than a read-then-write so that two sign-ins
 * racing each other cannot produce two rows or a spurious failure.
 *
 * The caller is responsible for the allow-list check. This function is reached
 * only once that has passed.
 */
export async function provisionTrainer(
  client: SupabaseClient,
  identity: TrainerIdentity,
): Promise<Trainer> {
  const row = unwrap(
    "Provisioning trainer",
    await client
      .from("trainer")
      .upsert(
        {
          id: identity.id,
          email: identity.email,
          display_name: identity.displayName,
        },
        { onConflict: "id" },
      )
      .select(COLUMNS)
      .single<TrainerRow>(),
  );

  return toTrainer(row);
}

/**
 * The trainer record for the given account, or null if there is none. Under
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
