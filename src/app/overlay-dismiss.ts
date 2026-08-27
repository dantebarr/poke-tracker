"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Leaving an overlay without reaching for its button (#34): Escape anywhere,
 * or — on the two desktop overlays, which sit inline in the log with no
 * backdrop of their own — a pointer landing outside them.
 *
 * A hook each overlay calls for itself rather than one listener in
 * `FieldScreen`, even though `FieldScreen` is what owns `overlayShowing` and
 * `leaveOverlay`. What dismissal *means* differs per overlay and two of them
 * need state that only they hold: the add editor commits its draft on the way
 * out, and an expanded row's armed delete has to be disarmed before the row
 * itself will close. Lifting that would drag overlay-local state back up
 * through props, which is the exact coupling putting the open/closed state in
 * the address was meant to remove. The cost is at most two document listeners
 * while an overlay is showing.
 *
 * `pointerdown` rather than `click`, and this is not a detail: `click` fires
 * on the common ancestor of press and release, so a text selection dragged
 * out of the notes textarea and released on the page background dispatches
 * its `click` at `<body>` — an outside click by any reading of the target,
 * and a dismissal the Ranger never asked for. `pointerdown` fires once, where
 * the gesture began, so that drag reads as inside. It covers touch and pen on
 * the same handler as a bonus.
 *
 * The bubble phase, not capture, so a handler inside the overlay gets to run
 * first and veto by calling `stopPropagation` — which is how `TaskFieldChips`
 * keeps Escape inside an open `<select>` from closing the whole overlay.
 *
 * No `setTimeout` guarding against the overlay dismissing itself on the very
 * gesture that opened it: the openers are `click` handlers, so their
 * `pointerdown` was dispatched and finished before this listener existed.
 */

/** Marks a control that is about to change the address itself. See `onHandOff`. */
export const OVERLAY_OPENER_ATTR = "data-opens-overlay";

/**
 * Everything a pointer can land on that will navigate on its own: our own
 * overlay openers, and any real link — the status strip's nav is `next/link`,
 * and a router push races `history.back()` exactly the way `pushState` does.
 */
export const ADDRESS_CHANGING_SELECTOR = `a[href], [${OVERLAY_OPENER_ATTR}]`;

/**
 * Spread onto an opener rather than writing the attribute out, so the markup
 * and the selector above cannot drift apart.
 */
export const OVERLAY_OPENER_PROPS = { [OVERLAY_OPENER_ATTR]: "" } as const;

/**
 * Whether a keydown is the "leave this" key. Escape only, and not while the
 * event has already been handled (`defaultPrevented` — how a second listener
 * stands down when a hand-built address has both desktop overlays open at
 * once, which `resolveFieldView` permits) or while an IME is mid-composition,
 * where Escape means "abandon this candidate", not "abandon this form".
 */
export function isDismissKey({
  key,
  defaultPrevented,
  composing,
}: {
  key: string;
  defaultPrevented: boolean;
  composing: boolean;
}): boolean {
  return key === "Escape" && !defaultPrevented && !composing;
}

/**
 * What an outside pointer means. `"hand-off"` is the one that isn't obvious:
 * the pointer landed on something that is itself about to change the address,
 * so whatever the overlay wanted to commit still has to be committed — but
 * *leaving* must be left to that control. `leaveOverlay` calls
 * `history.back()`, which is asynchronous, while the control it landed on
 * calls `pushState`, which is not; issuing both puts the Ranger on an entry
 * neither of them chose.
 */
export type PointerDismissal = "dismiss" | "hand-off";

export function resolvePointerDismissal({
  primaryButton,
  targetConnected,
  insideOverlay,
  onAddressChangingControl,
}: {
  primaryButton: boolean;
  targetConnected: boolean;
  insideOverlay: boolean;
  onAddressChangingControl: boolean;
}): PointerDismissal | null {
  // A right-click or a second finger is not a decision to leave.
  if (!primaryButton) return null;
  // A node already detached from the document — a popup layer, or something
  // React has just removed — cannot meaningfully be outside anything.
  if (!targetConnected) return null;
  if (insideOverlay) return null;
  return onAddressChangingControl ? "hand-off" : "dismiss";
}

export function useOverlayDismiss({
  active,
  ref,
  outsidePointer = true,
  onDismiss,
  onHandOff,
}: {
  /** No listeners at all while false. */
  active: boolean;
  /** The overlay's own element. Required whenever `outsidePointer` is true. */
  ref?: RefObject<HTMLElement | null>;
  /**
   * False for the overlays that cover the viewport: the mobile detail screen
   * has no outside, and the add sheet's backdrop already owns its own
   * outside tap — a second listener would fire `leaveOverlay` twice.
   */
  outsidePointer?: boolean;
  /** Commit whatever this overlay holds, then leave it. */
  onDismiss: () => void;
  /** Commit only. Leaving belongs to whatever the pointer landed on. */
  onHandOff?: () => void;
}) {
  // Read at event time rather than closed over, the same way `useTaskFields`
  // holds its `liveSave`, so the listeners attach once per activation instead
  // of once per render.
  const handlers = useRef({ onDismiss, onHandOff });
  useEffect(() => {
    handlers.current = { onDismiss, onHandOff };
  });

  useEffect(() => {
    if (!active) return;

    // One dismissal per activation. Both branches below commit, and the
    // second call would find `pushedOverlay` already spent and
    // `replaceState` away an entry that was never ours.
    let spent = false;

    function handleKeyDown(event: KeyboardEvent) {
      if (spent) return;
      if (
        !isDismissKey({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          composing: event.isComposing || event.keyCode === 229,
        })
      ) {
        return;
      }
      event.preventDefault();
      spent = true;
      handlers.current.onDismiss();
    }

    function handlePointerDown(event: PointerEvent) {
      if (spent) return;
      const container = ref?.current;
      const target = event.target;
      if (!container || !(target instanceof Element)) return;

      const outcome = resolvePointerDismissal({
        primaryButton: event.button === 0 && event.isPrimary,
        targetConnected: target.isConnected,
        insideOverlay: container.contains(target),
        onAddressChangingControl: target.closest(ADDRESS_CHANGING_SELECTOR) !== null,
      });

      if (outcome === "hand-off") {
        const handOff = handlers.current.onHandOff;
        if (!handOff) return;
        spent = true;
        handOff();
        return;
      }

      if (outcome === "dismiss") {
        spent = true;
        handlers.current.onDismiss();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    if (outsidePointer) document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [active, outsidePointer, ref]);
}
