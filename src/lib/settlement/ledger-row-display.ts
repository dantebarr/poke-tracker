import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * How the Logbook (#11) renders one settled day. Being Pokemon-less styles a
 * row — `rowVariant`/`ptsVariant` mute it — but never suppresses the number
 * itself (#35): `pointsDisplay` is always the points earned, so a day that
 * hit or missed its target still reads as such even with no Pokemon to name.
 */
export type LedgerRowDisplay = {
  rowVariant: "" | " left" | " none";
  ptsVariant: "" | " muted" | " bad";
  pointsDisplay: number;
};

export function describeLedgerRowDisplay(entry: DayLedgerEntry): LedgerRowDisplay {
  return {
    rowVariant: entry.event === "left" ? " left" : entry.pokemon === null ? " none" : "",
    ptsVariant: entry.pokemon === null ? " muted" : entry.delta < 0 ? " bad" : "",
    pointsDisplay: entry.pointsEarned,
  };
}
