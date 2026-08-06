/**
 * Environment access, in one place, so a missing variable fails loudly at the
 * point of use rather than surfacing as an unexplained auth error later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL");
}

export function supabaseAnonKey(): string {
  return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * The raw allow-list as configured: a comma-separated list of email addresses.
 * Absent is not the same as empty — see {@link isAllowListed}, which fails
 * closed either way.
 */
export function allowListSetting(): string | undefined {
  return process.env.POKE_TRACKER_ALLOWED_EMAILS;
}
