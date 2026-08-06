"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureTrainerForSession } from "@/lib/trainer/session";
import type { Trainer } from "@/lib/trainer/trainer";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. Server actions are reachable by direct POST, not only through the
 * UI, so each one establishes the caller from their session — see
 * `ensureTrainerForSession`.
 *
 * A `"use server"` module may only export async functions, so the errors these
 * can throw live in `@/lib/trainer/errors`.
 */

/**
 * Gives the signed-in account its trainer record, or returns the one it already
 * has. Safe to call on every sign-in.
 */
export async function ensureTrainer(): Promise<Trainer> {
  return ensureTrainerForSession();
}

/** Ends the session, clears the auth cookies, and returns to sign-in. */
export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  redirect("/sign-in");
}
