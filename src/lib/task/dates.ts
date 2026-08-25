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
 *
 * Reading order within a bucket is a second axis, added later: `sortForFieldLog`
 * orders by the trainer's own label order first, due date second, title third,
 * so a bucket reads as one area of life at a time rather than an interleave of
 * every label.
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

// Hoisted like the formatters above — one collator for the process, not one
// per `sortForFieldLog` call — and pinned to a locale for the same reason
// they are. #7 called for leaving the locale undefined, on the grounds that
// two Rangers in different locales disagreeing about where "Á" sits breaks
// nothing. That holds between Rangers but not within one: `sortForFieldLog`
// is called from a client component, so an undefined locale is resolved
// twice for the same list — once by the server at render, once by the
// browser at hydration — and a browser whose default disagrees with the
// server's reorders the bucket after first paint. Collations really do
// disagree: `sv` sorts "Ärger" after "Battle", `en` before it. A list that
// reshuffles under the Ranger is the whole of what this order exists to
// stop, so the locale is fixed here rather than discovered.
//
// This is not ADR-0004: a time zone is a domain fact that must agree with
// settlement, whereas sort locale only decides what a list looks like. It is
// pinned to keep one list from ordering itself two ways, not to make it
// authoritative. Making it a Ranger-facing setting stays rejected.
//
// `numeric` is what makes "Chapter 2" precede "Chapter 10". Case and accents
// are handled by the default `variant` sensitivity, which does not fold them
// away — it ranks them below the base-letter difference, so "email Ash" and
// "Email Ash" land next to each other instead of every capitalised title
// sitting above every lowercase one.
const TITLE_COLLATOR = new Intl.Collator("en-US", { numeric: true });

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

/**
 * The field log's reading order within a Bucket: the trainer's own label
 * order first (the `position` they set in Settings via `moveLabel`), then due
 * date, then title alphabetically. Labels are an area of life, so a Ranger
 * reads one context at a time rather than scanning the colour of every tag in
 * a bucket.
 *
 * Those three keys are the whole of the order, and every one of them is
 * visible on the row — a Ranger can predict where a task will sit from what
 * the field log already shows them. That is why title beats arrival order:
 * arrival order is `listTasks`'s `order by due_date`, which says nothing
 * about tasks sharing a due date, so their order came from wherever Postgres
 * happened to hold the rows and shuffled whenever one was written. A stable
 * sort preserves an order it is given; it cannot create one.
 *
 * Alphabetical, not creation order, for the same reason: creation order is
 * invisible on screen and unrecoverable from it. Comparison is `Intl.Collator`
 * rather than `<`/`>` (which the due-date key uses correctly, `'YYYY-MM-DD'`
 * being code-point-ordered by construction) so that case and accents don't
 * segregate a bucket.
 *
 * Two tasks sharing a label, a due date *and* a title stay tied, on purpose:
 * they are near-indistinguishable on the screen already, so there is nothing
 * for a Ranger to relearn if they swap. No hidden key — an `id` in particular
 * — closes that gap, since a key the row does not display would be exactly the
 * unpredictability this order exists to remove.
 *
 * Sort *before* bucketing, not after: `bucketOpenTasks` is a single-pass
 * partition, so a sorted input yields sorted buckets.
 */
export function sortForFieldLog<T extends { title: string; dueDate: string; label: { position: number } }>(
  tasks: T[],
): T[] {
  return [...tasks].sort(
    (a, b) =>
      a.label.position - b.label.position ||
      (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
      TITLE_COLLATOR.compare(a.title, b.title),
  );
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
 * The tasks completed on the day still in progress — the trainer's own day
 * key, with a completion's day derived through the same shared primitive
 * settlement uses, so this can never disagree about which day a completion
 * belongs to.
 *
 * This one set answers two questions that must never drift apart: what today
 * is worth (`todayPoints`, below) and which completions the field log shows
 * and offers a reopen on (#36). It exists as a named function precisely so
 * that "only today's completions can be reopened" is a stated intention
 * rather than an accident of the display code.
 *
 * *Why* today: a day already settled has its own record in the Logbook (the
 * day ledger), an aggregate rather than a raw task list, and settlement runs
 * up through yesterday on every visit (`settle-on-entry`), so nothing
 * completed before today is still waiting to be accounted for here.
 *
 * This is an interface affordance, not a rule of the domain or the database
 * — neither knows what "today" means for reopening, and a reopen cannot
 * disturb a settled day regardless, because a ledger row is a snapshot that
 * is never recomputed (ADR-0007). A future surface for browsing older
 * completions therefore has to decide for itself whether it offers reopen;
 * it does not inherit the answer by reaching past this function.
 */
export function completedToday<T extends { status: "open" | "done"; completedAt: string | null }>(
  tasks: T[],
  timeZone: string,
  todayKey: string,
): (T & { completedAt: string })[] {
  return tasks.filter(
    (task): task is T & { completedAt: string } =>
      task.status === "done" &&
      task.completedAt !== null &&
      dayKeyInTimeZone(new Date(task.completedAt), timeZone) === todayKey,
  );
}

/**
 * Effort points earned today, derived by summing today's completions —
 * never a stored counter (CONTEXT.md), so this is the only place "today's
 * total" is computed. Expressed in terms of `completedToday` because today's
 * score and today's reopenable set are the same set of tasks; summing a
 * second, separately written filter is what would let the readout and the
 * list disagree.
 */
export function todayPoints(
  tasks: { status: "open" | "done"; completedAt: string | null; size: TaskSize }[],
  timeZone: string,
  todayKey: string,
): number {
  return completedToday(tasks, timeZone, todayKey).reduce((sum, task) => sum + effortPoints(task.size), 0);
}
