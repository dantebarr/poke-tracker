"use server";

import { revalidatePath } from "next/cache";

import { dayKeyInTimeZone } from "@/lib/day/day";
import { currentMoment } from "@/lib/day/session";
import { evolveInstance } from "@/lib/pokemon/evolution";
import { setInstanceNickname } from "@/lib/pokemon/pokemon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotSignedInError } from "@/lib/trainer/errors";
import { currentTrainer } from "@/lib/trainer/session";
import { setPartingOn } from "@/lib/trainer/trainer";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale.
 *
 * Every write here revalidates the root layout, not just `/` (#33): the
 * naming and evolve prompts they answer, and the field menu (#5), all render
 * in the chrome layout's persistent left pane, reachable from any
 * destination, so a page-scoped revalidation would leave that pane stale
 * everywhere but the screen the write happened from.
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

/**
 * Sets or cancels a Parting (#5) — both directions go through this one
 * action, since they are the two halves of one reversible decision. The
 * `parting` field says which: `"set"` writes today, `"cancel"` clears it, and
 * nothing else is accepted.
 *
 * The day is resolved here, server-side, from the Ranger's own stored time
 * zone (ADR-0004) and never taken from the browser — a Ranger must not be
 * able to name the day they part on, only *that* they are parting, and the
 * one they mean is always their own today. Writing a day rather than a flag
 * is what makes a parting set and then left alone for a week land on the day
 * it was actually chosen: settlement replays owed days in order and fires it
 * on the matching one.
 *
 * Cancelling writes null and leaves no trace anywhere (#16) — a change of
 * mind is not itself an event, and there is nothing in the ledger or
 * anywhere else for it to be recorded in.
 *
 * The write itself is scoped to the caller's own row by row-level security
 * and reaches `parting_on` through that column's own update grant, so no
 * Ranger can set or clear another's (#35).
 *
 * @throws NotSignedInError when there is no session.
 */
export async function setPartingAction(formData: FormData): Promise<void> {
  const trainer = await currentTrainer();

  if (!trainer) {
    throw new NotSignedInError();
  }

  // Required and checked against both spellings rather than read as
  // "anything that isn't 'set' cancels": a missing or misspelled field would
  // otherwise silently clear a parting the Ranger meant to keep.
  const direction = requiredField(formData, "parting");
  if (direction !== "set" && direction !== "cancel") {
    throw new Error(`Invalid parting direction: ${direction}`);
  }

  const client = await createSupabaseServerClient();
  const day = direction === "set" ? dayKeyInTimeZone(currentMoment(), trainer.timeZone) : null;

  await setPartingOn(client, trainer.id, day);
  revalidatePath("/", "layout");
}
