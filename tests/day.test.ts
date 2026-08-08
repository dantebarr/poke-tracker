import { describe, expect, it } from "vitest";

import { addDays, dayKeyInTimeZone, dayKeyToUtcDate, daysBetweenKeys } from "@/lib/day/day";
import { groupTasksByDay } from "@/lib/settlement/timezone";
import { groupDoneByDay } from "@/lib/task/dates";

/**
 * Pure logic, no database. `dayKeyInTimeZone` and `addDays` are the shared
 * primitives both settlement (`@/lib/settlement/timezone`) and task display
 * (`@/lib/task/dates`) build on — see CONTEXT.md's "Day" entry and
 * ADR-0004 for why there is exactly one implementation rather than two that
 * could drift apart.
 */

describe("dayKeyInTimeZone", () => {
  it("uses the given timezone rather than the server's own", () => {
    // 02:30 UTC on the 2nd is still 18:30 on the 1st in Los Angeles.
    const date = new Date("2024-03-02T02:30:00.000Z");

    expect(dayKeyInTimeZone(date, "UTC")).toBe("2024-03-02");
    expect(dayKeyInTimeZone(date, "America/Los_Angeles")).toBe("2024-03-01");
  });
});

describe("addDays", () => {
  it("shifts forward and backward, crossing month and year boundaries", () => {
    expect(addDays("2024-01-30", 2)).toBe("2024-02-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2023-12-31", 1)).toBe("2024-01-01");
  });
});

describe("dayKeyToUtcDate / daysBetweenKeys", () => {
  it("round-trips a day key to the date it represents", () => {
    expect(daysBetweenKeys("2024-01-15", "2024-01-15")).toBe(0);
    expect(daysBetweenKeys("2024-01-15", "2024-01-18")).toBe(3);
    expect(daysBetweenKeys("2024-01-18", "2024-01-15")).toBe(-3);
  });

  it("is stable across a month boundary", () => {
    expect(dayKeyToUtcDate("2024-02-01").getTime()).toBeGreaterThan(dayKeyToUtcDate("2024-01-31").getTime());
    expect(daysBetweenKeys("2024-01-31", "2024-02-01")).toBe(1);
  });
});

/**
 * The invariant that actually matters (#17's testing decisions): settlement
 * and the display path must derive the same day key from the same instant
 * and zone, or the points readout and the ledger can silently disagree about
 * when a day ends again — the original bug. Both `groupTasksByDay` and
 * `groupDoneByDay` are exercised directly, on the same input, rather than
 * asserting each in isolation.
 */
describe("settlement and display agree on which day a completion belongs to", () => {
  it("for a task completed near midnight in a negative-offset zone", () => {
    const zone = "America/Vancouver";
    const completedAt = "2024-06-15T06:30:00.000Z"; // 23:30 on the 14th in Vancouver
    const task = { id: "t1", completedAt };

    const settlementGroups = groupTasksByDay([task], zone);
    const displayGroups = groupDoneByDay([task], zone, "2024-06-20");

    const settlementDay = [...settlementGroups.keys()][0];
    const displayDay = displayGroups[0].key;

    expect(settlementDay).toBe(displayDay);
    expect(settlementDay).toBe(dayKeyInTimeZone(new Date(completedAt), zone));
  });

  it("for a task completed near midnight in a positive-offset zone", () => {
    const zone = "Pacific/Auckland";
    const completedAt = "2024-06-14T13:30:00.000Z"; // just past midnight on the 15th in Auckland
    const task = { id: "t1", completedAt };

    const settlementGroups = groupTasksByDay([task], zone);
    const displayGroups = groupDoneByDay([task], zone, "2024-06-20");

    const settlementDay = [...settlementGroups.keys()][0];
    const displayDay = displayGroups[0].key;

    expect(settlementDay).toBe(displayDay);
    expect(settlementDay).toBe(dayKeyInTimeZone(new Date(completedAt), zone));
  });
});
