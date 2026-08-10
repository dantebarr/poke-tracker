import Image from "next/image";

import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The field pane's centrepiece (#22): the Ranger's Active Pokémon standing
 * animated in its own habitat, under a battle-style status box carrying its
 * Nickname, Species, a face for Happiness and a bar for Bond level. Renders
 * `buildEncounterView`'s output and derives nothing of its own — later
 * tickets (#23's dialogue tray, #24's naming prompt, #25's evolve prompt)
 * extend this pane rather than replace it.
 */
export function EncounterView({ pokemon, dailyTarget }: { pokemon: ActivePokemon | null; dailyTarget: number }) {
  const view = buildEncounterView(pokemon, dailyTarget);

  if (!view.hasPokemon) {
    return (
      <div className="scene" data-zone="plains">
        <div className="scene-empty textbox">
          <p className="pixel">No Pokémon right now</p>
          <p>Hit your daily target to bring one home.</p>
        </div>
      </div>
    );
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
          <span
            className={`mood${view.mood.warn ? " warn" : ""}`}
            title={`${view.mood.label} — happiness in daily targets`}
          >
            <Image src={`/mood/${view.mood.tier}.svg`} alt={view.mood.label} width={34} height={34} unoptimized />
          </span>
        </div>
        <div className="species">
          {view.speciesName} · No.{view.speciesNumber}
        </div>

        <div className="rows">
          <span className="tag">Bond</span>
          <span className="track">
            <i style={{ width: `${view.bond.percent}%` }} />
          </span>
          <span className="num">
            {view.bond.level}
            <span className="sign">/{view.bond.requirement}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
