import { describe, expect, it } from "vitest";

import { isAllowListed } from "@/lib/auth/allow-list";

describe("the allow-list", () => {
  it("admits an address on it", () => {
    expect(isAllowListed("ash@example.com", "ash@example.com,misty@example.com")).toBe(true);
  });

  it("rejects an address that is not", () => {
    expect(isAllowListed("team.rocket@example.com", "ash@example.com")).toBe(false);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    expect(isAllowListed("  Ash@Example.com ", " ash@example.com , misty@example.com ")).toBe(
      true,
    );
  });

  describe("fails closed", () => {
    it("when the allow-list is unset", () => {
      expect(isAllowListed("ash@example.com", undefined)).toBe(false);
    });

    it("when the allow-list is empty", () => {
      expect(isAllowListed("ash@example.com", "")).toBe(false);
    });

    it("when the allow-list is only separators", () => {
      expect(isAllowListed("ash@example.com", " , , ")).toBe(false);
    });

    it("when the account has no email address", () => {
      expect(isAllowListed(null, "ash@example.com")).toBe(false);
      expect(isAllowListed(undefined, "ash@example.com")).toBe(false);
      expect(isAllowListed("", "ash@example.com")).toBe(false);
    });
  });
});
