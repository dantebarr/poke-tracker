import { ensureTrainer } from "@/app/actions/trainer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NotAllowListedError } from "@/lib/trainer/errors";

/**
 * What happened after the OAuth code was exchanged — the decision the auth
 * callback turns into a redirect.
 *
 * Kept apart from the route so the decision can be tested against a real
 * session. The route itself is then only URL handling.
 */
export type SignInOutcome =
  | { status: "signed-in" }
  | { status: "rejected" }
  | { status: "failed" };

/**
 * Finishes a sign-in for whoever the current session says is here: provisions
 * their trainer record, or tears the session down.
 *
 * Any failure signs the caller out. That is what makes rejection stick — the
 * browser leaves holding no credentials, so a turned-away account cannot go on
 * to call anything.
 */
export async function completeSignIn(): Promise<SignInOutcome> {
  try {
    await ensureTrainer();
    return { status: "signed-in" };
  } catch (thrown) {
    const client = await createSupabaseServerClient();
    await client.auth.signOut();

    if (thrown instanceof NotAllowListedError) {
      return { status: "rejected" };
    }

    // An unexpected failure — the database being unreachable, an email that
    // collides with an existing trainer. Logged rather than swallowed, but the
    // trainer gets a sign-in page instead of a stack trace.
    console.error("Sign-in failed after a successful code exchange", thrown);
    return { status: "failed" };
  }
}
