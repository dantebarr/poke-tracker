import { createSupabaseServerClient } from "@/lib/supabase/server";
import { findEvolutionOptions, type EvolutionOption } from "@/lib/pokemon/evolution";
import { findActivePokemon, type ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * The read side. Server components call this; writes go through the server
 * actions in `@/app/actions/pokemon`.
 */

/**
 * The signed-in trainer's active Pokémon, or null when nobody is signed in,
 * they have no trainer record, or they have no active Pokémon.
 */
export async function currentActivePokemon(): Promise<ActivePokemon | null> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return null;

  return findActivePokemon(client, user.id);
}

/**
 * The species `currentSpeciesId` could evolve into for the given trainer.
 * Row-level security scopes this to the caller's own, the same way
 * `currentTasks`/`currentLabels` trust their `trainerId` argument. Callers
 * only need this once an instance has met its bond requirement — see the
 * pokemon panel.
 */
export async function currentEvolutionOptions(
  trainerId: string,
  currentSpeciesId: number,
): Promise<EvolutionOption[]> {
  const client = await createSupabaseServerClient();
  return findEvolutionOptions(client, trainerId, currentSpeciesId);
}
