"use server";

import { revalidatePath } from "next/cache";

import { firstDueDate, type RecurrenceFrequency } from "@/lib/recurrence/dates";
import { generateTasks } from "@/lib/recurrence/generation";
import { createRecurrence, type Recurrence } from "@/lib/recurrence/recurrence";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import type { Task, TaskSize } from "@/lib/task/task";
import { requireTrainerId } from "@/lib/trainer/session";

/**
 * The verbs a trainer performs on a **Recurrence**. Its own module rather than
 * a branch inside the task create action: branching that action on whether the
 * form carries recurrence fields would save a seam at the cost of an action
 * that sometimes returns a task and sometimes creates a rule instead.
 *
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale, and
 * `@/app/actions/task` for why these take a `FormData` and revalidate the root
 * layout rather than `/`.
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

function requiredFrequency(formData: FormData): RecurrenceFrequency {
  const frequency = requiredField(formData, "frequency");
  if (frequency !== "daily" && frequency !== "weekly" && frequency !== "monthly") {
    throw new Error(`Invalid frequency: ${frequency}`);
  }
  return frequency;
}

// Blank or whitespace-only notes are stored as null rather than empty text —
// the same convention the task actions use.
function notesField(formData: FormData): string | null {
  const raw = formData.get("notes");
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * A day of week or day of month, passed through as a number or as null when
 * the form did not send one. Which of the two a frequency requires is the
 * database's to say, not this function's: a weekly rule without a day of week
 * is refused by a check constraint (ADR-0001), so nothing here has to
 * duplicate that rule and risk disagreeing with it.
 */
function optionalNumber(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length === 0) return null;

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}

/**
 * Creates a rule and the first task it owes, in that order.
 *
 * The task exists immediately rather than at next app entry, so the feature
 * does not look broken until tomorrow. **Exactly one** is created, on the
 * rule's resolved first date: generation is asked to reach only that far here,
 * where settlement asks for today plus one interval. No task is created for
 * the start date itself — the start date is an anchor, and gets a task only
 * when it is independently a date the rule falls on.
 *
 * Two clients, deliberately. The rule is inserted under the trainer's own JWT,
 * so row-level security is what establishes that the rule and its label are
 * theirs. Generation then runs as service-role, because `recurrence` has no
 * update grant for the watermark it has to move; it re-checks label ownership
 * itself, since that is exactly the guarantee service-role switches off.
 *
 * No day key is derived from a clock anywhere on this path: the start date
 * comes from the trainer's own form and every date after it is computed from
 * that, so nothing here can fall on the server's day rather than the
 * trainer's (ADR-0004).
 */
export async function createRecurrenceAction(
  formData: FormData,
): Promise<{ recurrence: Recurrence; tasks: Task[] }> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const recurrence = await createRecurrence(client, trainerId, {
    frequency: requiredFrequency(formData),
    dayOfWeek: optionalNumber(formData, "dayOfWeek"),
    dayOfMonth: optionalNumber(formData, "dayOfMonth"),
    startsOn: requiredField(formData, "startsOn"),
    title: requiredField(formData, "title"),
    labelId: requiredField(formData, "labelId"),
    size: requiredSize(formData),
    notes: notesField(formData),
  });

  const tasks = await generateTasks(
    createSupabaseServiceRoleClient(),
    recurrence,
    firstDueDate(recurrence),
  );

  revalidatePath("/", "layout");
  return { recurrence, tasks };
}
