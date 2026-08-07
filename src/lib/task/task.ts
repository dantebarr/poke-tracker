import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError, unwrap } from "@/lib/supabase/errors";

/** A task, as the app reads one. */
export type TaskSize = "small" | "medium" | "large";
export type TaskStatus = "open" | "done";

export type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  size: TaskSize;
  notes: string | null;
  completedAt: string | null;
  label: { id: string; name: string; color: string };
};

type TaskRow = {
  id: string;
  task: string;
  due_date: string;
  status: TaskStatus;
  size: TaskSize;
  notes: string | null;
  completed_at: string | null;
  label: { id: string; name: string; color: string };
};

const COLUMNS =
  "id, task, due_date, status, size, notes, completed_at, label:label_id(id, name, color)";

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
  };
}

/** What completing a task of this size is worth (CONTEXT.md). */
export const EFFORT_POINTS: Record<TaskSize, number> = {
  small: 1,
  medium: 2,
  large: 3,
};

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

export type TaskFields = {
  title: string;
  dueDate: string;
  labelId: string;
  size: TaskSize;
  notes: string | null;
};

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
 * Edits an open task's title, due date, label, size and notes. Row-level
 * security refuses this once the task is done (ADR-0002) or if it belongs to
 * another trainer — either way this throws rather than silently touching
 * nothing.
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
 * Completes a task: one click, terminal (ADR-0002). Stamps the instance
 * active at this moment — `activeInstanceId` may be null, when the trainer
 * currently has no Pokémon.
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
 * Deletes an open task. Row-level security refuses this once the task is
 * done (ADR-0002) or if it belongs to another trainer; either way this
 * throws rather than silently deleting nothing.
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
