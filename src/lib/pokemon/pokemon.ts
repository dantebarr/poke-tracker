import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError } from "@/lib/supabase/errors";

/**
 * The trainer's active Pokémon, as the app reads one. Distance to its next
 * bond requirement is derived here rather than stored — it is always
 * `bondRequirement - bondLevel`, floored at zero once met.
 */
export type ActivePokemon = {
  instanceId: string;
  nickname: string | null;
  happiness: number;
  bondLevel: number;
  bondRequirement: number;
  distanceToBondRequirement: number;
  species: {
    id: number;
    name: string;
    spritePath: string;
    zone: string;
    animatedSpritePath: string;
  };
};

type TrainerPoolRow = {
  active_instance_id: string | null;
  happiness: number;
};

type InstanceRow = {
  id: string;
  nickname: string | null;
  bond_level: number;
  species: {
    id: number;
    name: string;
    sprite_path: string;
    bond_requirement: number;
    zone: string;
    animated_sprite_path: string;
  };
};

const ACTIVE_INSTANCE_COLUMNS =
  "id, nickname, bond_level, species:species_id(id, name, sprite_path, bond_requirement, zone, animated_sprite_path)";

function toActivePokemon(instance: InstanceRow, happiness: number): ActivePokemon {
  return {
    instanceId: instance.id,
    nickname: instance.nickname,
    happiness,
    bondLevel: instance.bond_level,
    bondRequirement: instance.species.bond_requirement,
    distanceToBondRequirement: Math.max(instance.species.bond_requirement - instance.bond_level, 0),
    species: {
      id: instance.species.id,
      name: instance.species.name,
      spritePath: instance.species.sprite_path,
      zone: instance.species.zone,
      animatedSpritePath: instance.species.animated_sprite_path,
    },
  };
}

/**
 * The signed-in trainer's active Pokémon, or null when they have none — no
 * pool yet, or the one they had has left. Under row-level security this can
 * only ever be the caller's own.
 */
export async function findActivePokemon(
  client: SupabaseClient,
  trainerId: string,
): Promise<ActivePokemon | null> {
  const { data: trainerRow, error: trainerError } = await client
    .from("trainer")
    .select("active_instance_id, happiness")
    .eq("id", trainerId)
    .maybeSingle<TrainerPoolRow>();

  if (trainerError) {
    throw new DatabaseError("Reading trainer's active instance", trainerError);
  }
  if (!trainerRow?.active_instance_id) {
    return null;
  }

  const { data: instanceRow, error: instanceError } = await client
    .from("instance")
    .select(ACTIVE_INSTANCE_COLUMNS)
    .eq("id", trainerRow.active_instance_id)
    .single<InstanceRow>();

  if (instanceError) {
    throw new DatabaseError("Reading active instance", instanceError);
  }

  return toActivePokemon(instanceRow, trainerRow.happiness);
}

/**
 * The signed-in trainer's active instance id, or null when they currently
 * have none. Used to stamp a task with the Pokémon active at completion —
 * see `completeTask` in `@/lib/task/task`.
 */
export async function activeInstanceId(
  client: SupabaseClient,
  trainerId: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("trainer")
    .select("active_instance_id")
    .eq("id", trainerId)
    .maybeSingle<{ active_instance_id: string | null }>();

  if (error) {
    throw new DatabaseError("Reading trainer's active instance", error);
  }
  return data?.active_instance_id ?? null;
}

/**
 * Creates the trainer's whole pool and activates its first instance, or does
 * nothing if they already have one. Safe to call on every sign-in — the
 * underlying database function is the idempotent one.
 */
export async function provisionPool(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("provision_pool");
  if (error) {
    throw new DatabaseError("Provisioning pool", error);
  }
}

/**
 * Sets an instance's nickname. Row-level security means this can only ever
 * touch an instance the caller owns; an id belonging to nobody, or to another
 * trainer, updates nothing.
 */
export async function setInstanceNickname(
  client: SupabaseClient,
  instanceId: string,
  nickname: string | null,
): Promise<void> {
  const { data, error } = await client
    .from("instance")
    .update({ nickname })
    .eq("id", instanceId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Setting nickname", error);
  }
  if (!data) {
    throw new Error("Setting nickname: no matching instance");
  }
}
