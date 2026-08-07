import { parseDateOnly } from "@/lib/task/dates";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";
import { capitalise } from "@/lib/text";

const WEEKDAY_MONTH_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function formatDay(day: string): string {
  return WEEKDAY_MONTH_DAY_FORMAT.format(parseDateOnly(day));
}

function describeEvent(entry: DayLedgerEntry): string | null {
  const name = entry.pokemon ? capitalise(entry.pokemon.name) : null;
  switch (entry.event) {
    case "bond":
      return `${name} gained a bond point`;
    case "arrived":
      return `${name} arrived`;
    case "left":
      return `${name} left — missed target by ${-entry.delta}`;
    case "none":
      return entry.pokemon === null ? "No Pokémon" : null;
  }
}

/**
 * The day ledger, read-only (#11): each settled day showing what it earned,
 * what it was judged against, and what it did — never averaged, never in a
 * position to be rewritten. Today never appears, since settlement never
 * settles it (CONTEXT.md) — there is nothing here that could show it anyway,
 * since this only ever reads `day_ledger` rows and none exists for today.
 */
export function DayLedgerPanel({ entries }: { entries: DayLedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="rounded-lg border border-black/10 p-6 text-center">
        <p className="text-lg font-medium">No settled days yet</p>
        <p className="mt-1 text-sm text-black/60">Come back after your first day passes.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-black/10 p-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-black/60">History</h2>
      <ul className="mt-4 flex flex-col gap-2">
        {entries.map((entry) => (
          <DayLedgerRow key={entry.day} entry={entry} />
        ))}
      </ul>
    </section>
  );
}

function DayLedgerRow({ entry }: { entry: DayLedgerEntry }) {
  const metTarget = entry.delta >= 0;
  const description = describeEvent(entry);

  return (
    <li className="rounded-lg border border-black/10 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-wide text-black/60">
          {formatDay(entry.day)}
        </span>
        <span className={`shrink-0 text-sm font-medium ${metTarget ? "text-emerald-700" : "text-red-700"}`}>
          {entry.pointsEarned} / {entry.target}
        </span>
      </div>
      {description && <p className="mt-1.5 text-sm">{description}</p>}
    </li>
  );
}
