import { redirect } from "next/navigation";

import { DayLedgerPanel } from "@/app/day-ledger-panel";
import { currentDayLedger } from "@/lib/settlement/session";
import { currentTrainer } from "@/lib/trainer/session";

/**
 * The day ledger, as a screen of its own (#11): the story of every past
 * settled day, read-only, most recent first, never averaged away. Today
 * never appears here — settlement never settles it (CONTEXT.md).
 */
export default async function HistoryPage() {
  const trainer = await currentTrainer();

  if (!trainer) {
    redirect("/sign-in");
  }

  const entries = await currentDayLedger(trainer.id);

  return (
    <div className="stage">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
        <h1 className="text-2xl font-semibold">History</h1>

        <DayLedgerPanel entries={entries} />
      </main>
    </div>
  );
}
