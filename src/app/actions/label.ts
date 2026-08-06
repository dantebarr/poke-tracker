"use server";

import { revalidatePath } from "next/cache";

import {
  createLabel,
  deleteLabel,
  moveLabel,
  recolorLabel,
  renameLabel,
  type Label,
} from "@/lib/label/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainerId } from "@/lib/trainer/session";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. Each one establishes the caller from their own session and lets
 * row-level security scope the effect to their own labels — see
 * `@/app/actions/trainer` for the fuller rationale.
 *
 * Each takes a `FormData`, not typed parameters, so it can be bound directly
 * to a `<form action>` — see the settings page.
 */

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

/** Adds a new label at the end of the signed-in trainer's order. */
export async function createLabelAction(formData: FormData): Promise<Label> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const name = requiredField(formData, "name");
  const color = requiredField(formData, "color");

  const label = await createLabel(client, trainerId, { name, color });
  revalidatePath("/settings");
  return label;
}

/** Renames a label. Tasks reference the label's id, so this touches no tasks. */
export async function renameLabelAction(formData: FormData): Promise<Label> {
  const client = await createSupabaseServerClient();
  await requireTrainerId(client);

  const id = requiredField(formData, "id");
  const name = requiredField(formData, "name");

  const label = await renameLabel(client, id, name);
  revalidatePath("/settings");
  return label;
}

/** Recolours a label. The colour is stored as a value, not a style class name. */
export async function recolorLabelAction(formData: FormData): Promise<Label> {
  const client = await createSupabaseServerClient();
  await requireTrainerId(client);

  const id = requiredField(formData, "id");
  const color = requiredField(formData, "color");

  const label = await recolorLabel(client, id, color);
  revalidatePath("/settings");
  return label;
}

/** Swaps a label with its neighbour. A no-op at either end of the order. */
export async function moveLabelAction(formData: FormData): Promise<Label[]> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const id = requiredField(formData, "id");
  const direction = requiredField(formData, "direction") === "up" ? "up" : "down";

  const labels = await moveLabel(client, trainerId, id, direction);
  revalidatePath("/settings");
  return labels;
}

/**
 * Deletes a label. Refused by the database while a task still references it
 * — see `@/lib/label/label`'s `deleteLabel` for why that guard isn't in
 * force yet.
 */
export async function deleteLabelAction(formData: FormData): Promise<void> {
  const client = await createSupabaseServerClient();
  await requireTrainerId(client);

  const id = requiredField(formData, "id");

  await deleteLabel(client, id);
  revalidatePath("/settings");
}
