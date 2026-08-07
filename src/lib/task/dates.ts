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
 */

export type Bucket = "overdue" | "today" | "this_week" | "later";

export const BUCKET_ORDER: Bucket[] = ["overdue", "today", "this_week", "later"];

export const BUCKET_LABELS: Record<Bucket, string> = {
  overdue: "Overdue",
  today: "Today",
  this_week: "This week",
  later: "Later",
};

const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

// `due_date` is a plain `date` column ('YYYY-MM-DD'); parsing it with
// `new Date(string)` reads it as UTC midnight and can land on the wrong
// local day. Build the Date from components instead.
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Positive when `to` is after `from`.
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function getBucket(dueDate: string, today: Date = new Date()): Bucket {
  const diff = daysBetween(today, parseDateOnly(dueDate));
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "this_week";
  return "later";
}

export function bucketOpenTasks<T extends { dueDate: string }>(
  tasks: T[],
  today: Date = new Date(),
): Record<Bucket, T[]> {
  const buckets: Record<Bucket, T[]> = { overdue: [], today: [], this_week: [], later: [] };
  for (const task of tasks) {
    buckets[getBucket(task.dueDate, today)].push(task);
  }
  return buckets;
}

// `neutral` drops the urgency framing ("overdue", "Today") in favor of a
// plain date — for done tasks, where the due date is history, not an alarm.
export function humanizeDueDate(dueDate: string, today: Date = new Date(), neutral = false): string {
  const date = parseDateOnly(dueDate);
  const diff = daysBetween(today, date);

  if (neutral) {
    return Math.abs(diff) <= 6 ? WEEKDAY_FORMAT.format(date) : MONTH_DAY_FORMAT.format(date);
  }

  if (diff < 0) return `${-diff} day${-diff === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 6) return WEEKDAY_FORMAT.format(date);
  return MONTH_DAY_FORMAT.format(date);
}

function humanizeCompletedDay(date: Date, today: Date): string {
  const diff = daysBetween(today, date);

  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff > -7) return WEEKDAY_FORMAT.format(date);
  return MONTH_DAY_FORMAT.format(date);
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface DoneGroup<T> {
  key: string;
  label: string;
  tasks: T[];
}

export function groupDoneByDay<T extends { completedAt: string }>(
  tasks: T[],
  today: Date = new Date(),
): DoneGroup<T>[] {
  const groups = new Map<string, DoneGroup<T>>();

  for (const task of tasks) {
    const date = new Date(task.completedAt);
    const key = dayKey(date);

    let group = groups.get(key);
    if (!group) {
      group = { key, label: humanizeCompletedDay(date, today), tasks: [] };
      groups.set(key, group);
    }
    group.tasks.push(task);
  }

  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}
