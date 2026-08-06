import { isAllowListed } from "@/lib/auth/allow-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotAllowListedError, NotSignedInError } from "@/lib/trainer/errors";
import { findTrainer, provisionTrainer, type Trainer } from "@/lib/trainer/trainer";

/**
 * The session-aware trainer operations. Server components call the read;
 * the auth callback and the server actions call the write.
 *
 * Everything here re-establishes who the caller is from their session rather
 * than trusting an argument, because both entry points are reachable directly
 * over HTTP.
 */

/**
 * Gives the signed-in account its trainer record, or returns the one it already
 * has.
 *
 * @throws NotSignedInError when there is no session.
 * @throws NotAllowListedError when the account's email is not on the
 * allow-list. Nothing is written in that case — a rejected account gets no
 * trainer record, and therefore no data.
 */
export async function ensureTrainerForSession(): Promise<Trainer> {
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

  return provisionTrainer(client, {
    id: user.id,
    email: user.email,
    displayName: typeof fullName === "string" ? fullName : null,
  });
}

/**
 * The signed-in trainer, or null when nobody is signed in or the account has no
 * trainer record. Row-level security means this can only ever be the caller's
 * own row.
 */
export async function currentTrainer(): Promise<Trainer | null> {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) return null;

  return findTrainer(client, user.id);
}
