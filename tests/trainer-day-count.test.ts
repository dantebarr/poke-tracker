import { describe, expect, it } from "vitest";

import { dayCount } from "@/lib/trainer/day-count";

/**
 * Pure logic, no database — the status strip's "DAY n", derived from the
 * trainer's existing `created_at` rather than a new column (#21).
 */
describe("dayCount", () => {
  it("is day 1 on the day a trainer signs up", () => {
    const createdAt = new Date("2026-08-08T14:00:00.000Z");
    const now = new Date("2026-08-08T23:00:00.000Z");

    expect(dayCount(createdAt, now, "UTC")).toBe(1);
  });

  it("counts forward one per calendar day, in the trainer's own time zone", () => {
    const createdAt = new Date("2026-08-08T14:00:00.000Z");
    const now = new Date("2026-08-10T09:00:00.000Z");

    expect(dayCount(createdAt, now, "UTC")).toBe(3);
  });

  it("uses the trainer's time zone rather than UTC to decide which day it is", () => {
    // 02:30 UTC on the 9th is still the 8th in Los Angeles, so this is still day 1.
    const createdAt = new Date("2026-08-08T20:00:00.000Z");
    const now = new Date("2026-08-09T02:30:00.000Z");

    expect(dayCount(createdAt, now, "America/Los_Angeles")).toBe(1);
    expect(dayCount(createdAt, now, "UTC")).toBe(2);
  });
});
