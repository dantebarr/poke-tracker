import { allowListSetting } from "@/lib/env";

/**
 * Sign-in is restricted to an allow-list so that the app being on the public
 * internet does not make it public. The check happens at the auth callback: an
 * account that fails it never gets a trainer record, and therefore no data.
 */

function parse(setting: string | undefined): Set<string> {
  return new Set(
    (setting ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
}

/**
 * Fails closed in every ambiguous case: an unset or empty allow-list admits
 * nobody, and neither does an account with no email address. Misconfiguration
 * should lock the owner out, never let the internet in.
 */
export function isAllowListed(
  email: string | null | undefined,
  setting: string | undefined = allowListSetting(),
): boolean {
  if (!email) return false;

  const allowed = parse(setting);
  if (allowed.size === 0) return false;

  return allowed.has(email.trim().toLowerCase());
}
