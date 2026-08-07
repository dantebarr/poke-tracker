import { inject } from "vitest";

/**
 * The application modules read their configuration from `process.env` exactly
 * as they do when deployed, so the local stack's details are put there before
 * any test imports them.
 */
const supabaseEnv = inject("supabaseEnv");

process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseEnv.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseEnv.anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseEnv.serviceRoleKey;
