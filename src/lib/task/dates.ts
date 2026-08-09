/**
 * How open tasks are grouped for reading, by due date relative to today, and
 * how due dates and completion days are humanised. Ported from Jarvis HUD's
 * `src/lib/dates.ts`.
 *
 * Two things changed from the original: `due_date` is `NOT NULL` under
 * ADR-0001, so every function here takes a plain `string` rather than
 * `string | null` and the "No date" fallback is gone; and per #7's
 * acceptance criteria, Overdue is the only alarm state, so there is no
 * separate "today" accent for callers to reach for.
 *
 * A third change, from #17: every function here takes a day-key string for
 * "today" rather than a `Date`. A `Date` cannot carry a zone, which is what
 * let this module and settlement disagree about when a day ends — comparing
 * day keys removes server-local `Date` arithmetic from the comparison path
 * entirely, rather than patching around it. The day key itself is computed
 * once per request, from the trainer's own stored time zone (Settings), by
 * the caller — never detected from a device (ADR-0004).
 */

import { dayKeyInTimeZone, dayKeyToUtcDate, daysBetweenKeys } from "@/lib/day/day";
import { effortPoints, type TaskSize } from "@/lib/task/task";

export type Bucket = "overdue" | "today" | "tomorrow" | "later";

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "tomorrow", "later"];

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  tomorrow: "Tomorrow",
  later: "Later",
};

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// A plain `date` column ('YYYY-MM-DD'); parsing it with `new Date(string)`
// reads it as UTC midnight and can land on the wrong local day. Build the
// Date from components instead. Exported for other date columns of the same
// shape — day_ledger's `day`, currently — that need the same treatment.
export function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getBucket(dueDate: string, todayKey: string): Bucket {
  const diff = daysBetweenKeys(todayKey, dueDate);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return "later";
}

export function bucketOpenTasks<T extends { dueDate: string }>(
  tasks: T[],
  todayKey: string,
): Record<Bucket, T[]> {
  const buckets = Object.fromEntries(BUCKET_ORDER.map((bucket) => [bucket, [] as T[]])) as Record<Bucket, T[]>;
  for (const task of tasks) {
    buckets[getBucket(task.dueDate, todayKey)].push(task);
  }
  return buckets;
}

// `neutral` drops the urgency framing ("overdue", "Today") in favor of a
// plain date — for done tasks, where the due date is history, not an alarm.
export function humanizeDueDate(dueDate: string, todayKey: string, neutral = false): string {
  const diff = daysBetweenKeys(todayKey, dueDate);
  const date = dayKeyToUtcDate(dueDate);

  if (neutral) {
    return Math.abs(diff) <= 6 ? WEEKDAY_FORMAT.format(date) : MONTH_DAY_FORMAT.format(date);
  }

  if (diff < 0) return `${-diff} day${-diff === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 6) return WEEKDAY_FORMAT.format(date);
  return MONTH_DAY_FORMAT.format(date);
}

function humanizeCompletedDay(dayKey: string, todayKey: string): string {
  const diff = daysBetweenKeys(todayKey, dayKey);

  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff > -7) return WEEKDAY_FORMAT.format(dayKeyToUtcDate(dayKey));
  return MONTH_DAY_FORMAT.format(dayKeyToUtcDate(dayKey));
}

export interface DoneGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

/**
 * Groups done tasks by the local day, in `timeZone`, they were completed on
 * — the same primitive settlement uses to group tasks for settling, so the
 * two cannot disagree about which day a completion belongs to.
 */
export function groupDoneByDay<T extends { completedAt: string }>(
  tasks: T[],
  timeZone: string,
  todayKey: string,
): DoneGroup<T>[] {
  const groups = new Map<string, DoneGroup<T>>();

  for (const task of tasks) {
    const key = dayKeyInTimeZone(new Date(task.completedAt), timeZone);

    let group = groups.get(key);
    if (!group) {
      group = { key, label: humanizeCompletedDay(key, todayKey), tasks: [] };
      groups.set(key, group);
    }
    group.tasks.push(task);
  }

  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

/**
 * Effort points earned today, derived by summing today's completions —
 * never a stored counter (CONTEXT.md), so this is the only place "today's
 * total" is computed. "Today" is the trainer's own day key, and a
 * completion's day is derived through the same shared primitive settlement
 * uses, so this can never disagree with what settlement will eventually
 * write to the ledger for the day still in progress.
 */
export function todayPoints(
  tasks: { status: "open" | "done"; completedAt: string | null; size: TaskSize }[],
  timeZone: string,
  todayKey: string,
): number {
  return tasks
    .filter(
      (task): task is { status: "done"; completedAt: string; size: TaskSize } =>
        task.status === "done" &&
        task.completedAt !== null &&
        dayKeyInTimeZone(new Date(task.completedAt), timeZone) === todayKey,
    )
    .reduce((sum, task) => sum + effortPoints(task.size), 0);
}
