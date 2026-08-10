"use client";

import { useState } from "react";

import { BaobaTray } from "@/app/baoba-tray";
import { EncounterView } from "@/app/encounter-view";
import { EvolvePrompt } from "@/app/evolve-prompt";
import { NamingPrompt } from "@/app/naming-prompt";
import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { EvolutionOption } from "@/lib/pokemon/evolution";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The field pane's client root (#24, #25): wraps the otherwise-static
 * `EncounterView`/`BaobaTray` pair for the one thing that needs to live on
 * the client — the naming prompt's Skip, which is session-scoped and has no
 * server state to hold it (CONTEXT.md's "Naming" entry: a skip costs
 * nothing permanent, and the prompt returns on the next visit, i.e. the next
 * time this component mounts fresh). Both `naming` and `evolve` read
 * `buildEncounterView`'s own `prompt` field rather than re-deriving it from
 * `pokemon`/`evolutionOptions` directly, so which prompt is showing — and
 * the precedence between them — is never this component's call to make;
 * only whether to honour a naming skip is.
 */
export function PokemonPane({
  pokemon,
  dailyTarget,
  evolutionOptions,
  baobaLine,
}: {
  pokemon: ActivePokemon | null;
  dailyTarget: number;
  evolutionOptions: EvolutionOption[];
  baobaLine: string;
}) {
  const [skipped, setSkipped] = useState(false);
  const view = buildEncounterView(pokemon, dailyTarget, evolutionOptions);

  const naming =
    pokemon && view.hasPokemon && view.prompt === "naming" && !skipped
      ? { instanceId: pokemon.instanceId, speciesName: view.speciesName }
      : null;

  const evolve =
    pokemon && view.hasPokemon && view.prompt === "evolve"
      ? { instanceId: pokemon.instanceId, expectedSpeciesId: pokemon.species.id, nickname: view.nickname }
      : null;

  function namingPrompt(variant: "box" | "fold") {
    if (!naming) return undefined;
    return (
      <NamingPrompt
        instanceId={naming.instanceId}
        speciesName={naming.speciesName}
        variant={variant}
        onSkip={() => setSkipped(true)}
      />
    );
  }

  function evolvePrompt(variant: "box" | "fold") {
    if (!evolve) return undefined;
    return (
      <EvolvePrompt
        instanceId={evolve.instanceId}
        expectedSpeciesId={evolve.expectedSpeciesId}
        nickname={evolve.nickname}
        options={evolutionOptions}
        variant={variant}
      />
    );
  }

  return (
    <>
      <EncounterView
        pokemon={pokemon}
        dailyTarget={dailyTarget}
        prompt={namingPrompt("box") ?? evolvePrompt("box")}
      />
      <BaobaTray line={baobaLine} naming={namingPrompt("fold")} evolve={evolvePrompt("fold")} />
    </>
  );
}
