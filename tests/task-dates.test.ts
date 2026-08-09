import { describe, expect, it } from "vitest";

import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  bucketOpenTasks,
  getBucket,
  groupDoneByDay,
  humanizeDueDate,
  todayPoints,
} from "@/lib/task/dates";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole.
 *
 * A fixed Monday day key is used as "today" throughout so weekday-short
 * output (`Intl.DateTimeFormat(... { weekday: 'short' })`) is deterministic.
 * `completedAt` timestamps use a plain zone (UTC) — the zone-awareness of
 * `groupDoneByDay`/`todayPoints` itself is what settlement-timezone.test.ts
 * and day.test.ts cover directly.
 */
const TODAY = "2024-01-15"; // Monday
const ZONE = "UTC";

describe("getBucket", () => {
  it("buckets a date before today as overdue", () => {
    expect(getBucket("2024-01-14", TODAY)).toBe("overdue");
  });

  it("buckets today's date as today", () => {
    expect(getBucket("2024-01-15", TODAY)).toBe("today");
  });

  it("buckets tomorrow's date as tomorrow", () => {
    expect(getBucket("2024-01-16", TODAY)).toBe("tomorrow");
  });

  it("buckets a date two days out as later", () => {
    expect(getBucket("2024-01-17", TODAY)).toBe("later");
  });
});

describe("bucketOpenTasks", () => {
  it("groups tasks by bucket, preserving order within each", () => {
    const tasks = [
      { id: "a", dueDate: "2024-01-10" },
      { id: "b", dueDate: "2024-01-15" },
      { id: "c", dueDate: "2024-01-16" },
      { id: "d", dueDate: "2024-02-01" },
      { id: "e", dueDate: "2024-01-09" },
    ];

    const buckets = bucketOpenTasks(tasks, TODAY);

    expect(buckets.overdue.map((t) => t.id)).toEqual(["a", "e"]);
    expect(buckets.today.map((t) => t.id)).toEqual(["b"]);
    expect(buckets.tomorrow.map((t) => t.id)).toEqual(["c"]);
    expect(buckets.later.map((t) => t.id)).toEqual(["d"]);
  });

  it("covers every bucket in BUCKET_ORDER and BUCKET_LABELS", () => {
    expect(BUCKET_ORDER).toEqual(["overdue", "today", "tomorrow", "later"]);
    expect(Object.keys(BUCKET_LABELS).sort()).toEqual([...BUCKET_ORDER].sort());
  });
});

describe("humanizeDueDate", () => {
  it("reads overdue tasks as days overdue, singular for one day", () => {
    expect(humanizeDueDate("2024-01-14", TODAY)).toBe("1 day overdue");
    expect(humanizeDueDate("2024-01-10", TODAY)).toBe("5 days overdue");
  });

  it("reads today and tomorrow by name", () => {
    expect(humanizeDueDate("2024-01-15", TODAY)).toBe("Today");
    expect(humanizeDueDate("2024-01-16", TODAY)).toBe("Tomorrow");
  });

  it("reads the rest of the week by weekday", () => {
    expect(humanizeDueDate("2024-01-20", TODAY)).toBe("Sat");
  });

  it("reads anything further out by month and day", () => {
    expect(humanizeDueDate("2024-01-22", TODAY)).toBe("Jan 22");
  });

  it("drops the urgency framing when neutral, for done tasks", () => {
    expect(humanizeDueDate("2024-01-12", TODAY, true)).toBe("Fri");
    expect(humanizeDueDate("2024-01-22", TODAY, true)).toBe("Jan 22");
    expect(humanizeDueDate("2024-01-08", TODAY, true)).toBe("Jan 8");
  });
});

describe("groupDoneByDay", () => {
  it("groups by completion day in the given zone, most recent first, humanising each day's label", () => {
    const tasks = [
      { id: "a", completedAt: "2024-01-15T09:00:00.000Z" },
      { id: "b", completedAt: "2024-01-14T09:00:00.000Z" },
      { id: "c", completedAt: "2024-01-15T18:00:00.000Z" },
      { id: "d", completedAt: "2024-01-08T09:00:00.000Z" },
    ];

    const groups = groupDoneByDay(tasks, ZONE, TODAY);

    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Jan 8"]);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(["a", "c"]);
    expect(groups[1].tasks.map((t) => t.id)).toEqual(["b"]);
    expect(groups[2].tasks.map((t) => t.id)).toEqual(["d"]);
  });

  it("groups by the zone's local day, not UTC's", () => {
    // 23:30 UTC on the 14th is already 15:30 on the 15th in Auckland.
    const tasks = [{ id: "a", completedAt: "2024-01-14T23:30:00.000Z" }];

    const groups = groupDoneByDay(tasks, "Pacific/Auckland", TODAY);

    expect(groups.map((g) => g.label)).toEqual(["Today"]);
  });
});

describe("todayPoints", () => {
  it("sums effort points for tasks completed today in the given zone, ignoring other days and open tasks", () => {
    const tasks = [
      { status: "done" as const, completedAt: "2024-01-15T09:00:00.000Z", size: "small" as const },
      { status: "done" as const, completedAt: "2024-01-15T18:00:00.000Z", size: "medium" as const },
      { status: "done" as const, completedAt: "2024-01-14T09:00:00.000Z", size: "large" as const },
      { status: "open" as const, completedAt: null, size: "large" as const },
    ];

    expect(todayPoints(tasks, ZONE, TODAY)).toBe(1 + 2);
  });

  it("is zero when nothing was completed today", () => {
    expect(todayPoints([], ZONE, TODAY)).toBe(0);
  });
});
