import type { CookieOptions } from "@supabase/ssr";

/**
 * A stand-in for Next.js's request cookie store.
 *
 * Server actions reach their session through `cookies()` from `next/headers`,
 * which only exists inside a request. Tests mock that module with one of these,
 * so the action under test runs against a real Supabase session in the real
 * cookie encoding — not a stubbed-out auth layer.
 */
export type CookieJar = {
  getAll(): { name: string; value: string }[];
  get(name: string): { name: string; value: string } | undefined;
  set(name: string, value: string, options?: CookieOptions): void;
  clear(): void;
};

export function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();

  return {
    getAll() {
      return [...cookies].map(([name, value]) => ({ name, value }));
    },
    get(name) {
      const value = cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name, value, options) {
      // Supabase deletes a cookie by setting it empty with maxAge 0. Honouring
      // that is what makes sign-out observable in a test.
      if (value === "" || options?.maxAge === 0) {
        cookies.delete(name);
        return;
      }
      cookies.set(name, value);
    },
    clear() {
      cookies.clear();
    },
  };
}
