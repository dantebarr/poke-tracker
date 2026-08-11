import type { SupabaseClient } from "@supabase/supabase-js";

import type { LedgerOutcome } from "@/lib/settlement/reducer";
import { DatabaseError } from "@/lib/supabase/errors";

/**
 * A settled day, as the history screen (#11) reads it. `event` is the row's
 * own stored `outcome` — settlement (ADR-0007) already knows the day it
 * happened on, so nothing here infers it from a neighbouring row. `pokemon`
 * names the instance the day concerned — nickname if the trainer set one,
 * the species' name otherwise — resolved from the instance's *current*
 * record, since day_ledger snapshots the target and the points but not the
 * species (the settlement migration's comment). Null on a day that
 * concerned no instance at all.
 */
export type DayLedgerEntry = {
  day: string;
  pointsEarned: number;
  target: number;
  delta: number;
  event: LedgerOutcome;
  pokemon: { name: string; spritePath: string } | null;
};

type DayLedgerRow = {
  day: string;
  points_earned: number;
  target: number;
  delta: number;
  outcome: LedgerOutcome;
  instance: {
    nickname: string | null;
    species: { name: string; sprite_path: string };
  } | null;
};

const COLUMNS =
  "day, points_earned, target, delta, outcome, instance:active_instance_id(nickname, species:species_id(name, sprite_path))";

/**
 * A trainer's settled days, most recent first — today never appears, since
 * settlement never settles it (CONTEXT.md). Row-level security scopes this to
 * the caller's own; the underlying table grants no write to anyone but the
 * settlement function, so this can never race a concurrent edit to a
 * settled day.
 */
export async function listDayLedger(client: SupabaseClient, trainerId: string): Promise<DayLedgerEntry[]> {
  const { data, error } = await client
    .from("day_ledger")
    .select(COLUMNS)
    .eq("trainer_id", trainerId)
    .order("day", { ascending: true })
    .returns<DayLedgerRow[]>();

  if (error) {
    throw new DatabaseError("Listing day ledger", error);
  }

  return data
    .map((row) => ({
      day: row.day,
      pointsEarned: row.points_earned,
      target: row.target,
      delta: row.delta,
      event: row.outcome,
      pokemon: row.instance
        ? { name: row.instance.nickname ?? row.instance.species.name, spritePath: row.instance.species.sprite_path }
        : null,
    }))
    .reverse();
}

/**
 * What the most recently settled day did, for Warden Baoba's dialogue tray
 * (#23) to narrate — see CONTEXT.md's "Warden Baoba" entry: he states facts
 * the loop already computed, never a second source of truth for them.
 * `pokemonName` only matters for `event: "left"`, the one case where the
 * Pokémon concerned is no longer the trainer's active one. Null when the
 * trainer has no settled days yet.
 */
export type LatestDayLedgerEvent = {
  event: LedgerOutcome;
  pokemonName: string | null;
  delta: number;
} | null;

type LatestDayLedgerRow = {
  delta: number;
  outcome: LedgerOutcome;
  instance: { nickname: string | null; species: { name: string } } | null;
};

const LATEST_COLUMNS = "delta, outcome, instance:active_instance_id(nickname, species:species_id(name))";

/**
 * The single most recently settled day — the one Baoba narrates. `outcome`
 * is read straight off that row (ADR-0007): the field screen never needs to
 * look at the day before it to know what this one did.
 */
export async function findLatestDayLedgerEvent(
  client: SupabaseClient,
  trainerId: string,
): Promise<LatestDayLedgerEvent> {
  const { data, error } = await client
    .from("day_ledger")
    .select(LATEST_COLUMNS)
    .eq("trainer_id", trainerId)
    .order("day", { ascending: false })
    .limit(1)
    .returns<LatestDayLedgerRow[]>();

  if (error) {
    throw new DatabaseError("Reading latest day ledger event", error);
  }
  if (data.length === 0) {
    return null;
  }

  const [latest] = data;
  return {
    event: latest.outcome,
    pokemonName: latest.instance ? (latest.instance.nickname ?? latest.instance.species.name) : null,
    delta: latest.delta,
  };
}
