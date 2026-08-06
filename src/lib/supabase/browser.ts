import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * The browser client exists for one purpose: starting the Google OAuth
 * redirect, which has to originate from the browser. It is deliberately not a
 * data path — server components read and server actions write.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
