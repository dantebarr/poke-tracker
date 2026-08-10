import { parseDateOnly } from "@/lib/task/dates";
import type { DayLedgerEntry } from "@/lib/settlement/ledger";

/**
 * A run of settled days sharing a calendar month, for the Logbook (#30) to
 * read: "grouped by month with a count so a long history stays navigable."
 * `label` is formatted from the group's first entry — every entry in a group
 * shares a month by construction, so any of them would format identically.
 */
export type DayLedgerMonthGroup = {
  key: string;
  label: string;
  entries: DayLedgerEntry[];
};

const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

/**
 * Groups settled days into contiguous months, preserving whichever order
 * `entries` already has — `listDayLedger` hands back most-recent-first, and
 * this never re-sorts, so the Logbook stays most-recent-first too. Adjacent
 * entries are compared by their stored `day` key's year-month prefix rather
 * than a parsed `Date`, so this can never disagree with a discontiguous
 * ledger about which days share a month.
 */
export function groupDayLedgerByMonth(entries: DayLedgerEntry[]): DayLedgerMonthGroup[] {
  const groups: DayLedgerMonthGroup[] = [];

  for (const entry of entries) {
    const key = entry.day.slice(0, 7);
    const current = groups.at(-1);
    if (current && current.key === key) {
      current.entries.push(entry);
    } else {
      groups.push({ key, label: MONTH_YEAR_FORMAT.format(parseDateOnly(entry.day)), entries: [entry] });
    }
  }

  return groups;
}
