/**
 * Turning real time into the calendar days settlement reasons about, in the
 * trainer's own timezone read from their device — never the server's. Pure:
 * no database, no clock of its own.
 */

/** A calendar day as `'YYYY-MM-DD'`, in `timeZone` rather than the server's own. */
export function dayKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** `dayKey` shifted by `count` days (negative moves earlier). */
export function addDays(dayKey: string, count: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + count));
  return dayKeyOfUtcDate(next);
}

function dayKeyOfUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Every day settlement owes, oldest first: the day after `lastSettledDay`, up
 * to but excluding `today`. Empty when already caught up — including when
 * `lastSettledDay` is today itself, which is what keeps today out of the
 * ledger (CONTEXT.md).
 */
export function daysToSettle(lastSettledDay: string, today: string): string[] {
  const days: string[] = [];
  let cursor = addDays(lastSettledDay, 1);
  while (cursor < today) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * Groups tasks by the local day, in `timeZone`, they were completed on — the
 * boundary is midnight in the trainer's own zone, not UTC or the server's.
 */
export function groupTasksByDay<T extends { completedAt: string }>(
  tasks: T[],
  timeZone: string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = dayKeyInTimeZone(new Date(task.completedAt), timeZone);
    const group = groups.get(key);
    if (group) {
      group.push(task);
    } else {
      groups.set(key, [task]);
    }
  }
  return groups;
}
