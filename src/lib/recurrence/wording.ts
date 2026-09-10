import { dayKeyParts, dayKeyToUtcDate } from "@/lib/day/day";
import { firstDueDate, type RecurrenceRule } from "@/lib/recurrence/dates";

/**
 * How a **Recurrence** is put into words. Pure: a rule in, a sentence out, no
 * database and no clock.
 *
 * One module because a rule is worded in two places — the add form's preview,
 * before it exists, and the marker on a task it generated afterwards (#16) —
 * and a trainer who was told "every Wednesday" while saving and something else
 * on opening the task would have no way to tell which was true. There is one
 * sentence, and both read it from here.
 *
 * The wording avoids *repeat*, *series* and *occurrence*, which CONTEXT.md puts
 * on the Recurrence's `_Avoid_` list — hence "Every Wednesday" rather than
 * #16's illustrative "Repeats every Wednesday", and matching the "Every"/"On"
 * the add form's own pickers are already labelled with.
 */

/**
 * Indexed by the day number the rest of the system counts in: 0 is Sunday,
 * matching `Date`'s `getUTCDay` and Postgres's `extract(dow)`
 * (`@/lib/recurrence/dates`). Written out rather than formatted so that the
 * index and the name cannot drift apart, which a locale-driven list is one
 * `Intl` change away from doing.
 */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// February is the short month that matters, but 30 and 31 are worth naming
// too — a rule on the 31st skips four months a year without this.
const SHORTEST_MONTH = 28;

function ordinal(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * The rule in plain language — what the add form promises and what an opened
 * task states.
 *
 * The weekly case reads its weekday off `firstDueDate`, the very function
 * generation resolves a rule's dates with, rather than off `dayOfWeek`
 * directly. The two agree for every rule the check constraints permit; for one
 * they do not (a weekly rule carrying no day of week, which ADR-0001 makes
 * unrepresentable) the sentence degrades exactly as the dates do, to the start
 * date's own weekday, rather than throwing. Nothing on this path may throw:
 * generation is triggered by a client effect that swallows every error.
 *
 * The monthly case cannot do the same, and deliberately does not: a rule on
 * the 31st starting in February has a first date of the 29th, and wording the
 * rule from it would describe one month of the year rather than the rule. The
 * chosen day is what is said; `shortMonthNote` is what says the rest.
 */
export function recurrenceSentence(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "daily":
      return "Every day";
    case "weekly":
      return `Every ${WEEKDAY_NAMES[dayKeyToUtcDate(firstDueDate(rule)).getUTCDay()]}`;
    case "monthly":
      return `Every month on the ${ordinal(rule.dayOfMonth ?? dayKeyParts(firstDueDate(rule)).day)}`;
  }
}

/**
 * The caveat a month-end rule carries — *"the 31st, or the last day in shorter
 * months"* — so the clamping is something a trainer chose rather than something
 * they discover in February. Null for a day every month has, and for a rule
 * that has no day of the month at all.
 *
 * Takes the day rather than a rule because the add form asks it of a day a
 * trainer has picked but not yet dated, where there is no rule to ask about.
 */
export function shortMonthNote(dayOfMonth: number | null): string | null {
  if (dayOfMonth === null || dayOfMonth <= SHORTEST_MONTH) return null;
  return `the ${ordinal(dayOfMonth)}, or the last day in shorter months`;
}
