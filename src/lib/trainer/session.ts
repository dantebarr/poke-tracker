import { createSupabaseServerClient } from "@/lib/supabase/server";
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
