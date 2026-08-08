import { describe, expect, it } from "vitest";

import { daysToSettle, groupTasksByDay } from "@/lib/settlement/timezone";

/**
 * Pure logic, no database — see task-dates.test.ts for the same note. The
 * day-key primitives these build on (`dayKeyInTimeZone`, `addDays`) are
 * tested directly in day.test.ts.
 */

describe("daysToSettle", () => {
  it("is empty when already caught up to today", () => {
    expect(daysToSettle("2024-03-01", "2024-03-01")).toEqual([]);
  });

  it("is empty when the last settled day is yesterday", () => {
    expect(daysToSettle("2024-03-01", "2024-03-02")).toEqual([]);
  });

  it("lists every day after the last settled one, up to but excluding today", () => {
    expect(daysToSettle("2024-03-01", "2024-03-05")).toEqual([
      "2024-03-02", "2024-03-03", "2024-03-04",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(daysToSettle("2024-01-30", "2024-02-02")).toEqual(["2024-01-31", "2024-02-01"]);
  });
});

describe("groupTasksByDay", () => {
  it("lands a task completed at 23:59 and one at 00:01 on different days", () => {
    const tasks = [
      { id: "late", completedAt: "2024-01-15T23:59:00.000Z" },
      { id: "early", completedAt: "2024-01-16T00:01:00.000Z" },
    ];

    const groups = groupTasksByDay(tasks, "UTC");

    expect(groups.get("2024-01-15")).toEqual([tasks[0]]);
    expect(groups.get("2024-01-16")).toEqual([tasks[1]]);
  });
});
