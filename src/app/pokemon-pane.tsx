"use client";

import { useState } from "react";

import { BaobaTray } from "@/app/baoba-tray";
import { EncounterView } from "@/app/encounter-view";
import { NamingPrompt } from "@/app/naming-prompt";
import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The field pane's client root (#24): wraps the otherwise-static
 * `EncounterView`/`BaobaTray` pair for the one thing that needs to live on
 * the client — the naming prompt's Skip, which is session-scoped and has no
 * server state to hold it (CONTEXT.md's "Naming" entry: a skip costs
 * nothing permanent, and the prompt returns on the next visit, i.e. the next
 * time this component mounts fresh). `naming` reads `buildEncounterView`'s
 * own `prompt` field rather than checking `pokemon.nickname` directly, so
 * which prompt is showing is never this component's call to make — only
 * whether to honour a skip is.
 */
export function PokemonPane({
  pokemon,
  dailyTarget,
  baobaLine,
}: {
  pokemon: ActivePokemon | null;
  dailyTarget: number;
  baobaLine: string;
}) {
  const [skipped, setSkipped] = useState(false);
  const view = buildEncounterView(pokemon, dailyTarget);

  const naming =
    pokemon && view.hasPokemon && view.prompt === "naming" && !skipped
      ? { instanceId: pokemon.instanceId, speciesName: view.speciesName }
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

  return (
    <>
      <EncounterView pokemon={pokemon} dailyTarget={dailyTarget} prompt={namingPrompt("box")} />
      <BaobaTray line={baobaLine} naming={namingPrompt("fold")} />
    </>
  );
}
