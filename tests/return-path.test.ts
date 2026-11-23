import { describe, expect, it } from "vitest";

import { safeReturnPath } from "@/lib/auth/return-path";

describe("the path sign-in returns a trainer to", () => {
  it("keeps an in-app path with its query, so a pending authorization is not lost", () => {
    expect(safeReturnPath("/oauth/consent?authorization_id=abc")).toBe(
      "/oauth/consent?authorization_id=abc",
    );
  });

  it.each([
    ["an absolute URL", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example/"],
    ["a backslash trick", "/\\evil.example"],
    ["a tab that collapses into a protocol-relative URL", "/\t/evil.example"],
    ["a path without a leading slash", "oauth/consent"],
    ["nothing", null],
    ["an empty string", ""],
  ])("falls back to home for %s", (_label, value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
});
