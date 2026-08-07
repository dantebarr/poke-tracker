import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError } from "@/lib/supabase/errors";

/**
 * One of the original 151, as the Pokédex screen (#13) reads it. `name` is
 * null on a locked entry — the screen shows a silhouette and the number
 * only, never the species it hides. Unlocked reflects a stored
 * `pokedex_entry` row, never derived from what any instance currently is:
 * CONTEXT.md's "Pokédex entry" entry is explicit that being the species
 * isn't enough on its own.
 */
export type PokedexEntry =
  | { speciesId: number; spritePath: string; unlocked: true; name: string }
  | { speciesId: number; spritePath: string; unlocked: false; name: null };

type SpeciesRow = {
  id: number;
  name: string;
  sprite_path: string;
};

/**
 * All 151 species, most recent unlocks not distinguished from old ones —
 * ordered by national Pokédex number, the only order this screen shows them
 * in. Row-level security scopes the unlock check to the caller's own
 * `pokedex_entry` rows; `species` itself is public reference data every
 * trainer reads identically.
 */
export async function listPokedex(client: SupabaseClient, trainerId: string): Promise<PokedexEntry[]> {
  const [speciesResult, entriesResult] = await Promise.all([
    client.from("species").select("id, name, sprite_path").order("id").returns<SpeciesRow[]>(),
    client.from("pokedex_entry").select("species_id").eq("trainer_id", trainerId).returns<{ species_id: number }[]>(),
  ]);

  if (speciesResult.error) {
    throw new DatabaseError("Listing species", speciesResult.error);
  }
  if (entriesResult.error) {
    throw new DatabaseError("Listing pokedex entries", entriesResult.error);
  }

  const unlockedIds = new Set(entriesResult.data.map((row) => row.species_id));

  return speciesResult.data.map((species): PokedexEntry => {
    if (unlockedIds.has(species.id)) {
      return { speciesId: species.id, spritePath: species.sprite_path, unlocked: true, name: species.name };
    }
    return { speciesId: species.id, spritePath: species.sprite_path, unlocked: false, name: null };
  });
}
