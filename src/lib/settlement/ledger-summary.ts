import { parseDateOnly } from "@/lib/task/dates";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * A few totals over the settled days the Logbook already read, for the strip
 * at the top of it. Nothing here is stored or averaged into the ledger itself
 * — each row stays as it was judged — this only counts them.
 *
 * A **good day** is one whose points met the target the day was judged against
 * (`pointsEarned >= target`), regardless of whether a Pokémon was there to
 * gain from it. `currentStreak` is the run of good days ending at the most
 * recent settled day; a gap in the calendar (a day with no row) ends it.
 */
export type LedgerSummary = {
  daysLogged: number;
  goodDays: number;
  currentStreak: number;
  bestStreak: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function isGood(entry: DayLedgerEntry): boolean {
  return entry.pointsEarned >= entry.target;
}

function daysApart(later: string, earlier: string): number {
  return Math.round((parseDateOnly(later).getTime() - parseDateOnly(earlier).getTime()) / DAY_MS);
}

/** `entries` is most-recent-first, as `listDayLedger` returns it. */
export function summariseLedger(entries: DayLedgerEntry[]): LedgerSummary {
  let goodDays = 0;
  let bestStreak = 0;
  let run = 0;
  let currentStreak = 0;
  let stillCurrent = true;

  entries.forEach((entry, index) => {
    const good = isGood(entry);
    if (good) goodDays += 1;

    const contiguous = index === 0 || daysApart(entries[index - 1].day, entry.day) === 1;
    run = good ? (contiguous ? run : 0) + 1 : 0;
    bestStreak = Math.max(bestStreak, run);

    if (stillCurrent) {
      if (good && contiguous) currentStreak += 1;
      else stillCurrent = false;
    }
  });

  return { daysLogged: entries.length, goodDays, currentStreak, bestStreak };
}
