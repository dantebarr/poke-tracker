import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveDayLedgerEvent, type DayLedgerEvent } from "@/lib/settlement/ledger-events";
import type { LedgerOutcome } from "@/lib/settlement/reducer";
import { DatabaseError } from "@/lib/supabase/errors";

/**
 * A settled day, as the history screen (#11) reads it. `pokemon` names the
 * instance the day concerned — nickname if the trainer set one, the species'
 * name otherwise — resolved from the instance's *current* record, since
 * day_ledger snapshots the target and the points but not the species (the
 * settlement migration's comment). Null on a day that concerned no instance
 * at all.
 */
export type DayLedgerEntry = {
  day: string;
  pointsEarned: number;
  target: number;
  delta: number;
  event: DayLedgerEvent;
  pokemon: { name: string; spritePath: string } | null;
};

type DayLedgerRow = {
  day: string;
  points_earned: number;
  target: number;
  delta: number;
  outcome: LedgerOutcome;
  active_instance_id: string | null;
  instance: {
    nickname: string | null;
    species: { name: string; sprite_path: string };
  } | null;
};

const COLUMNS =
  "day, points_earned, target, delta, outcome, active_instance_id, instance:active_instance_id(nickname, species:species_id(name, sprite_path))";

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

  const entries: DayLedgerEntry[] = [];
  let previousInstanceId: string | null = null;
  for (const row of data) {
    entries.push({
      day: row.day,
      pointsEarned: row.points_earned,
      target: row.target,
      delta: row.delta,
      event: deriveDayLedgerEvent({
        outcome: row.outcome,
        activeInstanceId: row.active_instance_id,
        previousInstanceId,
      }),
      pokemon: row.instance
        ? { name: row.instance.nickname ?? row.instance.species.name, spritePath: row.instance.species.sprite_path }
        : null,
    });
    previousInstanceId = row.active_instance_id;
  }

  return entries.reverse();
}
