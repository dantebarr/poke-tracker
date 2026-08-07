import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError } from "@/lib/supabase/errors";

/**
 * A task, as the app reads one. #7 ships no write path for these — a
 * trainer's tasks arrive already migrated, or from a later slice — so there
 * is no corresponding write-side type here yet.
 */
export type TaskSize = "small" | "medium" | "large";
export type TaskStatus = "open" | "done";

export type Task = {
  id: string;
  title: string;
  dueDate: string;
  status: TaskStatus;
  size: TaskSize;
  completedAt: string | null;
  label: { id: string; name: string; color: string };
};

type TaskRow = {
  id: string;
  task: string;
  due_date: string;
  status: TaskStatus;
  size: TaskSize;
  completed_at: string | null;
  label: { id: string; name: string; color: string };
};

const COLUMNS = "id, task, due_date, status, size, completed_at, label:label_id(id, name, color)";

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.task,
    dueDate: row.due_date,
    status: row.status,
    size: row.size,
    completedAt: row.completed_at,
    label: row.label,
  };
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
