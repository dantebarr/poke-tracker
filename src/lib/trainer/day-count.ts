import { dayKeyInTimeZone, daysBetweenKeys } from "@/lib/day/day";

/**
 * Which day of a trainer's time here `now` falls on, in their own time zone —
 * the status strip's "DAY n". The day a trainer signs up is day 1, not day 0,
 * so the count reads the way a Ranger would say it aloud.
 */
export function dayCount(createdAt: Date, now: Date, timeZone: string): number {
  const createdKey = dayKeyInTimeZone(createdAt, timeZone);
  const nowKey = dayKeyInTimeZone(now, timeZone);
  return daysBetweenKeys(createdKey, nowKey) + 1;
}
