import type { LedgerOutcome } from "@/lib/settlement/reducer";

/**
 * What a settled day did, for the history screen (#11) to read. `bond` and
 * `left` come straight from the ledger row's own `outcome`; `arrived` is
 * inferred rather than stored, since an arrival isn't itself a bond event
 * (the migration's `day_ledger` comment) and so the reducer files it under
 * `none` like any other uneventful day.
 */
export type DayLedgerEvent = "bond" | "left" | "arrived" | "none";

/**
 * `outcome` already distinguishes bond and left. The one case it doesn't say
 * outright is an arrival: a `none` day whose active instance differs from the
 * day before it — the only way an instance can appear there at all, since a
 * pokemon-less day carries a null instance and settlement never swaps one
 * active instance for another outright.
 */
export function deriveDayLedgerEvent(args: {
  outcome: LedgerOutcome;
  activeInstanceId: string | null;
  previousInstanceId: string | null;
}): DayLedgerEvent {
  if (args.outcome === "bond" || args.outcome === "left") {
    return args.outcome;
  }
  if (args.activeInstanceId !== null && args.activeInstanceId !== args.previousInstanceId) {
    return "arrived";
  }
  return "none";
}
