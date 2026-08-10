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

const NAV_ITEMS = [
  { destination: "field-log", href: FIELD_LOG_HREF, label: "Field log", icon: "check" },
  { destination: "pokedex", href: "/pokedex", label: "Pokédex", icon: "dex" },
  { destination: "logbook", href: "/history", label: "Logbook", icon: "book" },
  { destination: "settings", href: "/settings", label: "Settings", icon: "gear" },
] as const satisfies readonly { destination: Destination; href: string; label: string; icon: string }[];

/**
 * The chrome every authenticated screen wears (#21): who's signed in, which
 * day of their time here this is, and one tap to anywhere else. Since #32
 * this row is the app's *only* navigation — the field log joined the other
 * three destinations, and the floating pane arrows and the conditional
 * `← Field log` button that used to do the same job elsewhere are gone.
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
export function StatusStrip({ rangerName, day }: { rangerName: string; day: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const surface = useSurface();

  const narrow = resolveNavigation({ pathname, params, surface: "narrow" });
  const wide = resolveNavigation({ pathname, params, surface: "wide" });
  const here = surface === "narrow" ? narrow : surface === "wide" ? wide : null;

  return (
    <div className="strip">
      <span className="ball" aria-hidden="true" />
      <div className="identity">
        <span className="zone">Safari Zone</span>
        <span className="who">
          <span>Ranger {rangerName}</span>
          <span>Day {day}</span>
        </span>
      </div>
      <nav>
        {/* Only ever drawn for the narrow surface's answer; the wide one is
            always false and is enforced by CSS (`.strip nav a.home` is
            `display: none` until the mobile media query), so the arrow is
            absent from the very first paint rather than appearing and then
            being taken away. It sits in flow at the left end of this row —
            never floating over a panel, where it could cover a Pokédex tile,
            a ledger row, or Settings' own reorder arrows. */}
        {narrow.homeVisible && (
          <Link className="icobtn home" href={ENCOUNTER_HREF} title="Encounter view" aria-label="Encounter view">
            ←
          </Link>
        )}
        {NAV_ITEMS.map((item) => {
          const onNarrow = narrow.destination === item.destination;
          const onWide = wide.destination === item.destination;
          const mark = onNarrow && onWide ? " active" : onNarrow ? " active-narrow" : onWide ? " active-wide" : "";
          return (
            <Link
              key={item.destination}
              href={item.href}
              className={`icobtn${mark}`}
              title={item.label}
              aria-label={item.label}
              aria-current={here?.destination === item.destination ? "page" : undefined}
            >
              <PixelIcon name={item.icon} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
