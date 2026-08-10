"use client";

import { useEffect, useState } from "react";

import type { Surface } from "@/app/(app)/chrome/navigation";

// The one breakpoint the Safari Zone chrome switches on (globals.css's
// `@media (max-width: 900px)`). Layout itself is CSS-only everywhere else in
// this app; the handful of things that need to know which surface they're on
// in JS read it from here rather than each hard-coding the number.
const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";

/**
 * Which surface the chrome is being worn on, or `null` until the first
 * effect runs — there is no viewport to measure while the page is being
 * rendered on the server, and guessing one would make the markup disagree
 * with itself on hydration.
 *
 * Anything whose *first paint* has to be right is therefore CSS's job, not
 * this hook's (#32): the nav marks its icons through a media query, the
 * pane slides through one, and every mobile-only control is `display: none`
 * until the query says otherwise. This hook is for the cases where a media
 * query cannot reach — choosing which component to mount, and what to tell
 * assistive tech.
 */
export function useSurface(): Surface | null {
  const [surface, setSurface] = useState<Surface | null>(null);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    const read = () => setSurface(query.matches ? "narrow" : "wide");
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  return surface;
}
