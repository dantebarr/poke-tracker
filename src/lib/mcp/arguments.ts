import { listLabels } from "@/lib/label/label";
import type { SupabaseClient } from "@supabase/supabase-js";

import { TASK_SIZES, type TaskSize } from "@/lib/task/task";

/**
 * A failure worded for Claude to read and recover from. The server returns its
 * message as the tool result; any other error is logged and reported only as
 * "failed", since its text may carry database detail.
 */
export class ToolError extends Error {}

export type Args = Record<string, unknown>;

/** The arguments object, refusing any key the tool does not take. */
export function checkArgs(raw: unknown, allowed: string[]): Args {
  const args = raw === undefined ? {} : raw;
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    throw new ToolError("Arguments must be an object.");
  }
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new ToolError(`Unknown argument "${key}". This tool takes: ${allowed.join(", ")}.`);
    }
  }
  return args as Args;
}

export function requireId(args: Args): string {
  const id = args.id;
  if (typeof id !== "string" || id.trim() === "") {
    throw new ToolError('"id" is required: the id of a task, as list_tasks returns it.');
  }
  return id;
}

export function parseTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ToolError('"title" must be a non-blank string.');
  }
  return value;
}

/** A real calendar day, `YYYY-MM-DD`; `2030-02-30` is refused, not rolled over. */
export function parseDueDate(value: unknown): string {
  const wellFormed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (wellFormed) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  throw new ToolError('"dueDate" must be a real calendar day written YYYY-MM-DD, e.g. 2030-03-04.');
}

export function parseSize(value: unknown): TaskSize {
  if (typeof value === "string" && (TASK_SIZES as string[]).includes(value)) return value as TaskSize;
  throw new ToolError(`"size" must be one of: ${TASK_SIZES.join(", ")}.`);
}

/** Blank or whitespace-only notes are stored as null, as the actions store them. */
export function parseNotes(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ToolError('"notes" must be a string, or null to clear them.');
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The id of the trainer's label with this name, matched without regard to case. */
export async function resolveLabelId(
  client: SupabaseClient,
  trainerId: string,
  value: unknown,
): Promise<string> {
  const labels = await listLabels(client, trainerId);
  const wanted = typeof value === "string" ? value.trim().toLowerCase() : "";
  const found = labels.find((label) => label.name.toLowerCase() === wanted);
  if (found) return found.id;
  throw new ToolError(
    `No label named ${JSON.stringify(value)}. Your labels are: ${labels.map((label) => label.name).join(", ")}.`,
  );
}
