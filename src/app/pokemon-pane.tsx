"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { resolveNavigation } from "@/app/(app)/chrome/navigation";
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
 * nothing permanent, and the prompt returns on the next visit).
 *
 * "Next visit" used to mean this component mounting fresh, which happened
 * every time a Ranger loaded the home page. Since #33 this pane is mounted
 * once by the chrome layout and never taken down, so there is no remount to
 * reset `skipped` on a narrow screen's own return to the encounter view —
 * the one surviving boundary a narrow screen still has, reached by the ←
 * arrow or a bare `/` — is treated as that next visit instead. A wide
 * screen has no such boundary (the pane is permanently on screen, which is
 * the point of #33), so a skip there lasts the rest of the session.
 */
export function PokemonPane({
  pokemon,
  evolutionOptions,
  baobaLine,
}: {
  pokemon: ActivePokemon | null;
  evolutionOptions: EvolutionOption[];
  baobaLine: string;
}) {
  const [skipped, setSkipped] = useState(false);

  // Always resolved as narrow, the same way `AppStage` always does: the
  // question is only "does this address represent the encounter view",
  // which `resolveNavigation` answers as `destination: null` regardless of
  // the screen actually holding it — a wide screen just never leaves.
  const pathname = usePathname();
  const params = useSearchParams();
  const onNarrowEncounterView = resolveNavigation({ pathname, params, surface: "narrow" }).destination === null;
  const wasOnNarrowEncounterView = useRef(onNarrowEncounterView);
  useEffect(() => {
    if (onNarrowEncounterView && !wasOnNarrowEncounterView.current) {
      setSkipped(false);
    }
    wasOnNarrowEncounterView.current = onNarrowEncounterView;
  }, [onNarrowEncounterView]);

  const view = buildEncounterView(pokemon, evolutionOptions);

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
      <EncounterView pokemon={pokemon} prompt={namingPrompt("box") ?? evolvePrompt("box")} />
      <BaobaTray line={baobaLine} naming={namingPrompt("fold")} evolve={evolvePrompt("fold")} />
    </>
  );
}
