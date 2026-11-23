import { NextResponse, type NextRequest } from "next/server";

import { authorizationServer, publicOrigin } from "@/lib/mcp/auth";

/**
 * OAuth protected-resource metadata (RFC 9728) for the MCP route: tells a
 * client the Supabase project's auth server is who to get a token from.
 *
 * Served at the bare path and at `/mcp` beneath it, since clients derive the
 * URL from the resource's path and some only try the bare one.
 */
export async function GET(request: NextRequest) {
  return NextResponse.json({
    resource: `${publicOrigin(request)}/mcp`,
    authorization_servers: [authorizationServer()],
    bearer_methods_supported: ["header"],
  });
}
