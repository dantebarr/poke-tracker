import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * The Supabase client for server components, server actions, and route
 * handlers. A new one per request — never shared, because it carries the
 * caller's session.
 *
 * The browser never talks to the database: everything that reads or writes goes
 * through a client made here, under the signed-in trainer's own JWT, so
 * row-level security is what enforces isolation.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so a refresh dropped here is written
          // there instead.
        }
      },
    },
  });
}
