import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, dayKeyInTimeZone } from "@/lib/day/day";
import { generationHorizon } from "@/lib/recurrence/dates";
import { generateTasks } from "@/lib/recurrence/generation";
import { listRecurrences } from "@/lib/recurrence/recurrence";
import { settleDays, type SettlementState } from "@/lib/settlement/reducer";
import { daysToSettle, groupTasksByDay } from "@/lib/settlement/timezone";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { DatabaseError } from "@/lib/supabase/errors";
import type { TaskSize } from "@/lib/task/task";

type TrainerSettlementRow = {
  happiness: number;
  active_instance_id: string | null;
  last_settled_day: string;
  daily_target: number;
  time_zone: string;
  parting_on: string | null;
};

/**
 * The tasks every one of the trainer's **Recurrences** owes, written before
 * the day they belong to is settled. Each rule is asked for its own horizon —
 * today plus one interval — so a daily rule always has tomorrow's task visible
 * and a weekly one next week's, and a trainer returning to a stale watermark
 * gets the backfill of every date they were away for out of the same loop,
 * uncapped, with no special case (ADR-0010).
 *
 * Reads the rules under the trainer's own JWT and writes through service-role,
 * which is the only client that can move a rule's watermark — `recurrence` has
 * no update grant at all. `generateTasks` re-checks label ownership itself,
 * since that is exactly the guarantee service-role switches off.
 *
 * One rule at a time rather than all at once: a rule that fails takes only
 * itself down, leaving the watermarks of the rules already generated where the
 * work they did put them.
 */
async function generateRecurringTasks(
  client: SupabaseClient,
  serviceRole: SupabaseClient,
  trainerId: string,
  today: string,
): Promise<void> {
  for (const recurrence of await listRecurrences(client, trainerId)) {
    await generateTasks(serviceRole, recurrence, generationHorizon(recurrence, today));
  }
}

/**
 * Settles every day the trainer owes, up to yesterday, in the trainer's own
 * stored time zone — the database access the pure reducer deliberately has
 * none of. Safe to call on every app entry: a trainer already caught up has
 * no days to settle and this makes no write at all.
 *
 * That same "no days owed, no work" gate is what paces generation: the first
 * entry of each of the trainer's own days runs it, and every entry after that
 * one finds nothing owed and returns. A rule's horizon moves with the day
 * rather than with the entry, so there is nothing for a second entry to do —
 * and the rule's watermark, not this gate, is what actually makes it so.
 *
 * Reads run under `client` — the trainer's own JWT, scoped by row-level
 * security like every other read in this app. Only the commit switches to a
 * service-role client: see `@/lib/supabase/service` for why that one write
 * can't go through the trainer's own JWT the way everything else does.
 */
export async function settle(client: SupabaseClient, trainerId: string): Promise<boolean> {
  const { data: trainerRow, error: trainerError } = await client
    .from("trainer")
    .select("happiness, active_instance_id, last_settled_day, daily_target, time_zone, parting_on")
    .eq("id", trainerId)
    .single<TrainerSettlementRow>();

  if (trainerError) {
    throw new DatabaseError("Reading trainer for settlement", trainerError);
  }

  const timeZone = trainerRow.time_zone;
  const today = dayKeyInTimeZone(new Date(), timeZone);
  const days = daysToSettle(trainerRow.last_settled_day, today);
  if (days.length === 0) {
    return false;
  }

  const serviceRole = createSupabaseServiceRoleClient();

  // Before the commit, deliberately (#14). A crash in generation leaves the
  // day unsettled and the whole operation retries on next entry; generating
  // after the RPC would leave a settled day with its tasks missing and no
  // second chance at them, since settlement never revisits a settled day.
  //
  // It cannot change what the day settles to, either: generation only adds
  // open tasks, and the reads below count `done` ones.
  await generateRecurringTasks(client, serviceRole, trainerId, today);

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
  };

  const result = settleDays(
    startingState,
    days,
    tasksByDay,
    trainerRow.daily_target,
    () => pool[Math.floor(Math.random() * pool.length)].id,
    // A day key, not a flag (#5): the reducer replays `days` in order and
    // fires the parting on the matching one, so a trainer who sets one and
    // comes back a week later still parts on the day they chose, and a
    // parting matching no day in this run simply never fires.
    // `apply_settlement` clears it once the day it names has been settled.
    trainerRow.parting_on,
  );

  const { error: applyError } = await serviceRole.rpc("apply_settlement", {
    p_trainer_id: trainerId,
    p_expected_last_settled_day: trainerRow.last_settled_day,
    p_rows: result.ledgerRows,
    p_ending_happiness: result.state.happiness,
    p_ending_active_instance_id: result.state.activeInstanceId,
    p_ending_last_settled_day: days[days.length - 1],
  });

  if (applyError) {
    throw new DatabaseError("Applying settlement", applyError);
  }
  return true;
}
