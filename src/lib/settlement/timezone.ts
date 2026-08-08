/**
 * Turning a trainer's settlement watermark and their tasks into the days
 * settlement owes and what each of those days earned. Pure: no database, no
 * clock of its own. The day-key primitives themselves — deriving a
 * `'YYYY-MM-DD'` key for an instant in a given zone, and shifting a key by a
 * number of days — live in `@/lib/day/day`, since **Day** is a concept
 * shared with task display, not something settlement owns.
 */

import { addDays, dayKeyInTimeZone } from "@/lib/day/day";

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
