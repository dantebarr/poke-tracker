/**
 * Environment access, in one place, so a missing variable fails loudly at the
 * point of use rather than surfacing as an unexplained auth error later.
 *
 * Every `process.env.X` below is written out in full, deliberately. Next.js
 * makes `NEXT_PUBLIC_*` variables available to browser code by substituting the
 * literal text `process.env.NEXT_PUBLIC_FOO` at build time — it is find-and-
 * replace, not a runtime lookup. A computed `process.env[name]` matches nothing
 * and comes out `undefined` in the browser, while still working on the server,
 * so the breakage shows up only in client components.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * The raw allow-list as configured: a comma-separated list of email addresses.
 * Absent is not the same as empty — see {@link isAllowListed}, which fails
 * closed either way.
 *
 * Server-only: it is not `NEXT_PUBLIC_`, so it never reaches the browser.
 */
export function allowListSetting(): string | undefined {
  return process.env.POKE_TRACKER_ALLOWED_EMAILS;
}
