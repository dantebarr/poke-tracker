"use server";

import { revalidatePath } from "next/cache";

import { activeInstanceId } from "@/lib/pokemon/pokemon";
import {
  completeTask,
  createTask,
  deleteTask,
  updateTask,
  type Task,
  type TaskSize,
} from "@/lib/task/task";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainerId } from "@/lib/trainer/session";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. Each one establishes the caller from their own session and lets
 * row-level security scope the effect to their own tasks — see
 * `@/app/actions/trainer` for the fuller rationale.
 *
 * Each takes a `FormData`, not typed parameters, so it can be bound directly
 * to a `<form action>` — see the task panel.
 */

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

function requiredSize(formData: FormData): TaskSize {
  const size = requiredField(formData, "size");
  if (size !== "small" && size !== "medium" && size !== "large") {
    throw new Error(`Invalid size: ${size}`);
  }
  return size;
}

// Blank or whitespace-only notes are stored as null rather than empty text —
// the same convention `setNickname` uses for a cleared nickname.
function notesField(formData: FormData): string | null {
  const raw = formData.get("notes");
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Creates a task. Title, due date, label and size are all required — every
 * task is complete by construction (the database refuses anything less).
 */
export async function createTaskAction(formData: FormData): Promise<Task> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const task = await createTask(client, trainerId, {
    title: requiredField(formData, "title"),
    dueDate: requiredField(formData, "dueDate"),
    labelId: requiredField(formData, "labelId"),
    size: requiredSize(formData),
    notes: notesField(formData),
  });
  revalidatePath("/");
  return task;
}

/** Edits an open task's title, due date, label, size and notes. */
export async function updateTaskAction(formData: FormData): Promise<Task> {
  const client = await createSupabaseServerClient();
  await requireTrainerId(client);

  const task = await updateTask(client, requiredField(formData, "id"), {
    title: requiredField(formData, "title"),
    dueDate: requiredField(formData, "dueDate"),
    labelId: requiredField(formData, "labelId"),
    size: requiredSize(formData),
    notes: notesField(formData),
  });
  revalidatePath("/");
  return task;
}

/**
 * Completes a task: one click, terminal. Stamps whichever instance is active
 * for the caller right now — null if they currently have none.
 */
export async function completeTaskAction(formData: FormData): Promise<Task> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const instanceId = await activeInstanceId(client, trainerId);
  const task = await completeTask(client, requiredField(formData, "id"), instanceId);
  revalidatePath("/");
  return task;
}

/** Deletes an open task, behind whatever confirmation step the caller took. */
export async function deleteTaskAction(formData: FormData): Promise<void> {
  const client = await createSupabaseServerClient();
  await requireTrainerId(client);

  await deleteTask(client, requiredField(formData, "id"));
  revalidatePath("/");
}
