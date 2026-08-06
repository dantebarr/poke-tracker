import type { SupabaseClient } from "@supabase/supabase-js";

import { DatabaseError, unwrap } from "@/lib/supabase/errors";

/**
 * Which area of life a task belongs to. A closed set per trainer, defined by
 * that trainer — not a closed set for the app.
 */
export type Label = {
  id: string;
  trainerId: string;
  name: string;
  color: string;
  position: number;
};

type LabelRow = {
  id: string;
  trainer_id: string;
  name: string;
  color: string;
  position: number;
};

const COLUMNS = "id, trainer_id, name, color, position";

function toLabel(row: LabelRow): Label {
  return {
    id: row.id,
    trainerId: row.trainer_id,
    name: row.name,
    color: row.color,
    position: row.position,
  };
}

/** A trainer's labels, in display order. */
export async function listLabels(client: SupabaseClient, trainerId: string): Promise<Label[]> {
  const { data, error } = await client
    .from("label")
    .select(COLUMNS)
    .eq("trainer_id", trainerId)
    .order("position")
    .returns<LabelRow[]>();

  if (error) {
    throw new DatabaseError("Listing labels", error);
  }
  return data.map(toLabel);
}

/**
 * Adds a new label at the end of the trainer's order. Name uniqueness and
 * colour format are the database's guarantee (ADR-0001), not checked here.
 */
export async function createLabel(
  client: SupabaseClient,
  trainerId: string,
  input: { name: string; color: string },
): Promise<Label> {
  const existing = await listLabels(client, trainerId);
  const position = existing.reduce((max, label) => Math.max(max, label.position), -1) + 1;

  const row = unwrap(
    "Creating label",
    await client
      .from("label")
      .insert({ trainer_id: trainerId, name: input.name, color: input.color, position })
      .select(COLUMNS)
      .single<LabelRow>(),
  );
  return toLabel(row);
}

/** Renames a label. Tasks reference the label's id, so this touches no tasks. */
export async function renameLabel(
  client: SupabaseClient,
  id: string,
  name: string,
): Promise<Label> {
  const row = unwrap(
    "Renaming label",
    await client.from("label").update({ name }).eq("id", id).select(COLUMNS).single<LabelRow>(),
  );
  return toLabel(row);
}

/** Recolours a label. The colour is stored as a value, not a style class name. */
export async function recolorLabel(
  client: SupabaseClient,
  id: string,
  color: string,
): Promise<Label> {
  const row = unwrap(
    "Recolouring label",
    await client.from("label").update({ color }).eq("id", id).select(COLUMNS).single<LabelRow>(),
  );
  return toLabel(row);
}

/**
 * Swaps a label with its neighbour in the given direction. A no-op at either
 * end of the order rather than an error — nothing left to swap with.
 */
export async function moveLabel(
  client: SupabaseClient,
  trainerId: string,
  id: string,
  direction: "up" | "down",
): Promise<Label[]> {
  const labels = await listLabels(client, trainerId);
  const index = labels.findIndex((label) => label.id === id);
  const neighborIndex = direction === "up" ? index - 1 : index + 1;

  if (index === -1 || neighborIndex < 0 || neighborIndex >= labels.length) {
    return labels;
  }

  const label = labels[index];
  const neighbor = labels[neighborIndex];

  unwrap(
    "Reordering label",
    await client
      .from("label")
      .update({ position: neighbor.position })
      .eq("id", label.id)
      .select(COLUMNS)
      .single<LabelRow>(),
  );
  unwrap(
    "Reordering label",
    await client
      .from("label")
      .update({ position: label.position })
      .eq("id", neighbor.id)
      .select(COLUMNS)
      .single<LabelRow>(),
  );

  return listLabels(client, trainerId);
}

/**
 * Deletes a label. Refused by the database while a task still references it
 * — the foreign key that enforces this arrives with the task table in #7, so
 * nothing here can refuse it yet.
 */
export async function deleteLabel(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from("label").delete().eq("id", id);
  if (error) {
    throw new DatabaseError("Deleting label", error);
  }
}
