"use client";

import { useEffect, useRef } from "react";

/** Typing surfaces swallow letter keys: a shortcut must never fire inside one. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

/**
 * Desktop keyboard speed: `n` or `a` opens the add form. Escape needs nothing
 * here — `useOverlayDismiss` already closes whichever overlay is open.
 *
 * Skipped while typing, with a modifier held (so Cmd-N and friends stay the
 * browser's), and while `enabled` is false (an overlay is already showing).
 */
export function useAddShortcut(onOpen: () => void, enabled: boolean) {
  const latest = useRef(onOpen);
  useEffect(() => {
    latest.current = onOpen;
  });

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "n" && event.key !== "a") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      latest.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
