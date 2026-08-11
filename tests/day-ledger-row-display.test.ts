import { describe, expect, it } from "vitest";

import { describeLedgerRowDisplay } from "@/lib/settlement/ledger-row-display";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * Pure logic, no database — same rationale as day-ledger-months.test.ts.
 */

function entry(overrides: Partial<DayLedgerEntry> = {}): DayLedgerEntry {
  return { day: "2026-08-07", pointsEarned: 5, target: 5, delta: 0, event: "none", pokemon: null, ...overrides };
}

describe("describing how a Logbook row displays", () => {
  it("shows the points earned on a Pokemon-less day that hit its target, not a dash (#35)", () => {
    const display = describeLedgerRowDisplay(entry({ pokemon: null, pointsEarned: 8, target: 4, delta: 4 }));

    expect(display.pointsDisplay).toBe(8);
  });

  it("shows the points earned on a Pokemon-less day that missed its target, not a dash (#35)", () => {
    const display = describeLedgerRowDisplay(entry({ pokemon: null, pointsEarned: 2, target: 4, delta: -2 }));

    expect(display.pointsDisplay).toBe(2);
  });

  it("keeps the muted styling on a Pokemon-less day", () => {
    const display = describeLedgerRowDisplay(entry({ pokemon: null }));

    expect(display.ptsVariant).toBe(" muted");
    expect(display.rowVariant).toBe(" none");
  });

  it("still reads a Pokemon day that missed its target as a miss", () => {
    const display = describeLedgerRowDisplay(
      entry({ pokemon: { name: "Growlithe", spritePath: "growlithe.png" }, pointsEarned: 2, target: 4, delta: -2 }),
    );

    expect(display.ptsVariant).toBe(" bad");
  });

  it("has no variant for a Pokemon day that hit its target", () => {
    const display = describeLedgerRowDisplay(
      entry({ pokemon: { name: "Growlithe", spritePath: "growlithe.png" }, pointsEarned: 4, target: 4, delta: 0 }),
    );

    expect(display.ptsVariant).toBe("");
  });

  it("flags the row itself as left when a Pokemon left, even though pokemon is now null", () => {
    const display = describeLedgerRowDisplay(entry({ pokemon: null, event: "left", delta: -1 }));

    expect(display.rowVariant).toBe(" left");
  });
});
