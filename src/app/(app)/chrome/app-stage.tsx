"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { resolveNavigation } from "@/app/(app)/chrome/navigation";

/**
 * The chrome's stage (#21, moved here from the field screen by #33): the
 * Active Pokémon's scene and Warden Baoba's tray in the left pane, always —
 * the encounter view is drawn once by the layout and never taken down — and
 * whichever destination a Ranger has chosen in the right. On a wide screen
 * both panes are side by side, the field log getting the larger share. On a
 * narrow screen only one pane shows at a time, reached by the bottom tab bar
 * (or the compact Pokémon card) rather than a swipe or a stack
 * (`UI-CONSTRAINTS.md`); home is the field log, with `compact` — a small
 * Pokémon card — pinned above it.
 *
 * `left`, `right` and `compact` are pre-rendered by the server-component
 * layout that renders this; only *which* pane a narrow screen is showing
 * needs the address, so that is the one thing this component reads for
 * itself, via `resolveNavigation`. It asks only as a narrow screen: the
 * classes it produces are scoped to the mobile media query in `globals.css`
 * and have no effect on a wide screen's grid, so guessing wide would cost
 * correctness for no benefit — this way the very first paint of a shared
 * link into a destination already shows the right pane, without waiting on
 * `useSurface` to tell it which surface it's actually on.
 */
export function AppStage({
  left,
  right,
  compact,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  compact: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { rightVisible, destination } = resolveNavigation({ pathname, params, surface: "narrow" });
  const onFieldLog = destination === "field-log";

  return (
    <div className={`stage${rightVisible ? " show-right" : ""}${onFieldLog ? " on-log" : ""}`}>
      {compact}
      <div className="panes">
        <section className="pane">{left}</section>
        <section className="pane">{right}</section>
      </div>
    </div>
  );
}
