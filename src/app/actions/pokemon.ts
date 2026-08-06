"use server";

import { setInstanceNickname } from "@/lib/pokemon/pokemon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotSignedInError } from "@/lib/trainer/errors";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale.
 */

/**
 * Sets or changes an instance's nickname. Bound to the instance id from the
 * form that calls it — see the home page panel.
 *
 * An empty or whitespace-only nickname clears it back to null rather than
 * storing blank text. Row-level security means the update silently touches
 * nothing if `instanceId` doesn't belong to the caller.
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
}
