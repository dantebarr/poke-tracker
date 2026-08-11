import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEvolutionOptions, type EvolutionOption } from "@/lib/pokemon/evolution";
import { listPokedex, type PokedexEntry } from "@/lib/pokemon/pokedex";
import { findActivePokemon, type ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The read side. Server components call this; writes go through the server
 * actions in `@/app/actions/pokemon`.
 */

/**
 * The signed-in trainer's active Pokémon, or null when nobody is signed in,
 * they have no trainer record, or they have no active Pokémon.
 *
 * `cache`d per request (#33): the chrome layout's persistent left pane reads
 * this on every navigation, the same reason `currentTrainer` already is.
 */
export const currentActivePokemon = cache(async (): Promise<ActivePokemon | null> => {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return null;

  return findActivePokemon(client, user.id);
});

/**
 * The species `currentSpeciesId` could evolve into for the given trainer.
 * Row-level security scopes this to the caller's own, the same way
 * `currentTasks`/`currentLabels` trust their `trainerId` argument. Callers
 * only need this once an instance has met its bond requirement — see the
 * pokemon panel. `cache`d for the same reason `currentActivePokemon` is.
 */
export const currentEvolutionOptions = cache(
  async (trainerId: string, currentSpeciesId: number): Promise<EvolutionOption[]> => {
    const client = await createSupabaseServerClient();
    return findEvolutionOptions(client, trainerId, currentSpeciesId);
  },
);

/**
 * The trainer's Pokédex (#13): all 151, locked entries stripped of their
 * name. Row-level security scopes the unlock check to the caller's own, the
 * same way `currentEvolutionOptions`'s `trainerId` argument does.
 */
export async function currentPokedex(trainerId: string): Promise<PokedexEntry[]> {
  const client = await createSupabaseServerClient();
  return listPokedex(client, trainerId);
}
