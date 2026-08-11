"use server";

import { revalidatePath } from "next/cache";

import { evolveInstance } from "@/lib/pokemon/evolution";
import { setInstanceNickname } from "@/lib/pokemon/pokemon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotSignedInError } from "@/lib/trainer/errors";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale.
 *
 * Both writes here revalidate the root layout, not just `/` (#33): the
 * naming and evolve prompts they answer render in the chrome layout's
 * persistent left pane, reachable from any destination, so a page-scoped
 * revalidation would leave that pane stale everywhere but the screen the
 * write happened from.
 */

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

function requiredSpeciesId(formData: FormData, name: string): number {
  const value = Number(requiredField(formData, name));
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid species id for field: ${name}`);
  }
  return value;
}

/**
 * Sets an instance's nickname. Bound to the instance id from the form that
 * calls it — see `@/app/naming-prompt`, the naming prompt's (#24) one form.
 *
 * An empty or whitespace-only nickname clears it back to null rather than
 * storing blank text — harmless in practice, since the naming prompt's own
 * submit button stays disabled until there's something to send, but the
 * action doesn't assume its only caller enforces that.
 *
 * @throws NotSignedInError when there is no session.
 */
export async function setNickname(instanceId: string, formData: FormData): Promise<void> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw new NotSignedInError();
  }

  const raw = formData.get("nickname");
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  await setInstanceNickname(client, instanceId, trimmed === "" ? null : trimmed);
  revalidatePath("/", "layout");
}

/**
 * Evolves an instance into a species picked from its current species' valid
 * options. `expectedSpeciesId` is the species the caller's own render saw
 * the instance as — stamped in a hidden field by the form that calls this —
 * so a stale resubmission (a double-click racing itself) is refused rather
 * than chaining an unintended second evolution. Every other rule (bond
 * requirement met, target is an actual child, not already owned or
 * Pokédex'd) is enforced inside `evolve_instance` itself; see the migration.
 *
 * @throws NotSignedInError when there is no session.
 */
export async function evolvePokemon(formData: FormData): Promise<void> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    throw new NotSignedInError();
  }

  const instanceId = requiredField(formData, "instanceId");
  const expectedSpeciesId = requiredSpeciesId(formData, "expectedSpeciesId");
  const targetSpeciesId = requiredSpeciesId(formData, "targetSpeciesId");

  await evolveInstance(client, instanceId, expectedSpeciesId, targetSpeciesId);
  revalidatePath("/", "layout");
}
