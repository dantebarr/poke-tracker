/**
 * The cookie the proxy leaves when it bounces a signed-out visitor to sign-in,
 * so `/auth/callback` can send them on to where they were headed. A cookie
 * rather than a query parameter on Supabase's redirect URL, which would have
 * to match its redirect allow-list exactly.
 */
export const RETURN_PATH_COOKIE = "return_to";
export const RETURN_PATH_MAX_AGE_SECONDS = 10 * 60;

/**
 * Where sign-in sends a trainer afterwards. The cookie is client-controlled, so
 * anything that is not a plain path within this app falls back to home rather
 * than becoming an open redirect.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  // `//host` and `/\host` are read by browsers as another origin.
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  // URL parsers strip tabs and newlines, so `/<TAB>/host` becomes `//host`.
  if (/[\t\r\n\\]/.test(value)) return "/";
  return value;
}
