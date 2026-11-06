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
  | { speciesId: number; spritePath: string; unlocked: true; name: string; unlockedOn: string }
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
    client
      .from("pokedex_entry")
      .select("species_id, unlocked_on")
      .eq("trainer_id", trainerId)
      .returns<{ species_id: number; unlocked_on: string }[]>(),
  ]);

  if (speciesResult.error) {
    throw new DatabaseError("Listing species", speciesResult.error);
  }
  if (entriesResult.error) {
    throw new DatabaseError("Listing pokedex entries", entriesResult.error);
  }

  const unlockedOn = new Map(entriesResult.data.map((row) => [row.species_id, row.unlocked_on]));

  return speciesResult.data.map((species): PokedexEntry => {
    const day = unlockedOn.get(species.id);
    if (day !== undefined) {
      return { speciesId: species.id, spritePath: species.sprite_path, unlocked: true, name: species.name, unlockedOn: day };
    }
    return { speciesId: species.id, spritePath: species.sprite_path, unlocked: false, name: null };
  });
}

/**
 * One species in the line the Ranger's current Pokémon is working through,
 * with the bond it takes to write that entry up. `requirement` is the species'
 * cumulative bond requirement (CONTEXT.md's "Bond requirement"), so it compares
 * directly against the instance's bond level at any step of the line.
 */
export type DexLineStep = {
  speciesId: number;
  requirement: number;
  /** The species the instance is right now — the only step whose name the screen may show. */
  current: boolean;
};

type LineRow = { id: number; evolves_from_id: number | null; bond_requirement: number };

/**
 * The current species and every form it could still evolve into, in
 * Pokédex-number order. Pure: takes the species table's lineage columns so
 * it needs no database to test.
 */
export function lineFrom(rows: LineRow[], currentSpeciesId: number): DexLineStep[] {
  const byParent = new Map<number, LineRow[]>();
  for (const row of rows) {
    if (row.evolves_from_id !== null) {
      byParent.set(row.evolves_from_id, [...(byParent.get(row.evolves_from_id) ?? []), row]);
    }
  }

  const found = new Set<number>([currentSpeciesId]);
  const queue = [currentSpeciesId];
  while (queue.length > 0) {
    const id = queue.shift() as number;
    for (const child of byParent.get(id) ?? []) {
      if (!found.has(child.id)) {
        found.add(child.id);
        queue.push(child.id);
      }
    }
  }

  return rows
    .filter((row) => found.has(row.id))
    .sort((a, b) => a.id - b.id)
    .map((row) => ({ speciesId: row.id, requirement: row.bond_requirement, current: row.id === currentSpeciesId }));
}

/** Reads the lineage columns `lineFrom` needs. `species` is public reference data. */
export async function listDexLine(client: SupabaseClient, currentSpeciesId: number): Promise<DexLineStep[]> {
  const { data, error } = await client
    .from("species")
    .select("id, evolves_from_id, bond_requirement")
    .returns<LineRow[]>();

  if (error) {
    throw new DatabaseError("Listing species lineage", error);
  }
  return lineFrom(data, currentSpeciesId);
}
