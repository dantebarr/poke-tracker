import { createSupabaseServerClient } from "@/lib/supabase/server";
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
