import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * A client authorised as `service_role`, bypassing row-level security
 * entirely. Not the trainer's own JWT, and never exposed to the browser —
 * "the browser never talks to the database" holds exactly as it does for
 * every other client this app makes.
 *
 * Settlement's commit (`@/lib/settlement/settlement`) is the one write in
 * this app that needs it. `apply_settlement` is handed the pure reducer's
 * already-computed ledger rows and ending state — happiness, bond
 * increments, an arriving instance — which is exactly the shape of input a
 * security-definer function reachable by a trainer's own JWT must never
 * trust: nothing would stop that JWT from calling it directly with
 * fabricated rows and an unrelated `p_ending_happiness`, forging bond levels
 * with no completed task behind them. Revoking that function from
 * `authenticated` entirely and reaching it only through this client — after
 * `requireTrainerId` has already established who is asking, the normal way
 * — is what keeps it safe to accept computed input at all.
 */
export function createSupabaseServiceRoleClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
