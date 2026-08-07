"use server";

import { revalidatePath } from "next/cache";

import { settle } from "@/lib/settlement/settlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainerId } from "@/lib/trainer/session";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale.
 *
 * This is settlement's only trigger (#10) — there is no manual one. The
 * browser is the one thing that knows the trainer's own IANA timezone, so a
 * client component calls this on every app entry, passing it along; nothing
 * else calls it.
 *
 * @throws NotSignedInError when there is no session.
 */
export async function settleOnEntry(timeZone: string): Promise<void> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const settled = await settle(client, trainerId, timeZone);
  if (settled) {
    revalidatePath("/");
  }
}
