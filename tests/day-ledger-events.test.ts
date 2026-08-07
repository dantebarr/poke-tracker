import { describe, expect, it } from "vitest";

import { deriveDayLedgerEvent } from "@/lib/settlement/ledger-events";

/**
 * Pure logic, no database — same rationale as settlement-reducer.test.ts.
 * `outcome` already distinguishes bond and left; the only thing this derives
 * that the ledger row doesn't already say outright is an arrival, inferred
 * from the active instance changing on an otherwise uneventful day.
 */

const A = "instance-a";
const B = "instance-b";

describe("deriving what a settled day did, for display", () => {
  it("reports bond straight from the outcome", () => {
    expect(deriveDayLedgerEvent({ outcome: "bond", activeInstanceId: A, previousInstanceId: A })).toBe("bond");
  });

  it("reports left straight from the outcome", () => {
    expect(deriveDayLedgerEvent({ outcome: "left", activeInstanceId: A, previousInstanceId: A })).toBe("left");
  });

  it("reports an arrival when a 'none' day's instance differs from the previous day's", () => {
    expect(deriveDayLedgerEvent({ outcome: "none", activeInstanceId: A, previousInstanceId: null })).toBe(
      "arrived",
    );
    expect(deriveDayLedgerEvent({ outcome: "none", activeInstanceId: B, previousInstanceId: A })).toBe(
      "arrived",
    );
  });

  it("reports none for an uneventful day with the same instance as before", () => {
    expect(deriveDayLedgerEvent({ outcome: "none", activeInstanceId: A, previousInstanceId: A })).toBe("none");
  });

  it("reports none for a pokemon-less day", () => {
    expect(deriveDayLedgerEvent({ outcome: "none", activeInstanceId: null, previousInstanceId: null })).toBe(
      "none",
    );
  });
});
