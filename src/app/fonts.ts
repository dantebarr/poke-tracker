import localFont from "next/font/local";

/**
 * The Safari Zone chrome's type, self-hosted per ADR-0008 — the only assets
 * in the mockup set whose licence (Google Fonts OFL) permits redistribution.
 * Scoped to the `.app` chrome wrapper in globals.css, not the global body:
 * sign-in and error keep Geist until they get their own Safari Zone
 * treatment (#30).
 */

export const pixelFont = localFont({
  src: "./fonts/press-start-2p.woff2",
  variable: "--font-press-start",
  display: "swap",
});

export const pixelBodyFont = localFont({
  src: "./fonts/vt323.woff2",
  variable: "--font-vt323",
  display: "swap",
});
