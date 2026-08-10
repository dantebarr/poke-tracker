import { findLatestDayLedgerEvent, listDayLedger, type DayLedgerEntry, type LatestDayLedgerEvent } from "@/lib/settlement/ledger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The read side. Server components call this; the only writer is the
 * settlement function itself (@/lib/settlement/settlement) — there is no
 * server action here, since nothing on the history screen may rewrite a
 * settled day.
 */

/** A trainer's settled days, most recent first. Row-level security scopes this to the caller's own. */
export async function currentDayLedger(trainerId: string): Promise<DayLedgerEntry[]> {
  const client = await createSupabaseServerClient();
  return listDayLedger(client, trainerId);
}

/** The most recent settled day's event, for the field screen's dialogue tray (#23). */
export async function currentLatestDayLedgerEvent(trainerId: string): Promise<LatestDayLedgerEvent> {
  const client = await createSupabaseServerClient();
  return findLatestDayLedgerEvent(client, trainerId);
}
