import { redirect } from "next/navigation";

import { DayLedgerPanel } from "@/app/day-ledger-panel";
import { currentDayLedger } from "@/lib/settlement/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The day ledger, as a screen of its own (#11): the story of every past
 * settled day, read-only, most recent first, never averaged away. Today
 * never appears here — settlement never settles it (CONTEXT.md).
 *
 * Renders straight into the chrome layout's right pane (#33) — the stage,
 * the pane grid and the persistent left pane are the layout's now, not this
 * page's own wrapper.
 */
export default async function HistoryPage() {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const entries = await currentDayLedger(trainer.id);

  return <DayLedgerPanel entries={entries} />;
}
