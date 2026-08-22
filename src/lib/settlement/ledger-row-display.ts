import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * How the Logbook (#11) renders one settled day. Being Pokemon-less styles a
 * row — `rowVariant`/`ptsVariant` mute it — but never suppresses the number
 * itself (#35): `pointsDisplay` is always the points earned, so a day that
 * hit or missed its target still reads as such even with no Pokemon to name.
 *
 * A Parting (#5) gets its own variant rather than sharing `left`'s: a
 * neglect departure is a failure and should look like one, and a choice
 * shouldn't wear the same colour. The points half is untouched by which of
 * the two it was — the row stays honest about the work regardless of how the
 * day ended.
 */
export type LedgerRowDisplay = {
  rowVariant: "" | " left" | " parted" | " none";
  ptsVariant: "" | " muted" | " bad";
  pointsDisplay: number;
};

function rowVariantFor(entry: DayLedgerEntry): LedgerRowDisplay["rowVariant"] {
  if (entry.event === "left") return " left";
  if (entry.event === "parted") return " parted";
  return entry.pokemon === null ? " none" : "";
}

export function describeLedgerRowDisplay(entry: DayLedgerEntry): LedgerRowDisplay {
  return {
    rowVariant: rowVariantFor(entry),
    ptsVariant: entry.pokemon === null ? " muted" : entry.delta < 0 ? " bad" : "",
    pointsDisplay: entry.pointsEarned,
  };
}
