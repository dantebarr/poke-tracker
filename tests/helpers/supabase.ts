import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";

import type { CookieJar } from "./cookie-jar";

const { url, anonKey, serviceRoleKey } = inject("supabaseEnv");

/**
 * A client that bypasses row-level security. Used only to arrange and inspect —
 * creating test accounts, counting rows the way an auditor would. Nothing the
 * app does goes through it.
 */
export function adminClient(): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** A client carrying whatever session the jar holds, exactly as the app makes one. */
export function clientForJar(jar: CookieJar): SupabaseClient {
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          jar.set(name, value, options);
        }
      },
    },
  });
}

export type TestAccount = {
  id: string;
  email: string;
  password: string;
};

/**
 * Creates a confirmed account and returns it.
 *
 * Deployed, the only way in is Google. Locally, a password account is the
 * cheapest way to get a genuine session — and provisioning does not care which
 * provider issued it, only who the session says you are.
 */
export async function createAccount(
  email: string,
  metadata: Record<string, unknown> = {},
): Promise<TestAccount> {
  const password = `test-${crypto.randomUUID()}`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (error) throw error;
  return { id: data.user.id, email, password };
}

/** Signs the account in, leaving a real session in the jar. */
export async function signIn(jar: CookieJar, account: TestAccount): Promise<void> {
  const { error } = await clientForJar(jar).auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) throw error;
}

/** Removes the account and, by cascade, its trainer record. */
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw error;
}

/** How many trainer rows exist, ignoring row-level security. */
export async function countTrainers(): Promise<number> {
  const { count, error } = await adminClient()
    .from("trainer")
    .select("id", { count: "exact", head: true });

  // Postgrest errors are plain objects; wrapping keeps a failure here legible
  // in the test report rather than printing as `{ message: '' }`.
  if (error) {
    throw new Error(`Counting trainers failed: ${JSON.stringify(error)}`);
  }
  return count ?? 0;
}
