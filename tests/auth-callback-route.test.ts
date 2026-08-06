import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/auth/callback/route";

/**
 * The callback's URL handling — the branches that never reach a session, and so
 * never reach the database.
 *
 * What happens once a session exists is covered in `trainer-provisioning.test.ts`
 * against a real one.
 */
function callback(query: string) {
  return new NextRequest(`http://127.0.0.1:3000/auth/callback${query}`);
}

/** Where a response redirects to, as a path and query — the host is Next's to pick. */
function redirectTarget(response: Response): string {
  const location = response.headers.get("location");
  if (!location) throw new Error("expected a redirect");
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}

describe("the auth callback", () => {
  it("sends a request with no code back to sign-in", async () => {
    const response = await GET(callback(""));

    expect(response.status).toBe(307);
    expect(redirectTarget(response)).toBe("/sign-in?error=missing_code");
  });

  it("passes a provider failure through to sign-in", async () => {
    const response = await GET(callback("?error_description=access%20denied"));

    expect(redirectTarget(response)).toBe("/sign-in?error=access%20denied");
  });

  it("prefers a provider failure over a code, so a partial callback cannot sign anyone in", async () => {
    const response = await GET(callback("?code=abc&error_description=access%20denied"));

    expect(redirectTarget(response)).toContain("/sign-in?error=");
  });
});
