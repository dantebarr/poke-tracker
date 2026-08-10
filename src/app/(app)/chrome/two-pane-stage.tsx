"use client";

import { useState } from "react";

/**
 * The field screen's two-pane stage shell (#21): the grid mockup B draws on
 * desktop, and — per UI-CONSTRAINTS.md's "a visible affordance beats a
 * gesture every time" — an explicit switch button on mobile rather than a
 * swipe. `left` and `right` arrive pre-rendered from a server component, so
 * this client boundary is only ever the switching mechanism, never the
 * content inside it.
 */
export function TwoPaneStage({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  leftLabel: string;
  rightLabel: string;
}) {
  const [showRight, setShowRight] = useState(false);

  return (
    <div className={`stage${showRight ? " show-right" : ""}`}>
      <div className="panes">
        <section className="pane">
          {left}
          <button
            type="button"
            className="pane-switch"
            onClick={() => setShowRight(true)}
            aria-label={`View ${rightLabel}`}
            title={rightLabel}
          >
            →
          </button>
        </section>
        <section className="pane">
          {right}
          <button
            type="button"
            className="pane-switch"
            onClick={() => setShowRight(false)}
            aria-label={`View ${leftLabel}`}
            title={leftLabel}
          >
            ←
          </button>
        </section>
      </div>
    </div>
  );
}
