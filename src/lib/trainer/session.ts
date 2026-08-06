import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotSignedInError } from "@/lib/trainer/errors";
import { findTrainer, type Trainer } from "@/lib/trainer/trainer";

/**
 * The read side. Server components call this; writes go through the server
 * actions in `@/app/actions/trainer`.
 */

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

/**
 * The signed-in trainer's id, for a client that already carries their
 * session. Throws rather than returning null — for server actions that need
 * to act as someone, not merely read for someone if present.
 */
export async function requireTrainerId(client: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) throw new NotSignedInError();
  return user.id;
}
