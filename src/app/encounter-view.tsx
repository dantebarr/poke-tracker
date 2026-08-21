import type { ReactNode } from "react";

import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The field pane's centrepiece (#22): the Ranger's Active Pokémon standing
 * animated in its own habitat, under a battle-style status box carrying its
 * Nickname, Species and a bar for Bond level. Renders `buildEncounterView`'s
 * output and derives nothing of its own — later tickets (#23's dialogue
 * tray, #24's naming prompt, #25's evolve prompt) extend this pane rather
 * than replace it.
 *
 * Happiness has no place in this box, by design: it is a background number,
 * and Warden Baoba's tray below is the only thing that ever hints at it. The
 * face that used to sit opposite the Nickname is gone, and the space it held
 * is left empty on purpose.
 *
 * Bond shows the bare level, never `level / requirement`: bond rises forever
 * and never falls, so a denominator would name a ceiling that doesn't exist.
 * The bar is what carries distance — to the next evolution, to the Pokédex
 * entry — and stays full once a line has nothing further to unlock.
 *
 * `prompt` is the pane's prompt-box slot (#24, #25): whoever calls this
 * decides *whether* to pass one using `buildEncounterView`'s own `prompt`
 * field, never by re-deriving the same rule here — this component only
 * places whatever it's handed inside `.scene`, over the artwork, the same
 * corner the mockup's `.evolve` box claims.
 */
export function EncounterView({
  pokemon,
  prompt,
}: {
  pokemon: ActivePokemon | null;
  prompt?: ReactNode;
}) {
  const view = buildEncounterView(pokemon);

  if (!view.hasPokemon) {
    return <div className="scene" data-zone="plains" />;
  }

  return (
    <div className="scene" data-zone={view.zone}>
      <div className="mon">
        {/* eslint-disable-next-line @next/next/no-img-element -- an animated
            GIF: next/image's optimizer would flatten it to a static frame. */}
        <img src={view.spritePath} alt={view.speciesName} width={150} height={150} />
        <div className="platform" />
      </div>

      <div className="statusbox textbox">
        <div className="line1">
          <span className="nick">{view.nickname}</span>
        </div>
        <div className="species">
          {view.speciesName} · No.{view.speciesNumber}
        </div>

        <div className="rows">
          <span className="tag">Bond</span>
          <span className="track">
            <i style={{ width: `${view.bond.percent}%` }} />
          </span>
          <span className="num">{view.bond.level}</span>
        </div>
      </div>

      {prompt}
    </div>
  );
}
