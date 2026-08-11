"use server";

import { revalidatePath } from "next/cache";

import { settle } from "@/lib/settlement/settlement";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireTrainerId } from "@/lib/trainer/session";

/**
 * Every write goes through a server action; the browser never talks to the
 * database. See `@/app/actions/trainer` for the fuller rationale.
 *
 * This is settlement's only trigger (#10) — there is no manual one. A client
 * component calls this on every app entry; nothing else calls it. The
 * trainer's own stored time zone (Settings) is what settlement reasons about
 * — never one read from the browser (ADR-0004).
 *
 * @throws NotSignedInError when there is no session.
 */
export async function settleOnEntry(): Promise<void> {
  const client = await createSupabaseServerClient();
  const trainerId = await requireTrainerId(client);

  const settled = await settle(client, trainerId);
  if (settled) {
    // Layout-scoped, not page-scoped (#33): a settlement can change which
    // Pokémon is active and Baoba's line about it, both drawn by the chrome
    // layout on every destination, not only `/`.
    revalidatePath("/", "layout");
  }
}
