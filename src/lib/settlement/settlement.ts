import type { SupabaseClient } from "@supabase/supabase-js";

import { settleDays, type SettlementState } from "@/lib/settlement/reducer";
import { addDays, dayKeyInTimeZone, daysToSettle, groupTasksByDay } from "@/lib/settlement/timezone";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { DatabaseError } from "@/lib/supabase/errors";
import type { TaskSize } from "@/lib/task/task";

type TrainerSettlementRow = {
  happiness: number;
  active_instance_id: string | null;
  last_settled_day: string;
  pending_arrival_delta: number | null;
  daily_target: number;
};

/**
 * Settles every day the trainer owes, up to yesterday, in `timeZone` — the
 * database access the pure reducer deliberately has none of. Safe to call on
 * every app entry: a trainer already caught up has no days to settle and
 * this makes no write at all.
 *
 * Reads run under `client` — the trainer's own JWT, scoped by row-level
 * security like every other read in this app. Only the commit switches to a
 * service-role client: see `@/lib/supabase/service` for why that one write
 * can't go through the trainer's own JWT the way everything else does.
 */
export async function settle(client: SupabaseClient, trainerId: string, timeZone: string): Promise<boolean> {
  const { data: trainerRow, error: trainerError } = await client
    .from("trainer")
    .select("happiness, active_instance_id, last_settled_day, pending_arrival_delta, daily_target")
    .eq("id", trainerId)
    .single<TrainerSettlementRow>();

  if (trainerError) {
    throw new DatabaseError("Reading trainer for settlement", trainerError);
  }

  const today = dayKeyInTimeZone(new Date(), timeZone);
  const days = daysToSettle(trainerRow.last_settled_day, today);
  if (days.length === 0) {
    return false;
  }

  // A generous lower bound, not an exact one: local midnight on the earliest
  // day owed can fall up to a day either side of its UTC date, depending on
  // the trainer's offset. Widening by a day only ever pulls in extra rows —
  // groupTasksByDay + the day keys below discard anything outside `days`.
  const earliestPossible = `${addDays(days[0], -1)}T00:00:00.000Z`;

  const [tasksResult, poolResult] = await Promise.all([
    client
      .from("tasks")
      .select("size, completed_at")
      .eq("trainer_id", trainerId)
      .eq("status", "done")
      .gte("completed_at", earliestPossible)
      .returns<{ size: TaskSize; completed_at: string }[]>(),
    client.from("instance").select("id").eq("trainer_id", trainerId).returns<{ id: string }[]>(),
  ]);

  if (tasksResult.error) {
    throw new DatabaseError("Reading tasks for settlement", tasksResult.error);
  }
  if (poolResult.error) {
    throw new DatabaseError("Reading pool for settlement", poolResult.error);
  }
  const pool = poolResult.data;
  if (pool.length === 0) {
    throw new Error("Settling: trainer has no pool");
  }

  const tasksByDay = groupTasksByDay(
    tasksResult.data.map((task) => ({ size: task.size, completedAt: task.completed_at })),
    timeZone,
  );

  const startingState: SettlementState = {
    happiness: trainerRow.happiness,
    activeInstanceId: trainerRow.active_instance_id,
    pendingArrivalDelta: trainerRow.pending_arrival_delta,
  };

  const result = settleDays(
    startingState,
    days,
    tasksByDay,
    trainerRow.daily_target,
    () => pool[Math.floor(Math.random() * pool.length)].id,
  );

  const { error: applyError } = await createSupabaseServiceRoleClient().rpc("apply_settlement", {
    p_trainer_id: trainerId,
    p_expected_last_settled_day: trainerRow.last_settled_day,
    p_rows: result.ledgerRows,
    p_ending_happiness: result.state.happiness,
    p_ending_active_instance_id: result.state.activeInstanceId,
    p_ending_last_settled_day: days[days.length - 1],
    p_ending_pending_arrival_delta: result.state.pendingArrivalDelta,
  });

  if (applyError) {
    throw new DatabaseError("Applying settlement", applyError);
  }
  return true;
}
