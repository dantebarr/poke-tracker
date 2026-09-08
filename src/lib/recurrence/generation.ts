import type { SupabaseClient } from "@supabase/supabase-js";

import { labelBelongsToTrainer } from "@/lib/label/label";
import { dueDatesBetween, generationHorizon } from "@/lib/recurrence/dates";
import { advanceGeneratedThrough, listRecurrences, type Recurrence } from "@/lib/recurrence/recurrence";
import { createGeneratedTasks, dueDatesForRecurrence, type Task } from "@/lib/task/task";

/**
 * Writing the tasks a rule owes. The date arithmetic itself is pure and lives
 * in `@/lib/recurrence/dates`; this is the part that touches the database.
 *
 * **Takes a service-role client.** `recurrence` has no update grant at all, so
 * advancing the watermark is out of reach of a trainer's own JWT by design —
 * and settlement, generation's other caller, is already running as service-role
 * by the time it gets here. That means row-level security is switched off on
 * this path, so the two things it would otherwise guarantee are enforced here
 * by hand: the tasks are written for the rule's own owner, and the label is
 * checked to belong to them.
 */

/**
 * Generates every task the rule owes between its watermark and `through`, then
 * moves the watermark to `through` — the last date generation has *considered*,
 * which is not the same as the last one it wrote. That watermark, and not the
 * presence of an open task, is what makes this idempotent: running it twice on
 * one day writes nothing the second time, and completing a task it generated
 * produces nothing new (ADR-0010).
 *
 * `through` is the caller's to choose, because the two callers want different
 * reaches. Creating a rule passes the rule's own first due date, so exactly one
 * task exists the moment a trainer saves; settlement passes `generationHorizon`
 * — today plus one interval — so a daily recurrence always has tomorrow's task
 * visible.
 *
 * Returns the tasks it wrote, oldest date first. Empty when there is nothing
 * owed, and empty *without advancing the watermark* when the rule's label is no
 * longer the trainer's own — a rule that cannot be generated safely is left
 * alone to be generated later rather than skipped forever in silence.
 *
 * The dates already written are read back and subtracted rather than left to
 * the partial unique index to reject: the index is the safety net for a
 * concurrent run, and a net that fires takes the whole batch with it. Filtering
 * first means the ordinary retry — a watermark left where it was by an earlier
 * failure — writes what is missing instead of colliding with what is not.
 */
export async function generateTasks(
  client: SupabaseClient,
  recurrence: Recurrence,
  through: string,
): Promise<Task[]> {
  if (through <= recurrence.generatedThrough) return [];

  if (!(await labelBelongsToTrainer(client, recurrence.labelId, recurrence.trainerId))) {
    return [];
  }

  const owed = dueDatesBetween(recurrence, recurrence.generatedThrough, through);
  const alreadyWritten = new Set(await dueDatesForRecurrence(client, recurrence.id));

  const tasks = await createGeneratedTasks(
    client,
    recurrence.trainerId,
    recurrence.id,
    { title: recurrence.title, labelId: recurrence.labelId, size: recurrence.size, notes: recurrence.notes },
    owed.filter((dueDate) => !alreadyWritten.has(dueDate)),
  );

  await advanceGeneratedThrough(client, recurrence.id, through);
  return tasks;
}

/**
 * Every task all of a trainer's rules owe as of `today` — settlement's way in
 * (#14), where `generateTasks` above is the single rule's.
 *
 * The horizon is asked for per rule rather than shared, because one interval
 * means a different reach for each: a daily rule gets tomorrow, a weekly one
 * next week, a monthly one next month. That lead is what lets a trainer work
 * ahead. Reaching back is not a separate case — a rule whose watermark is stale
 * because the trainer was away backfills every date they missed out of the same
 * loop, uncapped (ADR-0010).
 *
 * `today` is the caller's, and is the trainer's own day key rather than the
 * server's (ADR-0004); nothing here reads a clock.
 *
 * Two clients, as everywhere generation runs: the rules are read under the
 * trainer's own JWT, so row-level security is what scopes them, and the writing
 * goes through service-role for the watermark's sake.
 *
 * **This does not catch.** A throw here reaches settlement, which is why it runs
 * before the commit: the day stays unsettled and the whole operation retries on
 * next entry. What keeps that from costing a trainer their ledger is that a rule
 * they can legitimately create cannot make it throw — the check constraints make
 * a malformed rule unrepresentable (ADR-0001), the date functions are total, and
 * a rule whose label is not its owner's writes nothing rather than failing. A
 * throw that gets past all of that is the database being unreachable, and the
 * settlement queries below it would not have survived either.
 *
 * One rule at a time rather than all at once, so that when the retry does come
 * the watermarks the earlier rules moved are already durable and only what is
 * still missing is written. Every part of this is idempotent, so a retry costs
 * nothing but the round trips.
 */
export async function generateToHorizon(
  client: SupabaseClient,
  serviceRole: SupabaseClient,
  trainerId: string,
  today: string,
): Promise<void> {
  for (const recurrence of await listRecurrences(client, trainerId)) {
    await generateTasks(serviceRole, recurrence, generationHorizon(recurrence, today));
  }
}
