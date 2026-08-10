"use client";

import { useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * The one thing the browser does with Supabase directly: start the OAuth
 * redirect, which has to originate here. Google sends the trainer back to
 * `/auth/callback`, where the allow-list is enforced and the session is
 * established server-side.
 */
export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);

  async function signIn() {
    setPending(true);
    const client = createSupabaseBrowserClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    // On success the browser is already navigating away, so only a failure
    // returns control here.
    if (error) setPending(false);
  }

  return (
    <button type="button" onClick={signIn} disabled={pending} className="primary">
      {pending ? "Redirecting…" : "Continue with Google"}
    </button>
  );
}
