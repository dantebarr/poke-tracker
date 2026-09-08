import type { EditableFields } from "@/app/task-edit-fields";
import { dayKeyParts, dayKeyToUtcDate } from "@/lib/day/day";
import { firstDueDate, type RecurrenceFrequency, type RecurrenceRule } from "@/lib/recurrence/dates";

/**
 * The recurring half of the add form (#15), as a plain module: what the two
 * add surfaces hold while a trainer fills it in, and everything they render
 * from it. No React, no database, no clock — every date is one the caller
 * supplies, which here is the trainer's own day key rather than the device's
 * (ADR-0004). `@/app/task-edit-fields` is the same shape for the fields a
 * recurring rule shares with a one-off task.
 *
 * The reason this is a module rather than logic inside the components is that
 * the suite is node-environment only, with no DOM tests: extracted here, the
 * defaulting, the resolved first date and the clamping note are provable, and
 * the components keep only state and markup.
 *
 * **The preview calls the same function generation does.** `firstDueDate` is
 * what settlement's arithmetic resolves a rule's first date with, so what a
 * trainer is shown before they save and what actually arrives cannot disagree
 * — the alternative, a second implementation for display, is a bug waiting for
 * a month with 30 days in it.
 */

/**
 * What the form holds. Both day fields are nullable and mean **"follow the
 * date"**: a trainer who has not touched the picker gets the weekday, or day
 * of month, of the date they already chose, and one who has gets what they
 * picked. Storing the default as absence rather than copying it in is what
 * lets changing the date move the default while leaving an override alone —
 * a copied-in default could only do one of those.
 *
 * The consequence, worth naming because a trainer can reach it in one click:
 * *touching* the picker fixes the day even if what they picked is the value
 * already shown, and following the date again means switching frequency away
 * and back. That is the right way round — a trainer who opened the picker at
 * all was thinking about the day, and a chosen value that silently moved
 * later would be the worse surprise.
 */
export type RecurringFields = {
  recurring: boolean;
  frequency: RecurrenceFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
};

/**
 * What the recurring half of a new task's form starts as: off, on the
 * frequency that asks the fewest further questions. Nothing here depends on
 * the date, so unlike `newTaskFields` it takes no defaults.
 */
export function newRecurringFields(): RecurringFields {
  return { recurring: false, frequency: "daily", dayOfWeek: null, dayOfMonth: null };
}

/**
 * Everything a new task's form hands over on Save — the fields any task has,
 * plus the recurring half. Which of the two writes it becomes is the caller's
 * to decide from `describeRecurringForm`'s `rule`, not the form's.
 */
export type NewTaskFields = EditableFields & RecurringFields;

/**
 * The weekly picker's options, indexed by the day number the rest of the
 * system counts in: 0 is Sunday, matching `Date`'s `getUTCDay` and Postgres's
 * `extract(dow)` (`@/lib/recurrence/dates`). Written out rather than formatted
 * so that the index and the name cannot drift apart, which a locale-driven
 * list is one `Intl` change away from doing.
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

/** The monthly picker's options. The 29th through the 31st are offered and clamped, not withheld. */
export const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1);

/** Every frequency, in the order the picker offers them, with the words it offers them in. */
export const FREQUENCY_OPTIONS: { frequency: RecurrenceFrequency; name: string }[] = [
  { frequency: "daily", name: "Day" },
  { frequency: "weekly", name: "Week" },
  { frequency: "monthly", name: "Month" },
];

/** Everything the two add surfaces render for the recurring half of the form. */
export type RecurringFormView = {
  /** The date chip's name — the field means something different once recurring is on. */
  dateLabel: "Due" | "Starts";
  /** What the weekly picker shows, resolved; null when the frequency does not ask for one. */
  dayOfWeek: number | null;
  /** What the monthly picker shows, resolved; null when the frequency does not ask for one. */
  dayOfMonth: number | null;
  /** What would be created, ready to submit; null while there is nothing to create. */
  rule: RecurrenceRule | null;
  /** The day key the rule's first task falls on, not a task — null while there is no rule. */
  firstTaskDate: string | null;
  firstTaskNote: string | null;
  clampNote: string | null;
};

// Pinned to a locale and to UTC for the reason `@/lib/task/dates` pins its
// own: this string is rendered by the server and again by the browser at
// hydration, and a browser whose default locale disagrees would rewrite it
// after first paint. The day key is already the trainer's own day.
//
// "Monday, Jan 15" rather than #15's illustrative "Wednesday 9 Sep": the
// criterion is that the date reads in plain language, and every other date in
// this app is already month-first (`@/lib/task/dates`'s own formatters). One
// form saying the day first would read as a different app's, which is a worse
// outcome than departing from a sketch in the ticket.
const FIRST_TASK_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

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
 * What the add form submits, for whichever of the two writes it turned out to
 * be — `createTaskAction` when `rule` is null, `createRecurrenceAction` when it
 * is not. The caller picks the action; this builds the body for it.
 *
 * Here rather than inline in the component because it is the one part of the
 * form the component could get wrong invisibly: a misspelt key reads back as a
 * missing required field at runtime and as nothing at all at compile time,
 * `FormData` being string-keyed. Built here, `tests/recurrence-writes.test.ts`
 * drives the real action with the real body the real form produces.
 *
 * A rule takes `startsOn` where a task takes `dueDate` — the same value from
 * the same chip, named for what it means on each path.
 */
export function newTaskFormData(fields: NewTaskFields, rule: RecurrenceRule | null): FormData {
  const formData = new FormData();
  formData.set("title", fields.title);
  formData.set("labelId", fields.labelId);
  formData.set("size", fields.size);
  formData.set("notes", fields.notes);

  if (!rule) {
    formData.set("dueDate", fields.dueDate);
    return formData;
  }

  formData.set("frequency", rule.frequency);
  formData.set("startsOn", rule.startsOn);
  // Empty, not absent, for the day this frequency does not want: the action
  // reads a blank field as null, and a check constraint refuses a rule
  // carrying the other frequency's day (ADR-0001).
  formData.set("dayOfWeek", rule.dayOfWeek === null ? "" : String(rule.dayOfWeek));
  formData.set("dayOfMonth", rule.dayOfMonth === null ? "" : String(rule.dayOfMonth));
  return formData;
}

// What an undated form's pickers show. Only reachable by clearing the date
// chip, which `newTaskFields` fills in and Save refuses without — the pickers
// stay on screen rather than vanishing with the date, so no field the form is
// offering becomes unreachable (`UI-CONSTRAINTS.md`).
const UNDATED_DAY_OF_WEEK = 0;
const UNDATED_DAY_OF_MONTH = 1;

/**
 * The whole of what the form shows once the toggle is on.
 *
 * Takes the form's own `dueDate` — the chip is relabelled rather than a second
 * date being asked for, so the one field means "due" or "starts" depending on
 * this very toggle, and translating it into a rule's `startsOn` happens here,
 * once, rather than at each call site.
 *
 * It can be blank, a trainer being free to clear it, and there is then no rule
 * and nothing to preview: Save is refused in that state regardless, so a first
 * date guessed from a missing one would be the only thing on the form claiming
 * to know something it does not.
 */
export function describeRecurringForm({
  recurring,
  frequency,
  dayOfWeek,
  dayOfMonth,
  dueDate,
}: RecurringFields & { dueDate: string }): RecurringFormView {
  if (!recurring) {
    return {
      dateLabel: "Due",
      dayOfWeek: null,
      dayOfMonth: null,
      rule: null,
      firstTaskDate: null,
      firstTaskNote: null,
      clampNote: null,
    };
  }

  const dated = dueDate !== "";
  // Resolved, not merely displayed: the check constraints require exactly the
  // day its frequency calls for and refuse the other (ADR-0001), so a weekly
  // rule submitted with a null day of week would be rejected by the database
  // rather than quietly defaulted by it.
  const resolvedDayOfWeek =
    frequency === "weekly"
      ? (dayOfWeek ?? (dated ? dayKeyToUtcDate(dueDate).getUTCDay() : UNDATED_DAY_OF_WEEK))
      : null;
  const resolvedDayOfMonth =
    frequency === "monthly"
      ? (dayOfMonth ?? (dated ? dayKeyParts(dueDate).day : UNDATED_DAY_OF_MONTH))
      : null;

  const rule = dated
    ? { frequency, dayOfWeek: resolvedDayOfWeek, dayOfMonth: resolvedDayOfMonth, startsOn: dueDate }
    : null;
  const firstTaskDate = rule && firstDueDate(rule);

  return {
    dateLabel: "Starts",
    dayOfWeek: resolvedDayOfWeek,
    dayOfMonth: resolvedDayOfMonth,
    rule,
    firstTaskDate,
    firstTaskNote: firstTaskDate && `First task: ${FIRST_TASK_FORMAT.format(dayKeyToUtcDate(firstTaskDate))}`,
    clampNote:
      resolvedDayOfMonth !== null && resolvedDayOfMonth > SHORTEST_MONTH
        ? `the ${ordinal(resolvedDayOfMonth)}, or the last day in shorter months`
        : null,
  };
}
