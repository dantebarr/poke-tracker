"use client";

import { useState } from "react";

import { setNickname } from "@/app/actions/pokemon";

/**
 * The naming prompt's one form (#24), rendered in two shapes by
 * `PokemonPane` — `variant="box"` for the desktop corner slot
 * `EncounterView` exposes, `variant="fold"` for the mobile slot inside
 * Warden Baoba's tray `BaobaTray` exposes (globals.css's `.naming`/
 * `.namingsay` decide, per breakpoint, which one is actually visible).
 * Both post to the same `setNickname` action and share `onSkip`, so
 * dismissing the prompt on one surface dismisses it on the other too.
 */
const COPY: Record<"box" | "fold", { formClass: string; labelClass: string; label: string; said: string }> = {
  box: { formClass: "naming textbox", labelClass: "head", label: "NEW ARRIVAL", said: "It hasn't got a name yet." },
  fold: {
    formClass: "lines namingsay",
    labelClass: "who",
    label: "WARDEN BAOBA",
    said: "Hasn't got a name yet, has it, Ranger? Might be time to fix that.",
  },
};

export function NamingPrompt({
  instanceId,
  speciesName,
  variant,
  onSkip,
}: {
  instanceId: string;
  speciesName: string;
  variant: "box" | "fold";
  onSkip: () => void;
}) {
  const [name, setName] = useState("");
  const canSubmit = name.trim().length > 0;
  const copy = COPY[variant];

  return (
    <form action={setNickname.bind(null, instanceId)} className={copy.formClass}>
      <div className={copy.labelClass}>{copy.label}</div>
      <p>{copy.said}</p>
      <input
        type="text"
        name="nickname"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={speciesName}
        aria-label="Nickname"
        autoComplete="off"
      />
      <div className="namingactions">
        <button type="button" className="skip" onClick={onSkip}>
          Not yet
        </button>
        <button type="submit" className="primary" disabled={!canSubmit}>
          Name it
        </button>
      </div>
    </form>
  );
}
