/**
 * Turning an instant into the calendar day it falls on, in a given IANA
 * timezone. Pure: no database, no clock of its own, no zone of its own — the
 * caller always supplies one. **Day** is a core domain concept upstream of
 * both settlement and task display (CONTEXT.md); every place either needs a
 * `'YYYY-MM-DD'` key imports it from here rather than growing its own.
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
  const { year, month, day } = dayKeyParts(dayKey);
  const next = new Date(Date.UTC(year, month - 1, day + count));
  return dayKeyOfUtcDate(next);
}

/**
 * A day key's calendar components, `month` 1-12. For callers doing calendar
 * arithmetic a day at a time cannot express — a recurrence resolving "the
 * 31st" against the month it lands in, say.
 */
export function dayKeyParts(dayKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dayKey.split("-").map(Number);
  return { year, month, day };
}

/**
 * The inverse of `dayKeyParts`, `month` 1-12. Every component must already be
 * a real one — this pads and joins, it does not normalise, so a 31st of
 * February would come back as written rather than rolling into March. Callers
 * that can overflow a month go through `addDays` instead.
 */
export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayKeyOfUtcDate(date: Date): string {
  return dayKeyOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * A day key as the UTC midnight `Date` that represents it — for formatting
 * only (weekday names, month/day names). Building it from UTC components
 * rather than local ones keeps the represented calendar day fixed regardless
 * of the machine's own offset; callers that format this must specify
 * `timeZone: "UTC"` on their `Intl.DateTimeFormat`, or the offset would shift
 * it right back.
 */
export function dayKeyToUtcDate(dayKey: string): Date {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Positive when `to` is after `from`, comparing day keys rather than clock time. */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((dayKeyToUtcDate(to).getTime() - dayKeyToUtcDate(from).getTime()) / (24 * 60 * 60 * 1000));
}
