import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError } from "@/lib/supabase/errors";

/**
 * A species the active instance could evolve into right now: a direct child
 * of its current species, filtered to what CONTEXT.md's "Evolving" and
 * "Pokédex entry" entries call the only exclusion — forms the trainer
 * already owns as another instance's current species, or already has in
 * their Pokédex, are hidden here rather than merely disabled, since a branch
 * can't be wasted on a duplicate. `evolve_instance` (the migration) refuses
 * the same options server-side, so hiding them here is a convenience, not
 * the enforcement.
 */
export type EvolutionOption = {
  speciesId: number;
  name: string;
  spritePath: string;
};

type ChildSpeciesRow = {
  id: number;
  name: string;
  sprite_path: string;
};

/**
 * The species the given instance could evolve into, or an empty list when
 * its current species doesn't evolve further, or every branch is already
 * spoken for. Callers decide whether to show this at all — typically only
 * once the instance has met its current species' bond requirement, the same
 * gate the evolve button itself is under.
 */
export async function findEvolutionOptions(
  client: SupabaseClient,
  trainerId: string,
  currentSpeciesId: number,
): Promise<EvolutionOption[]> {
  const { data: children, error: childrenError } = await client
    .from("species")
    .select("id, name, sprite_path")
    .eq("evolves_from_id", currentSpeciesId)
    .returns<ChildSpeciesRow[]>();

  if (childrenError) {
    throw new DatabaseError("Reading evolution options", childrenError);
  }
  if (children.length === 0) {
    return [];
  }

  const childIds = children.map((child) => child.id);
  const [ownedResult, dexResult] = await Promise.all([
    client.from("instance").select("species_id").eq("trainer_id", trainerId).in("species_id", childIds),
    client.from("pokedex_entry").select("species_id").eq("trainer_id", trainerId).in("species_id", childIds),
  ]);

  if (ownedResult.error) {
    throw new DatabaseError("Reading owned instances for evolution options", ownedResult.error);
  }
  if (dexResult.error) {
    throw new DatabaseError("Reading Pokédex entries for evolution options", dexResult.error);
  }

  const excluded = new Set<number>([
    ...ownedResult.data.map((row) => row.species_id as number),
    ...dexResult.data.map((row) => row.species_id as number),
  ]);

  return children
    .filter((child) => !excluded.has(child.id))
    .map((child) => ({ speciesId: child.id, name: child.name, spritePath: child.sprite_path }));
}

/**
 * Evolves an instance into `targetSpeciesId`, taking the species the caller
 * last saw it as so a stale request — most often a double-click racing
 * itself — is refused rather than chaining an unintended second evolution.
 * Every other rule (bond requirement met, target is an actual child,
 * neither already owned nor already in the Pokédex) is enforced inside
 * `evolve_instance` itself; see the migration for why that's safe to trust
 * even though a trainer's own JWT can call it directly.
 */
export async function evolveInstance(
  client: SupabaseClient,
  instanceId: string,
  expectedSpeciesId: number,
  targetSpeciesId: number,
): Promise<void> {
  const { error } = await client.rpc("evolve_instance", {
    p_instance_id: instanceId,
    p_expected_species_id: expectedSpeciesId,
    p_target_species_id: targetSpeciesId,
  });

  if (error) {
    throw new DatabaseError("Evolving instance", error);
  }
}
