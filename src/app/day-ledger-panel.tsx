import { parseDateOnly } from "@/lib/task/dates";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";
import { groupDayLedgerByMonth } from "@/lib/settlement/ledger-months";
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
    case "left":
      return `${name} left — missed target by ${-entry.delta}`;
    case "approaching":
      return "A Pokémon is watching you carefully";
    case "none":
      return entry.pokemon === null ? "No Pokémon" : null;
  }
}

/**
 * The Logbook (#11, restyled to mockup B and grouped by month by #30): every
 * settled Day, grouped by month with a count so a long history stays
 * navigable, most recent first — and never Today, since settlement never
 * settles it (CONTEXT.md). There is nothing here that could show it anyway,
 * since this only ever reads `day_ledger` rows and none exists for today.
 * Ported from mockup B; `.grouphead` is reused from the field log's Bucket
 * groups (#28) rather than redefined, since a month group is the same shape.
 */
export function DayLedgerPanel({ entries }: { entries: DayLedgerEntry[] }) {
  const months = groupDayLedgerByMonth(entries);

  return (
    <div className="histpanel panel">
      <h1 className="histtop">Logbook</h1>
      <div className="histscroll">
        {months.length === 0 ? (
          <p className="clearday">No settled days yet. Come back after your first day passes.</p>
        ) : (
          months.map((month) => (
            <div key={month.key}>
              <div className="grouphead">
                <span>{month.label}</span>
                <span className="count">{month.entries.length}</span>
              </div>
              {month.entries.map((entry) => (
                <DayLedgerRow key={entry.day} entry={entry} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DayLedgerRow({ entry }: { entry: DayLedgerEntry }) {
  const description = describeEvent(entry);
  const rowVariant = entry.event === "left" ? " left" : entry.pokemon === null ? " none" : "";
  const ptsVariant = entry.pokemon === null ? " muted" : entry.delta < 0 ? " bad" : "";

  return (
    <div className={`ledgerrow${rowVariant}`}>
      <span className="ledgerdate">{formatDay(entry.day)}</span>
      <span className={`ledgerpts${ptsVariant}`}>
        {entry.pokemon === null ? "—" : entry.pointsEarned}
        <span className="sign">/{entry.target}</span>
      </span>
      {description && <span className="ledgerdesc">{description}</span>}
    </div>
  );
}
