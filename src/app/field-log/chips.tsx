"use client";

import type { KeyboardEvent } from "react";


/**
 * Escape inside a picker belongs to the picker (#34). A native `<select>` and a
 * date `<input>` both use it to shut their own picker, and letting it reach
 * `useOverlayDismiss`'s document listener would close the whole overlay out
 * from under an open dropdown — an editor vanishing mid-pick.
 *
 * React 19 attaches at the root container, which is inside `document`, so
 * this synthetic `stopPropagation` really does halt the native event before
 * the document listener runs — which is why that listener is in the bubble
 * phase and not capture.
 *
 * The cost is that Escape while a chip merely holds focus, with no picker
 * open, does nothing at all: there is no way to tell those two states apart
 * from here. That is the right side to be wrong on — an inert keypress is a
 * smaller failure than an editor closing itself mid-pick, and Tab or a click
 * puts a Ranger somewhere Escape works again.
 */
export function keepEscapeInChip(event: KeyboardEvent<HTMLElement>) {
  if (event.key === "Escape") event.stopPropagation();
}
