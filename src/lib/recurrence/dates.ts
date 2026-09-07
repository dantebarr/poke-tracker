/**
 * The due dates a **Recurrence**'s tasks fall on. Pure: no database, no clock
 * of its own, no zone of its own — every date is a `'YYYY-MM-DD'` day key the
 * caller supplies, derived from the trainer's stored time zone rather than the
 * server's (ADR-0004). Day keys are code-point ordered by construction, so `<`
 * and `<=` compare them correctly.
 *
 * The vocabulary here is deliberately **due date**, never "occurrence": what a
 * rule produces is a **Task** like any other, and a Task's date is its due date
 * (CONTEXT.md, whose Recurrence entry puts "occurrence" on the `_Avoid_` list).
 * A rule's dates are the due dates of the tasks it will generate, and there is
 * no second concept to name.
 *
 * This is TypeScript rather than PL/pgSQL on purpose: it is the part of
 * generation most likely to be wrong (month-end clamping, leap years, weekday
 * anchoring), it is unit-testable here in a way a database function settled
 * through a live clock is not, and a bug in it heals with a deploy rather than
 * a migration.
 *
 * Two rules the whole module is built on:
 *
 * - **A rule never falls before its start date.** The start date is an anchor,
 *   not automatically a due date: it is one only when it independently
 *   satisfies the rule (every date does, for a daily rule).
 * - **Monthly clamping resolves from the chosen day, never from the clamped
 *   one.** The 31st in February is the 28th or 29th, and the month after that
 *   is the 31st again — a clamp is a rendering of the chosen day in a short
 *   month, not a change to what was chosen.
 */

import { addDays, dayKeyOf, dayKeyParts, dayKeyToUtcDate } from "@/lib/day/day";

export type RecurrenceFrequency = "daily" | "weekly" | "monthly";

/**
 * The scheduling half of a Recurrence — what decides *when*, with nothing about
 * what gets stamped onto the tasks. `dayOfWeek` is 0 (Sunday) to 6 (Saturday),
 * matching both `Date`'s `getUTCDay` and Postgres's `extract(dow)`.
 *
 * Both day fields are nullable because the row is: a check constraint requires
 * exactly the one its frequency calls for and forbids the other, so for a rule
 * that came from the database the field this module reads is always there.
 */
export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  startsOn: string;
};

const DAYS_IN_WEEK = 7;

/** Day 0 of the following month is the last day of this one. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOf(dayKey: string): number {
  return dayKeyToUtcDate(dayKey).getUTCDay();
}

/** The rule's date in a given month, clamped to that month's length. */
function dateInMonth(dayOfMonth: number, year: number, month: number): string {
  return dayKeyOf(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
}

/**
 * The first date on or after `from` that the rule falls on. Never earlier than
 * the rule's own start date, however far back `from` reaches — a watermark
 * older than the rule cannot conjure dates before it began.
 *
 * The fallbacks on `dayOfWeek` and `dayOfMonth` are unreachable for a rule read
 * from the database, which check-constrains each against the frequency. They
 * are here rather than a thrown error because generation is triggered by a
 * client effect that swallows every error: a total function that reads a
 * malformed rule as "the same weekday, or the same day of month, as its start
 * date" degrades to something sane, where a throw would take the whole of
 * settlement down with it.
 */
export function firstDueDateOnOrAfter(rule: RecurrenceRule, from: string): string {
  const anchor = from < rule.startsOn ? rule.startsOn : from;

  switch (rule.frequency) {
    case "daily":
      return anchor;
    case "weekly": {
      const wanted = rule.dayOfWeek ?? weekdayOf(anchor);
      return addDays(anchor, (wanted - weekdayOf(anchor) + DAYS_IN_WEEK) % DAYS_IN_WEEK);
    }
    case "monthly": {
      const { year, month, day } = dayKeyParts(anchor);
      const wanted = rule.dayOfMonth ?? day;
      const thisMonth = dateInMonth(wanted, year, month);
      if (thisMonth >= anchor) return thisMonth;
      // December rolls into January of the next year; `daysInMonth` and
      // `dayKeyOf` both take a 1-12 month, so the wrap is done here.
      return month === 12 ? dateInMonth(wanted, year + 1, 1) : dateInMonth(wanted, year, month + 1);
    }
  }
}

/** The date the rule's first task falls on — what a trainer is shown before they save. */
export function firstDueDate(rule: RecurrenceRule): string {
  return firstDueDateOnOrAfter(rule, rule.startsOn);
}

/**
 * The rule's next date strictly after `after`. Expressed as "the first date on
 * or after the day following it" so that a clamped monthly date resolves the
 * next month from the chosen day rather than from the clamp: the day after 29
 * February is 1 March, and the 31st on or after 1 March is 31 March.
 */
export function nextDueDateAfter(rule: RecurrenceRule, after: string): string {
  return firstDueDateOnOrAfter(rule, addDays(after, 1));
}

/**
 * Every date the rule falls on in `(after, through]` — the due dates generation
 * owes between the rule's watermark and its horizon. `after` is exclusive
 * because the watermark records the last date generation has *considered*, not
 * the last one it wrote.
 */
export function dueDatesBetween(rule: RecurrenceRule, after: string, through: string): string[] {
  const dates: string[] = [];
  let cursor = firstDueDateOnOrAfter(rule, addDays(after, 1));
  while (cursor <= through) {
    dates.push(cursor);
    cursor = nextDueDateAfter(rule, cursor);
  }
  return dates;
}

/**
 * How far generation reaches on a given day: today plus one interval. One
 * interval of lead means a daily recurrence always has tomorrow's task visible
 * and a weekly one always has next week's, so a trainer can work ahead — and
 * because the watermark rather than the presence of an open task is
 * authoritative, completing that task early produces nothing new.
 *
 * A month is added by calendar, clamped to the shorter month, so the horizon
 * moves at the same pace as the rule it bounds rather than drifting by the
 * length of whichever month it started in.
 */
export function generationHorizon(rule: RecurrenceRule, todayKey: string): string {
  switch (rule.frequency) {
    case "daily":
      return addDays(todayKey, 1);
    case "weekly":
      return addDays(todayKey, DAYS_IN_WEEK);
    case "monthly": {
      const { year, month, day } = dayKeyParts(todayKey);
      return month === 12 ? dateInMonth(day, year + 1, 1) : dateInMonth(day, year, month + 1);
    }
  }
}
