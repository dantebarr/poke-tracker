"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isAllowListed } from "@/lib/auth/allow-list";
import { provisionPool } from "@/lib/pokemon/pokemon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainerId } from "@/lib/trainer/session";
import { NotAllowListedError, NotSignedInError } from "@/lib/trainer/errors";
import {
  markIntroSeen,
  provisionTrainer,
  updateDailyTarget,
  updateTimeZone,
  type Trainer,
} from "@/lib/trainer/trainer";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. Server actions are reachable by direct POST, not only through the
 * UI, so each one establishes the caller from their own session rather than
 * trusting anything passed in.
 *
 * A `"use server"` module may only export async functions, so the errors these
 * throw live in `@/lib/trainer/errors`.
 */

/**
 * Gives the signed-in account its trainer record, or returns the one it already
 * has. Called at the auth callback, and safe to call again on every later
 * sign-in.
 *
 * @throws NotSignedInError when there is no session.
 * @throws NotAllowListedError when the account's email is not on the
 * allow-list. Nothing is written in that case — a rejected account gets no
 * trainer record, and therefore no data. This is the only place a trainer
 * record is created, so no path can bypass the check.
 */
export async function ensureTrainer(): Promise<Trainer> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user?.email) {
    throw new NotSignedInError();
  }
  if (!isAllowListed(user.email)) {
    throw new NotAllowListedError(user.email);
  }

  const fullName = user.user_metadata?.full_name;

  const trainer = await provisionTrainer(client, {
    id: user.id,
    email: user.email,
    displayName: typeof fullName === "string" ? fullName : null,
  });

  // Grants the trainer's first Pokémon the moment they exist, not after a
  // qualifying day. Idempotent, like provisionTrainer above, so a later
  // sign-in that reuses the trainer record leaves the pool untouched.
  await provisionPool(client);

  return trainer;
}

/**
 * Sets the signed-in trainer's daily target. Only ever future-facing — see
 * {@link updateDailyTarget}. A target below 1 is refused by the database, not
 * validated here (ADR-0001).
 *
 * Takes a `FormData`, not a typed parameter, so it can be bound directly to a
 * `<form action>` — see the settings page.
 *
 * Layout-scoped, not page-scoped (#33): the daily target also feeds the
 * chrome layout's persistent left pane (the encounter view's mood tier), so
 * a page-scoped revalidation would leave that pane stale on every
 * destination other than Settings itself.
 */
export async function updateDailyTargetAction(formData: FormData): Promise<Trainer> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const target = Number(formData.get("target"));

  const trainer = await updateDailyTarget(client, trainerId, target);
  revalidatePath("/", "layout");
  return trainer;
}

/**
 * Sets the signed-in trainer's time zone. Never detected from the browser
 * (ADR-0004) — this is the only way it changes. Takes a `FormData` for the
 * same reason {@link updateDailyTargetAction} does.
 *
 * Layout-scoped for the same reason {@link updateDailyTargetAction} is
 * (#33): the time zone feeds the status strip's day count and Warden
 * Baoba's overdue clause, both drawn by the chrome layout on every
 * destination.
 */
export async function updateTimeZoneAction(formData: FormData): Promise<Trainer> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const timeZone = String(formData.get("timeZone"));

  const trainer = await updateTimeZone(client, trainerId, timeZone);
  revalidatePath("/", "layout");
  return trainer;
}

/**
 * Records that the signed-in trainer has dismissed Warden Baoba's first-day
 * briefing (#27), so it never shows again on any device. Takes no
 * parameters — like {@link signOut}, this is a `<form action>` with nothing
 * for a Ranger to fill in, just something to acknowledge.
 */
export async function markIntroSeenAction(): Promise<Trainer> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const trainer = await markIntroSeen(client, trainerId);
  // The briefing can render on any authenticated screen, not just one path
  // — see the layout (#21) — so the whole tree is revalidated rather than
  // one route.
  revalidatePath("/", "layout");
  return trainer;
}

/** Ends the session, clears the auth cookies, and returns to sign-in. */
export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/sign-in");
}
