import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { findTrainer, type Trainer } from "@/lib/trainer/trainer";

/**
 * Who is calling the MCP route (ADR-0013), established from the request's
 * bearer token alone — there is no cookie session here.
 *
 * The client built for a caller carries their own JWT, so every query it makes
 * runs under row-level security exactly as it does in the browser. It is made
 * from the anon key; this path has no use for the service-role key and must
 * never grow one.
 */
export type McpCaller = { client: SupabaseClient; trainer: Trainer };

export type Authentication =
  | { status: "authenticated"; caller: McpCaller }
  /** No token, or one the auth server does not accept. */
  | { status: "unauthenticated" }
  /** A valid token for an account that has no trainer record. */
  | { status: "not-a-trainer" };

export async function authenticate(request: NextRequest): Promise<Authentication> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) return { status: "unauthenticated" };
  const token = match[1];

  const client = createClient(supabaseUrl(), supabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Asks the auth server rather than trusting the token's own claims, so a
  // revoked grant or an expired token stops working at once.
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { status: "unauthenticated" };

  // An account with no trainer record was turned away by the allow-list.
  const trainer = await findTrainer(client, data.user.id);
  if (!trainer) return { status: "not-a-trainer" };

  return { status: "authenticated", caller: { client, trainer } };
}

/**
 * The app's own origin as a caller reaches it. `request.url` carries the
 * internal origin once the app is behind Vercel's proxy, so the forwarded host
 * wins where there is one (as in `/auth/callback`), and otherwise the `Host`
 * the caller sent.
 */
export function publicOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedHost && process.env.NODE_ENV === "production") {
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`;
  }
  // Not `request.url`: Next reports `localhost` there whatever host the client
  // addressed, and a client rejects a resource that is not the URL it called.
  const url = new URL(request.url);
  const host = request.headers.get("host");
  return host ? `${url.protocol}//${host}` : url.origin;
}

/** Where a caller learns which authorization server to use (RFC 9728). */
export function protectedResourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

/** Supabase Auth's OAuth 2.1 issuer for this project. */
export function authorizationServer(): string {
  return `${supabaseUrl()}/auth/v1`;
}
