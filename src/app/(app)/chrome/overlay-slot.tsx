"use client";

import { useSyncExternalStore } from "react";

/**
 * The overlay slot (#33): a place outside the pane track for content that
 * must escape the mobile slide's CSS transform — the mobile task detail and
 * the add sheet, both needing to sit outside `.panes`, which gains a CSS
 * `transform` while a narrow screen is showing the log pane — a transformed
 * ancestor re-anchors `position: fixed` to itself instead of the true
 * viewport, and `.detail`'s own `flex: 1` needs `.app`'s flex column, not
 * `.pane`'s. See `AppStage`'s own comment for the mobile slide this escapes.
 *
 * A single, stable DOM id rather than a React context: the relationship is
 * one layout to one consumer (the field screen), so there is nothing a
 * context would carry that a fixed id doesn't already say. The layout
 * renders the slot div once, as a sibling of the stage; the field screen —
 * the one thing with overlays to show — portals into it via `useOverlaySlot`.
 * The layout gains a slot, not knowledge of tasks: it neither knows nor
 * cares what ends up inside.
 *
 * `useSyncExternalStore` rather than a ref callback feeding `useState`: the
 * slot div is already in the server-rendered HTML by the time any client
 * code runs, so `getSnapshot` can find it by id on the very first client
 * render — no extra render pass waiting on a ref to fire. That still can't
 * make portalled content part of the *server-rendered* HTML itself (a
 * portal's target only exists once the DOM does), so a fresh load of a link
 * straight into a task still paints the plain field log for one frame
 * before hydration portals the detail screen in; this is the closest to
 * instant a client-only portal gets.
 */
export const OVERLAY_SLOT_ID = "overlay-slot";

function getSnapshot(): HTMLDivElement | null {
  return document.getElementById(OVERLAY_SLOT_ID) as HTMLDivElement | null;
}

function getServerSnapshot(): null {
  return null;
}

function subscribe(): () => void {
  // The slot is rendered once by the layout and never remounted for the
  // life of the tab, so there is nothing to subscribe to — `getSnapshot`
  // resolving it on first read is the whole story.
  return () => {};
}

/** The portal target, or `null` until the slot has mounted. */
export function useOverlaySlot(): HTMLDivElement | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The slot itself: a sibling of the stage inside the chrome wrapper. Rendered
 * as `contents` so it never becomes a flex box of its own — whatever portals
 * in here (the mobile task detail, sized by its own `flex: 1`) needs to sit
 * directly in `.app`'s flex column, the same way it always has.
 */
export function OverlaySlot() {
  return <div id={OVERLAY_SLOT_ID} className="overlay-slot contents" />;
}
