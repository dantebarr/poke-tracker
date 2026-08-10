// The one breakpoint the Safari Zone chrome switches on (globals.css's
// `@media (max-width: 900px)`). Layout itself is CSS-only everywhere else in
// this app; the handful of interactions that need to know which surface
// they're on in JS — a tap opening the mobile detail screen instead of
// expanding a row in place (#29) — read it from here rather than each
// hard-coding the number.
const MOBILE_BREAKPOINT_QUERY = "(max-width: 900px)";

export function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}
