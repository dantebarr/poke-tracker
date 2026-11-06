import { describe, expect, it } from "vitest";

import type { DayLedgerEntry } from "@/lib/settlement/ledger";
import { summariseLedger } from "@/lib/settlement/ledger-summary";

/** Pure logic, no database. */
function entry(day: string, pointsEarned: number, target = 5): DayLedgerEntry {
  return { day, pointsEarned, target, delta: 0, event: "none", pokemon: null };
}

describe("summarising the Logbook", () => {
  it("is all zeros for an empty ledger", () => {
    expect(summariseLedger([])).toEqual({ daysLogged: 0, goodDays: 0, currentStreak: 0, bestStreak: 0 });
  });

  it("counts days at or above the target they were judged against", () => {
    const summary = summariseLedger([entry("2026-08-03", 5), entry("2026-08-02", 4), entry("2026-08-01", 9)]);
    expect(summary.daysLogged).toBe(3);
    expect(summary.goodDays).toBe(2);
  });

  it("measures the current streak from the most recent day", () => {
    const summary = summariseLedger([
      entry("2026-08-04", 6),
      entry("2026-08-03", 5),
      entry("2026-08-02", 1),
      entry("2026-08-01", 7),
    ]);
    expect(summary.currentStreak).toBe(2);
    expect(summary.bestStreak).toBe(2);
  });

  it("has no current streak when the latest day missed", () => {
    const summary = summariseLedger([entry("2026-08-03", 0), entry("2026-08-02", 5), entry("2026-08-01", 5)]);
    expect(summary.currentStreak).toBe(0);
    expect(summary.bestStreak).toBe(2);
  });

  it("ends a streak at a gap in the calendar", () => {
    const summary = summariseLedger([entry("2026-08-05", 5), entry("2026-08-03", 5)]);
    expect(summary.currentStreak).toBe(1);
    expect(summary.bestStreak).toBe(1);
  });
});
