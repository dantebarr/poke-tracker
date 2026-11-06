"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  ENCOUNTER_HREF,
  FIELD_LOG_HREF,
  resolveNavigation,
  type Destination,
} from "@/app/(app)/chrome/navigation";
import { PixelIcon } from "@/app/(app)/chrome/pixel-icon";
import { useSurface } from "@/app/responsive";

/**
 * `short` is the label a narrow screen's bottom tab bar wears, where five
 * tabs share ~390px; `narrowOnly` items are tabs a wide screen has no use for
 * (it draws the Pokémon's scene beside the field log all the time).
 */
const NAV_ITEMS = [
  { destination: "field-log", href: FIELD_LOG_HREF, label: "Field log", short: "Log", icon: "check", narrowOnly: false },
  { destination: "encounter", href: ENCOUNTER_HREF, label: "Partner", short: "Partner", icon: "ball", narrowOnly: true },
  { destination: "pokedex", href: "/pokedex", label: "Pokédex", short: "Dex", icon: "dex", narrowOnly: false },
  { destination: "logbook", href: "/history", label: "Logbook", short: "Logbook", icon: "book", narrowOnly: false },
  { destination: "settings", href: "/settings", label: "Settings", short: "Settings", icon: "gear", narrowOnly: false },
] as const satisfies readonly {
  destination: Destination;
  href: string;
  label: string;
  short: string;
  icon: string;
  narrowOnly: boolean;
}[];

/**
 * The chrome every authenticated screen wears (#21): who's signed in, which
 * day of their time here this is, how much of today's target is done, and
 * the nav. On a wide screen the nav sits in this strip as labelled buttons;
 * on a narrow one the same `<nav>` is lifted to a bottom tab bar by CSS, so
 * it stays inside thumb reach and there is one landmark either way.
 *
 * Where a Ranger is comes from `resolveNavigation`, asked twice: once as a
 * narrow screen and once as a wide one. That is not indecision — the field
 * log's marking genuinely differs between the two, and a viewport can only
 * be measured after the first paint, so the answer for each surface is
 * handed to CSS as its own class (`active-narrow`/`active-wide`) and the
 * media query picks. `aria-current` is the one thing a media query cannot
 * set, so it waits for `useSurface` and stays absent until then rather than
 * announcing a guess.
 */
export function StatusStrip({
  rangerName,
  day,
  points,
  dailyTarget,
}: {
  rangerName: string;
  day: number;
  /** Effort points earned today — `todayPoints`, computed once by the layout. */
  points: number;
  dailyTarget: number;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const surface = useSurface();

  const narrow = resolveNavigation({ pathname, params, surface: "narrow" });
  const wide = resolveNavigation({ pathname, params, surface: "wide" });
  const here = surface === "narrow" ? narrow : surface === "wide" ? wide : null;
  const pct = dailyTarget > 0 ? Math.min(100, Math.round((points / dailyTarget) * 100)) : 100;

  return (
    <div className="strip">
      <span className="ball" aria-hidden="true" />
      <div className="identity">
        <span className="zone">Safari Zone</span>
        <span className="who">
          <span className="ranger">{rangerName}</span>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <span className="day">Day {day}</span>
        </span>
      </div>
      <div className="todaychip" role="img" aria-label={`Today: ${points} of ${dailyTarget} points`}>
        <span className="todaylabel">Today</span>
        <span className="todaynum">
          {points}/{dailyTarget}
        </span>
        <span className="track">
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>
      <nav aria-label="Main">
        {NAV_ITEMS.map((item) => {
          const onNarrow = narrow.destination === item.destination;
          const onWide = wide.destination === item.destination;
          const mark = onNarrow && onWide ? " active" : onNarrow ? " active-narrow" : onWide ? " active-wide" : "";
          return (
            <Link
              key={item.destination}
              href={item.href}
              className={`navlink${mark}${item.narrowOnly ? " narrow-only" : ""}`}
              aria-label={item.label}
              aria-current={here?.destination === item.destination ? "page" : undefined}
            >
              <PixelIcon name={item.icon} />
              <span className="navtext long">{item.label}</span>
              <span className="navtext short" aria-hidden="true">
                {item.short}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
