"use client";

import { useState } from "react";

import { setPartingAction } from "@/app/actions/pokemon";
import type { FieldMenuItem } from "@/lib/pokemon/encounter-view";

/**
 * The field menu (#5): the corner menu holding the actions a Ranger takes
 * *on* their Active Pokémon, as distinct from the prompts the app offers
 * them — which is why it lives in its own corner rather than the prompt slot
 * the naming and evolve boxes share, and why it does not fold into Warden
 * Baoba's tray on a narrow screen the way those two do. Those are offered;
 * this is initiated, and a single small icon in an otherwise empty corner
 * needs no room made for it.
 *
 * Collapsed to a hamburger icon by default, bottom-right of the scene —
 * confirmed free, with the status box top-left and both prompt boxes
 * top-right. Whether it renders at all, and which item it offers, are
 * `buildEncounterView`'s decisions (`view.fieldMenu`); this component derives
 * neither. Open/closed is client state and nothing more: the Parting itself
 * is server state, and a menu left open is not a decision.
 *
 * Neither form closes the menu itself. `PokemonPane` keys this component on
 * the parting flag, so a decision that actually lands remounts it back to
 * its collapsed icon (#15) — which means the box a Ranger is looking at
 * stays put until the write has committed, rather than snapping shut on a
 * submit that might yet fail.
 */
const COPY: Record<FieldMenuItem, string> = {
  "move-on": "MOVE ON",
  "cancel-move": "CANCEL MOVE",
};

export function FieldMenu({ items, nickname }: { items: FieldMenuItem[]; nickname: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function close() {
    setOpen(false);
    setConfirming(false);
  }

  if (confirming) {
    return <PartingConfirmation nickname={nickname} onCancel={close} />;
  }

  if (!open) {
    return (
      <button type="button" className="fieldmenutoggle" onClick={() => setOpen(true)} aria-label="Field menu">
        <span aria-hidden="true">☰</span>
      </button>
    );
  }

  return (
    <div className="fieldmenu textbox" role="group" aria-label="Field menu">
      {items.map((item) =>
        item === "move-on" ? (
          <button key={item} type="button" onClick={() => setConfirming(true)}>
            {COPY[item]}
          </button>
        ) : (
          // Cancelling needs no confirmation box of its own: it undoes
          // something rather than committing to it, and #16 asks it to leave
          // no trace, not to be defended against.
          <form key={item} action={setPartingAction}>
            <input type="hidden" name="parting" value="cancel" />
            <button type="submit">{COPY[item]}</button>
          </form>
        ),
      )}
      <button type="button" className="fieldmenuclose" onClick={close}>
        CLOSE
      </button>
    </div>
  );
}

/**
 * The confirmation (#9, #10, #11): covers the scene so the decision has the
 * Ranger's whole attention, but stops at the scene's edge, leaving Warden
 * Baoba's tray below still speaking — he is the one voice that explains
 * consequences, and he shouldn't go quiet at the moment one is being weighed.
 *
 * Two buttons and no friction gate: the decision is reversible for the rest
 * of the day, so anything more would be theatre. No numbers anywhere in the
 * copy — happiness is a background number with no on-screen surface, and it
 * is not acquiring its first one here (see `buildEncounterView`'s own note).
 */
function PartingConfirmation({ nickname, onCancel }: { nickname: string; onCancel: () => void }) {
  return (
    <div className="partconfirm" role="dialog" aria-modal="true" aria-labelledby="partconfirm-title">
      <div className="partconfirmbox textbox">
        <div className="head" id="partconfirm-title">
          MOVE ON TO A NEW AREA?
        </div>
        <p>
          {nickname} stays behind in its own area at the end of today. Tomorrow you travel alone —
          hit your target and something new will find you the day after.
        </p>
        <p>The care you&rsquo;ve built travels with you, and you can change your mind all day.</p>
        <div className="partconfirmactions">
          <button type="button" className="skip" onClick={onCancel}>
            Not yet
          </button>
          <form action={setPartingAction}>
            <input type="hidden" name="parting" value="set" />
            <button type="submit" className="primary">
              Move on
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
