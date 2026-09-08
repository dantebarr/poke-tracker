import { describe, expect, it } from "vitest";

import type { RecurrenceRule } from "@/lib/recurrence/dates";
import { recurrenceSentence, shortMonthNote, WEEKDAY_NAMES } from "@/lib/recurrence/wording";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * tests/new-task-defaults.test.ts for the same note and its shape.
 *
 * How a rule is worded (#16): one sentence, used by the add form's preview and
 * by the marker on an opened task alike, so a trainer cannot be told two
 * different things about the same rule. What the sentence *resolves* is not
 * retested here — it is `firstDueDate`, and tests/recurrence-dates.test.ts owns
 * that.
 *
 * Fixed dates throughout: 2024-01-15 is a Monday, in a leap year.
 */

const MONDAY = "2024-01-15";
const WEDNESDAY = 3;

function rule(overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return { frequency: "daily", dayOfWeek: null, dayOfMonth: null, startsOn: MONDAY, ...overrides };
}

describe("recurrenceSentence", () => {
  it("words a daily rule as every day", () => {
    expect(recurrenceSentence(rule())).toBe("Every day");
  });

  it("names the weekday a weekly rule falls on", () => {
    expect(recurrenceSentence(rule({ frequency: "weekly", dayOfWeek: WEDNESDAY }))).toBe("Every Wednesday");
  });

  it("names the weekday the rule chose, not the one its start date happens to be", () => {
    // Started on a Monday, running on Wednesdays — the distinction the add
    // form's "Starts" relabelling exists for.
    const sentence = recurrenceSentence(rule({ frequency: "weekly", dayOfWeek: 0, startsOn: MONDAY }));

    expect(sentence).toBe("Every Sunday");
  });

  it("names the day of the month a monthly rule falls on", () => {
    expect(recurrenceSentence(rule({ frequency: "monthly", dayOfMonth: 1, startsOn: "2024-02-01" }))).toBe(
      "Every month on the 1st",
    );
  });

  it("words the day a monthly rule chose, never the shorter month it is clamped to", () => {
    // The first task of this rule lands on 29 February. The rule is still the
    // 31st, and saying "the 29th" would describe one month of the year.
    const sentence = recurrenceSentence(rule({ frequency: "monthly", dayOfMonth: 31, startsOn: "2024-02-01" }));

    expect(sentence).toBe("Every month on the 31st");
  });

  it("ordinals the days a trainer can pick that do not end in th", () => {
    const days = [1, 2, 3, 11, 12, 13, 21, 22, 23, 31];

    const worded = days.map((dayOfMonth) =>
      recurrenceSentence(rule({ frequency: "monthly", dayOfMonth, startsOn: MONDAY })),
    );

    expect(worded).toEqual([
      "Every month on the 1st",
      "Every month on the 2nd",
      "Every month on the 3rd",
      "Every month on the 11th",
      "Every month on the 12th",
      "Every month on the 13th",
      "Every month on the 21st",
      "Every month on the 22nd",
      "Every month on the 23rd",
      "Every month on the 31st",
    ]);
  });

  it("falls back to the start date's own day rather than throwing on a rule the constraints forbid", () => {
    // Unreachable for a rule read from the database (ADR-0001), and total
    // anyway: generation is triggered by a client effect that swallows every
    // error, so nothing on this path may throw on data that got past the
    // constraints somehow.
    expect(recurrenceSentence(rule({ frequency: "weekly" }))).toBe("Every Monday");
    expect(recurrenceSentence(rule({ frequency: "monthly" }))).toBe("Every month on the 15th");
  });
});

describe("shortMonthNote", () => {
  it("says nothing for a day every month has", () => {
    expect(shortMonthNote(28)).toBeNull();
    expect(shortMonthNote(null)).toBeNull();
  });

  it("names the clamping for a day some months do not have", () => {
    expect(shortMonthNote(31)).toBe("the 31st, or the last day in shorter months");
    expect(shortMonthNote(29)).toBe("the 29th, or the last day in shorter months");
  });
});

describe("WEEKDAY_NAMES", () => {
  it("is indexed the way the rest of the system counts days", () => {
    expect(WEEKDAY_NAMES[0]).toBe("Sunday");
    expect(WEEKDAY_NAMES).toHaveLength(7);
  });
});
