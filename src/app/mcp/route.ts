import { NextResponse, type NextRequest } from "next/server";

import { authenticate, protectedResourceMetadataUrl, publicOrigin } from "@/lib/mcp/auth";
import { handleMessage } from "@/lib/mcp/server";

/**
 * The remote MCP endpoint (ADR-0013): a route handler, not a server action,
 * because an MCP client speaks HTTP to a fixed URL.
 *
 * Every call runs under the calling trainer's own
 * OAuth-issued JWT, so row-level security applies as it does in the browser;
 * the work itself is in `@/lib/mcp`, so this stays HTTP handling.
 */
export async function POST(request: NextRequest) {
  const authentication = await authenticate(request);

  if (authentication.status === "unauthenticated") {
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(publicOrigin(request))}"`,
        },
      },
    );
  }
  if (authentication.status === "not-a-trainer") {
    return NextResponse.json({ error: "no trainer record for this account" }, { status: 403 });
  }

  const reply = await handleMessage(await request.text(), authentication.caller);
  return reply.body === undefined
    ? new NextResponse(null, { status: reply.status })
    : NextResponse.json(reply.body, { status: reply.status });
}

/** There is no server-initiated stream to offer; the spec asks for 405. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
