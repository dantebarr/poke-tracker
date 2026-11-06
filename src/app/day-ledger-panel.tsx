import { parseDateOnly } from "@/lib/task/dates";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";
import { groupDayLedgerByMonth } from "@/lib/settlement/ledger-months";
import { describeLedgerRowDisplay } from "@/lib/settlement/ledger-row-display";
import { summariseLedger } from "@/lib/settlement/ledger-summary";
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
    case "parted":
      return `You moved on — ${name} stayed behind`;
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
  const summary = summariseLedger(entries);

  return (
    <div className="histpanel panel">
      <h1 className="histtop">Logbook</h1>
      <div className="histscroll">
        {months.length === 0 ? (
          <LogbookEmpty />
        ) : (
          <>
            <dl className="histsummary" aria-label="Summary of settled days">
              <SummaryStat label="Days logged" value={summary.daysLogged} />
              <SummaryStat label="Target met" value={`${summary.goodDays} / ${summary.daysLogged}`} />
              <SummaryStat label="Streak" value={summary.currentStreak} note={`best ${summary.bestStreak}`} />
            </dl>
            {months.map((month) => (
              <div key={month.key}>
                <div className="grouphead">
                  <span>{month.label}</span>
                  <span className="count">{month.entries.length}</span>
                </div>
                {month.entries.map((entry) => (
                  <DayLedgerRow key={entry.day} entry={entry} />
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="histstat">
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <span className="histnote">{note}</span>}
      </dd>
    </div>
  );
}

/**
 * Nothing is settled until a day has passed, so a new Ranger's Logbook is
 * empty for a while. Say what will land here and when, with a sample row so
 * the shape is familiar by the time the first real one arrives.
 */
function LogbookEmpty() {
  return (
    <div className="histempty">
      <p className="histemptytitle">Nothing in the logbook yet</p>
      <p className="histemptytext">
        Each night your day is settled and one line lands here: the points you earned against your daily target,
        and what it meant for your Pokémon. Today is never shown until it is over, so your first entry appears
        tomorrow.
      </p>
      <p className="histemptytext">Meeting your target is a good day and builds bond. Falling short drains happiness, and a Pokémon whose happiness runs out will leave.</p>
      <div className="histsample" aria-hidden="true">
        <span className="histsamplelabel">Example</span>
        <div className="ledgerrow">
          <span className="ledgerdate">Mon, Jan 1</span>
          <span className="ledgerpts">
            6<span className="sign">/5</span>
          </span>
          <span className="ledgerdesc">Your Pokémon gained a bond point</span>
        </div>
      </div>
    </div>
  );
}

function DayLedgerRow({ entry }: { entry: DayLedgerEntry }) {
  const description = describeEvent(entry);
  const { rowVariant, ptsVariant, pointsDisplay } = describeLedgerRowDisplay(entry);

  return (
    <div className={`ledgerrow${rowVariant}`}>
      <span className="ledgerdate">{formatDay(entry.day)}</span>
      <span className={`ledgerpts${ptsVariant}`}>
        {pointsDisplay}
        <span className="sign">/{entry.target}</span>
      </span>
      {description && <span className="ledgerdesc">{description}</span>}
    </div>
  );
}
