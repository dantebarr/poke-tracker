"use client";

import { useEffect, useTransition } from "react";

import { settleOnEntry } from "@/app/actions/settlement";

/**
 * Settlement's only trigger (#10): fires once when the app is opened,
 * passing the browser's own IANA timezone. Renders nothing. Not being signed
 * in surfaces as a rejected call here — there is nothing to do about it, so
 * it is swallowed rather than shown.
 */
export function SettleOnEntry() {
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    startTransition(async () => {
      try {
        await settleOnEntry(timeZone);
      } catch {
        // Not signed in, or nothing to settle — either way, nothing to do here.
      }
    });
  }, [startTransition]);

  return null;
}
