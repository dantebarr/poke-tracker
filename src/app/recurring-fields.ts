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
  firstTask: string | null;
  firstTaskNote: string | null;
  clampNote: string | null;
};

// Pinned to a locale and to UTC for the reason `@/lib/task/dates` pins its
// own: this string is rendered by the server and again by the browser at
// hydration, and a browser whose default locale disagrees would rewrite it
// after first paint. The day key is already the trainer's own day.
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

/**
 * The whole of what the form shows once the toggle is on.
 *
 * `startsOn` is the date chip's own value — the same field the form was
 * already filling in, which is why the chip is relabelled rather than a second
 * date being asked for. It can be blank, a trainer being free to clear it, and
 * everything downstream of it then has nothing to say: Save is refused in that
 * state regardless, so a preview guessed from a missing date would be the only
 * thing on the form claiming to know something it does not.
 */
export function describeRecurringForm({
  recurring,
  frequency,
  dayOfWeek,
  dayOfMonth,
  startsOn,
}: RecurringFields & { startsOn: string }): RecurringFormView {
  if (!recurring) {
    return {
      dateLabel: "Due",
      dayOfWeek: null,
      dayOfMonth: null,
      rule: null,
      firstTask: null,
      firstTaskNote: null,
      clampNote: null,
    };
  }

  const dated = startsOn !== "";
  // Resolved, not merely displayed: the check constraints require exactly the
  // day its frequency calls for and refuse the other (ADR-0001), so a weekly
  // rule submitted with a null day of week would be rejected by the database
  // rather than quietly defaulted by it.
  const weekly = frequency === "weekly";
  const monthly = frequency === "monthly";
  const resolvedDayOfWeek = weekly
    ? (dayOfWeek ?? (dated ? dayKeyToUtcDate(startsOn).getUTCDay() : null))
    : null;
  const resolvedDayOfMonth = monthly ? (dayOfMonth ?? (dated ? dayKeyParts(startsOn).day : null)) : null;

  const rule =
    dated && (!weekly || resolvedDayOfWeek !== null) && (!monthly || resolvedDayOfMonth !== null)
      ? { frequency, dayOfWeek: resolvedDayOfWeek, dayOfMonth: resolvedDayOfMonth, startsOn }
      : null;
  const firstTask = rule && firstDueDate(rule);

  return {
    dateLabel: "Starts",
    dayOfWeek: resolvedDayOfWeek,
    dayOfMonth: resolvedDayOfMonth,
    rule,
    firstTask,
    firstTaskNote: firstTask && `First task: ${FIRST_TASK_FORMAT.format(dayKeyToUtcDate(firstTask))}`,
    clampNote:
      resolvedDayOfMonth !== null && resolvedDayOfMonth > SHORTEST_MONTH
        ? `the ${ordinal(resolvedDayOfMonth)}, or the last day in shorter months`
        : null,
  };
}
