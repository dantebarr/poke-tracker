import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  dueDatesBetween,
  firstDueDate,
  firstDueDateOnOrAfter,
  generationHorizon,
  nextDueDateAfter,
  type RecurrenceRule,
} from "@/lib/recurrence/dates";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole.
 *
 * This seam is not optional (#11's testing decisions). `tests/settlement.test.ts`
 * never fakes "today": the clock runs free and the tests move a watermark
 * instead. "Every month on the 31st, in February" is therefore untestable
 * through settlement unless CI happens to run in February, so month-end
 * clamping, leap years and weekday anchoring have to be provable here or they
 * are not provable at all.
 *
 * Fixed dates throughout, chosen for what they prove: 2024-01-15 is a Monday,
 * 2024 is a leap year, and 2023 is not.
 */

function daily(startsOn: string): RecurrenceRule {
  return { frequency: "daily", dayOfWeek: null, dayOfMonth: null, startsOn };
}

function weekly(startsOn: string, dayOfWeek: number): RecurrenceRule {
  return { frequency: "weekly", dayOfWeek, dayOfMonth: null, startsOn };
}

function monthly(startsOn: string, dayOfMonth: number): RecurrenceRule {
  return { frequency: "monthly", dayOfWeek: null, dayOfMonth, startsOn };
}

const SUNDAY = 0;
const MONDAY = 1;
const WEDNESDAY = 3;

describe("the date a rule's first task falls on", () => {
  it("is the start date itself for a daily rule", () => {
    expect(firstDueDate(daily("2024-01-15"))).toBe("2024-01-15");
  });

  it("anchors a weekly rule forward to the first chosen weekday on or after the start date", () => {
    expect(firstDueDate(weekly("2024-01-15", WEDNESDAY))).toBe("2024-01-17");
    expect(firstDueDate(weekly("2024-01-15", SUNDAY))).toBe("2024-01-21");
  });

  it("treats a start date the rule already falls on as its own first date", () => {
    expect(firstDueDate(weekly("2024-01-15", MONDAY))).toBe("2024-01-15");
    expect(firstDueDate(monthly("2024-01-15", 15))).toBe("2024-01-15");
  });

  it("takes a monthly rule to its chosen day, this month or the next", () => {
    expect(firstDueDate(monthly("2024-01-15", 20))).toBe("2024-01-20");
    expect(firstDueDate(monthly("2024-01-15", 10))).toBe("2024-02-10");
  });

  it("clamps a monthly rule to the last day of a shorter month", () => {
    expect(firstDueDate(monthly("2024-02-01", 31))).toBe("2024-02-29");
    expect(firstDueDate(monthly("2023-02-01", 31))).toBe("2023-02-28");
    expect(firstDueDate(monthly("2024-04-01", 31))).toBe("2024-04-30");
  });

  it("never falls before the start date, however far back it is asked from", () => {
    expect(firstDueDateOnOrAfter(daily("2024-01-15"), "2023-11-30")).toBe("2024-01-15");
    expect(firstDueDateOnOrAfter(monthly("2024-01-15", 10), "2023-01-01")).toBe("2024-02-10");
  });
});

describe("the date after one", () => {
  it("is the next day for a daily rule", () => {
    expect(nextDueDateAfter(daily("2024-01-15"), "2024-01-15")).toBe("2024-01-16");
  });

  it("is a week on for a weekly rule", () => {
    expect(nextDueDateAfter(weekly("2024-01-15", WEDNESDAY), "2024-01-17")).toBe("2024-01-24");
  });

  it("is the same day next month for a monthly rule", () => {
    expect(nextDueDateAfter(monthly("2024-01-15", 15), "2024-01-15")).toBe("2024-02-15");
  });

  it("resolves the month after a clamped date from the chosen day, not the clamped one", () => {
    expect(nextDueDateAfter(monthly("2024-01-01", 31), "2024-01-31")).toBe("2024-02-29");
    expect(nextDueDateAfter(monthly("2024-01-01", 31), "2024-02-29")).toBe("2024-03-31");
    expect(nextDueDateAfter(monthly("2024-01-01", 30), "2024-02-29")).toBe("2024-03-30");
  });

  it("crosses a year boundary", () => {
    expect(nextDueDateAfter(monthly("2024-01-01", 5), "2024-12-05")).toBe("2025-01-05");
  });
});

describe("every date a rule falls on in a range", () => {
  it("excludes the watermark and includes the horizon", () => {
    expect(dueDatesBetween(daily("2024-01-15"), "2024-01-15", "2024-01-18")).toEqual([
      "2024-01-16",
      "2024-01-17",
      "2024-01-18",
    ]);
  });

  it("starts at the rule's own first date when the watermark is older", () => {
    expect(dueDatesBetween(weekly("2024-01-15", WEDNESDAY), "2024-01-14", "2024-02-01")).toEqual([
      "2024-01-17",
      "2024-01-24",
      "2024-01-31",
    ]);
  });

  it("clamps every month it crosses", () => {
    expect(dueDatesBetween(monthly("2024-01-01", 31), "2023-12-31", "2024-04-30")).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
    ]);
  });

  it("is empty when the horizon has not reached the first date", () => {
    expect(dueDatesBetween(weekly("2024-01-15", WEDNESDAY), "2024-01-14", "2024-01-16")).toEqual([]);
  });
});

describe("the generation horizon — today plus one interval", () => {
  it("is tomorrow for a daily rule", () => {
    expect(generationHorizon(daily("2024-01-15"), "2024-01-15")).toBe("2024-01-16");
  });

  it("is a week out for a weekly rule", () => {
    expect(generationHorizon(weekly("2024-01-15", WEDNESDAY), "2024-01-15")).toBe("2024-01-22");
  });

  it("is a month out for a monthly rule, clamped to the shorter month", () => {
    expect(generationHorizon(monthly("2024-01-01", 15), "2024-01-15")).toBe("2024-02-15");
    expect(generationHorizon(monthly("2024-01-01", 31), "2024-01-31")).toBe("2024-02-29");
  });
});

/**
 * Every date above is a day key the caller supplied. That is the whole of how
 * a recurrence stays in the trainer's own time zone (ADR-0004): there is no
 * zone to get wrong here, because there is no clock to read one against.
 *
 * Checked structurally, the way the data access boundary is
 * (tests/data-access-boundary.test.ts), rather than by asserting a behaviour
 * — a `new Date()` reached for in one branch of one function would not show
 * up in any test whose fixtures already carry their own dates.
 */
describe("a recurrence's dates", () => {
  it("are never derived from the server's clock", async () => {
    const src = path.resolve(import.meta.dirname, "..", "src");
    const dir = path.join(src, "lib", "recurrence");
    const files = [
      ...(await readdir(dir)).map((file) => path.join(dir, file)),
      path.join(src, "app", "actions", "recurrence.ts"),
    ];

    const offenders: string[] = [];
    for (const file of files) {
      // An argument-less `new Date()`, or `Date.now()`: the two ways to read
      // the machine's own now. `new Date(Date.UTC(...))`, which builds a fixed
      // calendar date from components, is not one of them.
      if (/new Date\(\s*\)|Date\.now\s*\(/.test(await readFile(file, "utf8"))) {
        offenders.push(path.relative(src, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
