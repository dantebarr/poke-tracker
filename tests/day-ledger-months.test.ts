import { describe, expect, it } from "vitest";

import { groupDayLedgerByMonth } from "@/lib/settlement/ledger-months";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * Pure logic, no database — same rationale as day-ledger-events.test.ts.
 */

function entry(day: string): DayLedgerEntry {
  return { day, pointsEarned: 5, target: 5, delta: 0, event: "none", pokemon: null };
}

describe("grouping the Logbook by month", () => {
  it("groups entries sharing a calendar month together", () => {
    const groups = groupDayLedgerByMonth([entry("2026-08-07"), entry("2026-08-06"), entry("2026-08-01")]);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("August 2026");
    expect(groups[0].entries).toHaveLength(3);
  });

  it("starts a new group when the month changes, without re-sorting", () => {
    const groups = groupDayLedgerByMonth([entry("2026-08-01"), entry("2026-07-31"), entry("2026-07-28")]);

    expect(groups.map((group) => group.label)).toEqual(["August 2026", "July 2026"]);
    expect(groups[0].entries.map((e) => e.day)).toEqual(["2026-08-01"]);
    expect(groups[1].entries.map((e) => e.day)).toEqual(["2026-07-31", "2026-07-28"]);
  });

  it("starts a new group for a non-contiguous run of the same month", () => {
    // Deliberately never happens for a real ledger (which is always
    // contiguous by day), but the function is defined over any order it's
    // handed — it groups adjacent entries, not all entries sharing a month.
    const groups = groupDayLedgerByMonth([entry("2026-08-05"), entry("2026-07-20"), entry("2026-08-01")]);

    expect(groups.map((group) => group.label)).toEqual(["August 2026", "July 2026", "August 2026"]);
  });

  it("returns no groups for an empty ledger", () => {
    expect(groupDayLedgerByMonth([])).toEqual([]);
  });
});
