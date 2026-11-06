import Link from "next/link";

import { ENCOUNTER_HREF } from "@/app/(app)/chrome/navigation";
import { MoodMeter } from "@/app/mood-meter";
import type { Mood } from "@/lib/baoba/dialogue";
import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The narrow screen's Pokémon card: a compact stand-in for the encounter
 * scene that sits above the field log, so the home screen is led by the
 * Ranger's tasks and still shows the partner at a glance — sprite, nickname,
 * bond, mood and today's progress. The whole card is one link to the full
 * scene (`ENCOUNTER_HREF`), so "see the scene and Baoba" is a single, large,
 * labelled tap rather than a hidden control. Hidden by CSS everywhere but a
 * narrow screen's field log.
 */
export function CompactPokemonCard({
  pokemon,
  mood,
  parting,
  needsAttention,
  points,
  dailyTarget,
}: {
  pokemon: ActivePokemon | null;
  mood: Mood | null;
  parting: boolean;
  /** Baoba has something to ask for in the scene — a naming or evolve prompt. */
  needsAttention: boolean;
  points: number;
  dailyTarget: number;
}) {
  const view = buildEncounterView(pokemon, [], parting);
  const pct = dailyTarget > 0 ? Math.min(100, Math.round((points / dailyTarget) * 100)) : 100;

  const progress = (
    <div className="rows cc-progress">
      <span className="tag">Today</span>
      <span className="track">
        <i style={{ width: `${pct}%` }} />
      </span>
      <span className="num">
        {points}/{dailyTarget}
      </span>
    </div>
  );

  if (!view.hasPokemon) {
    return (
      <Link href={ENCOUNTER_HREF} className="compactcard textbox empty" aria-label="Open the encounter view">
        <div className="cc-body">
          <span className="cc-nick">No partner yet</span>
          <span className="cc-species">Hit today&rsquo;s target and one may wander by.</span>
          {progress}
        </div>
        <span className="cc-go" aria-hidden="true">
          ›
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={ENCOUNTER_HREF}
      className="compactcard textbox"
      aria-label={`${view.nickname} the ${view.speciesName}: open the encounter view`}
    >
      <span className="cc-sprite">
        {/* eslint-disable-next-line @next/next/no-img-element -- an animated GIF. */}
        <img src={view.spritePath} alt="" width={56} height={56} />
      </span>
      <div className="cc-body">
        <div className="cc-line1">
          <span className="cc-nick">{view.nickname}</span>
          {view.parting && <span className="movingon">MOVING ON</span>}
          {needsAttention && <span className="cc-alert">{pokemon?.nickname === null ? "NAME ME" : "EVOLVE"}</span>}
        </div>
        <div className="cc-species">
          {view.speciesName} · Bond {view.bond.level}
        </div>
        <div className="rows cc-bond">
          <span className="tag">Bond</span>
          <span className="track">
            <i style={{ width: `${view.bond.percent}%` }} />
          </span>
        </div>
        {mood && <MoodMeter mood={mood} nickname={view.nickname} />}
        {progress}
      </div>
      <span className="cc-go" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}
