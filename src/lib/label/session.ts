import { listLabels, type Label } from "@/lib/label/label";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The read side. Server components call this; writes go through the server
 * actions in `@/app/actions/label`.
 */

/** A trainer's labels, in display order. Row-level security scopes this to the caller's own. */
export async function currentLabels(trainerId: string): Promise<Label[]> {
  const client = await createSupabaseServerClient();
  return listLabels(client, trainerId);
}
