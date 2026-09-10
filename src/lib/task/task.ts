import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecurrenceFrequency, RecurrenceRule } from "@/lib/recurrence/dates";
import { DatabaseError, unwrap } from "@/lib/supabase/errors";

/** A task, as the app reads one. */
export type TaskSize = "small" | "medium" | "large";
export type TaskStatus = "open" | "done";

/**
 * The rule that generated a task, read alongside it (#16): enough of the
 * **Recurrence** to word it (`RecurrenceRule` is what `recurrenceSentence`
 * takes) and to stop it (`id` is what the delete-and-stop verb names).
 *
 * Null for a task a trainer typed, and null again once the rule is deleted —
 * `recurrence_id` is `on delete set null`, so a completed task outlives its
 * rule and is thereafter indistinguishable from a hand-typed one, which is the
 * intended behaviour and what ADR-0002 requires anyway.
 *
 * Not the whole rule: the watermark and the stamped content are generation's
 * business, and nothing a trainer reads a task for.
 */
export type TaskRecurrence = RecurrenceRule & { id: string };

export type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  size: TaskSize;
  notes: string | null;
  completedAt: string | null;
  label: { id: string; name: string; color: string; abbreviation: string; position: number };
  recurrence: TaskRecurrence | null;
};

type TaskRow = {
  id: string;
  task: string;
  due_date: string;
  status: TaskStatus;
  size: TaskSize;
  notes: string | null;
  completed_at: string | null;
  label: { id: string; name: string; color: string; abbreviation: string; position: number };
  recurrence: {
    id: string;
    frequency: RecurrenceFrequency;
    day_of_week: number | null;
    day_of_month: number | null;
    starts_on: string;
  } | null;
};

const COLUMNS =
  "id, task, due_date, status, size, notes, completed_at, label:label_id(id, name, color, abbreviation, position), recurrence:recurrence_id(id, frequency, day_of_week, day_of_month, starts_on)";

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.task,
    dueDate: row.due_date,
    status: row.status,
    size: row.size,
    notes: row.notes,
    completedAt: row.completed_at,
    label: row.label,
    recurrence: row.recurrence && {
      id: row.recurrence.id,
      frequency: row.recurrence.frequency,
      dayOfWeek: row.recurrence.day_of_week,
      dayOfMonth: row.recurrence.day_of_month,
      startsOn: row.recurrence.starts_on,
    },
  };
}

/** What completing a task of this size is worth (CONTEXT.md). */
export const EFFORT_POINTS: Record<TaskSize, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

/** Every size, in display order — the source both task forms build their pickers from. */
export const TASK_SIZES = Object.keys(EFFORT_POINTS) as TaskSize[];

export function effortPoints(size: TaskSize): number {
  return EFFORT_POINTS[size];
}

/**
 * A trainer's tasks, open and done alike — callers partition and group them
 * for display. Row-level security scopes this to the caller's own.
 */
export async function listTasks(client: SupabaseClient, trainerId: string): Promise<Task[]> {
  const { data, error } = await client
    .from("tasks")
    .select(COLUMNS)
    .eq("trainer_id", trainerId)
    .order("due_date")
    .returns<TaskRow[]>();

  if (error) {
    throw new DatabaseError("Listing tasks", error);
  }
  return data.map(toTask);
}

/**
 * Everything a task carries but the date it is due — which is also exactly
 * what a **Recurrence** stamps onto each task it generates, the due date being
 * the one field the rule works out for itself.
 */
export type TaskContent = {
  title: string;
  labelId: string;
  size: TaskSize;
  notes: string | null;
};

export type TaskFields = TaskContent & { dueDate: string };

/**
 * Creates a task, open by construction — the database refuses anything else
 * (see the insert policy's `with check`).
 */
export async function createTask(
  client: SupabaseClient,
  trainerId: string,
  fields: TaskFields,
): Promise<Task> {
  const row = unwrap(
    "Creating task",
    await client
      .from("tasks")
      .insert({
        trainer_id: trainerId,
        task: fields.title,
        due_date: fields.dueDate,
        label_id: fields.labelId,
        size: fields.size,
        notes: fields.notes,
      })
      .select(COLUMNS)
      .single<TaskRow>(),
  );
  return toTask(row);
}

/**
 * The tasks a recurrence has already generated, one due date per row. What
 * makes generation's insert a set of *missing* dates rather than a blind
 * replay — the partial unique index on `(recurrence_id, due_date)` is the
 * safety net behind this, not a substitute for it.
 */
export async function dueDatesForRecurrence(
  client: SupabaseClient,
  recurrenceId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("tasks")
    .select("due_date")
    .eq("recurrence_id", recurrenceId)
    .returns<{ due_date: string }[]>();

  if (error) {
    throw new DatabaseError("Reading a recurrence's generated tasks", error);
  }
  return data.map((row) => row.due_date);
}

/**
 * Writes the tasks a recurrence owes — one per due date, open like any other
 * new task, carrying the title, label, size and notes the rule stamps and a
 * reference back to it.
 *
 * One statement for the whole batch: a fortnight's backfill is one insert,
 * and if a concurrent run has already written any of these dates the unique
 * index refuses the lot rather than writing half of them. Generation's caller
 * leaves the watermark where it is on failure, so the retry sees the rows the
 * other run wrote and asks only for what is still missing.
 */
export async function createGeneratedTasks(
  client: SupabaseClient,
  trainerId: string,
  recurrenceId: string,
  fields: TaskContent,
  dueDates: string[],
): Promise<Task[]> {
  if (dueDates.length === 0) return [];

  const { data, error } = await client
    .from("tasks")
    .insert(
      dueDates.map((dueDate) => ({
        trainer_id: trainerId,
        recurrence_id: recurrenceId,
        task: fields.title,
        due_date: dueDate,
        label_id: fields.labelId,
        size: fields.size,
        notes: fields.notes,
      })),
    )
    .select(COLUMNS)
    .returns<TaskRow[]>();

  if (error) {
    throw new DatabaseError("Generating tasks", error);
  }
  // Oldest date first. Postgres returns an insert's rows in whatever order it
  // wrote them, which is not the order they were given, and a backfill reads
  // in order or it reads as nothing.
  return data.map(toTask).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/**
 * Deletes every **open** task a recurrence generated — the pending one and any
 * overdue leftovers.
 *
 * Done tasks are left where they are, and not only because row-level security
 * refuses them (ADR-0002): a trainer's completed recurring work is the only
 * record that the work happened, and it survives the rule being deleted.
 * `status` is filtered here as well as by the policy so that the intent is
 * legible at the seam, and so that this stays true if it is ever called with a
 * client the policy does not apply to.
 *
 * Called before the rule itself is deleted, while the reference still points
 * at it — `recurrence_id` is `on delete set null`, so a rule deleted first
 * would leave nothing to find its tasks by.
 *
 * Matching nothing is not an error, unlike `deleteTask`: a rule whose tasks
 * are all done has none to clear. What refuses a rule the caller does not own
 * is `deleteRecurrence`, the step after this one.
 */
export async function deleteOpenTasksForRecurrence(
  client: SupabaseClient,
  recurrenceId: string,
): Promise<void> {
  const { error } = await client
    .from("tasks")
    .delete()
    .eq("recurrence_id", recurrenceId)
    .eq("status", "open");

  if (error) {
    throw new DatabaseError("Deleting a recurrence's open tasks", error);
  }
}

/**
 * Edits a task's title, due date, label, size and notes. Row-level security
 * refuses this if the task belongs to another trainer — this throws rather
 * than silently touching nothing. Only the app's own reach is narrower than
 * the policy's: the interface offers no way to edit a task while it is done,
 * only after reopening it.
 */
export async function updateTask(
  client: SupabaseClient,
  id: string,
  fields: TaskFields,
): Promise<Task> {
  const row = unwrap(
    "Editing task",
    await client
      .from("tasks")
      .update({
        task: fields.title,
        due_date: fields.dueDate,
        label_id: fields.labelId,
        size: fields.size,
        notes: fields.notes,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single<TaskRow>(),
  );
  return toTask(row);
}

/**
 * Completes a task: one click, and one click back (see `reopenTask`). Stamps
 * the instance active at this moment — `activeInstanceId` may be null, when
 * the trainer currently has no Pokémon.
 */
export async function completeTask(
  client: SupabaseClient,
  id: string,
  activeInstanceId: string | null,
): Promise<Task> {
  const row = unwrap(
    "Completing task",
    await client
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_instance_id: activeInstanceId,
      })
      .eq("id", id)
      .select(COLUMNS)
      .single<TaskRow>(),
  );
  return toTask(row);
}

/**
 * Sends a done task back to Open — the exact inverse of `completeTask`,
 * clearing both the completion timestamp and the Pokémon that completion
 * credited, so nothing is left crediting work that is no longer finished. A
 * reopened task is byte-identical to one never completed: there is no third
 * state for a reader to learn.
 *
 * Nothing here knows about "today". Which completions a trainer can reach is
 * the interface's business (`completedToday` in `@/lib/task/dates`); the
 * database's only rule is that the task is the caller's own.
 */
export async function reopenTask(client: SupabaseClient, id: string): Promise<Task> {
  const row = unwrap(
    "Reopening task",
    await client
      .from("tasks")
      .update({ status: "open", completed_at: null, completed_instance_id: null })
      .eq("id", id)
      .select(COLUMNS)
      .single<TaskRow>(),
  );
  return toTask(row);
}

/**
 * Deletes an open task. Row-level security refuses this while the task is
 * done (ADR-0002 — the one rule of it that survives reopen) or if it belongs
 * to another trainer; either way this throws rather than silently deleting
 * nothing. A trainer who wants a done task gone reopens it first.
 */
export async function deleteTask(client: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await client
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Deleting task", error);
  }
  if (!data) {
    throw new Error("Deleting task: no matching open task");
  }
}
