import { describe, expect, it } from "vitest";

import {
  bucketOpenTasks,
  completedToday,
  groupDoneByDay,
  humanizeDueDate,
  sortForFieldLog,
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

describe("bucketOpenTasks", () => {
  it("groups overdue, today and tomorrow, then gives every later due date a bucket of its own", () => {
    const tasks = [
      { id: "a", dueDate: "2024-01-10" },
      { id: "b", dueDate: "2024-01-15" },
      { id: "c", dueDate: "2024-01-16" },
      { id: "d", dueDate: "2024-01-17" },
      { id: "e", dueDate: "2024-01-09" },
      { id: "f", dueDate: "2024-02-01" },
      { id: "g", dueDate: "2024-01-17" },
    ];

    const buckets = bucketOpenTasks(tasks, TODAY);

    expect(buckets.map((bucket) => [bucket.heading, bucket.tasks.map((t) => t.id)])).toEqual([
      ["Overdue", ["a", "e"]],
      ["Today", ["b"]],
      ["Tomorrow", ["c"]],
      ["Wed Jan 17", ["d", "g"]],
      ["Thu Feb 1", ["f"]],
    ]);
  });

  it("names a due date in another year by month, day and year, without the weekday", () => {
    const buckets = bucketOpenTasks([{ id: "a", dueDate: "2025-01-05" }], TODAY);

    expect(buckets.map((bucket) => bucket.heading)).toEqual(["Jan 5 2025"]);
  });

  it("still calls tomorrow Tomorrow when it falls in the next year", () => {
    const buckets = bucketOpenTasks([{ id: "a", dueDate: "2025-01-01" }], "2024-12-31");

    expect(buckets.map((bucket) => bucket.heading)).toEqual(["Tomorrow"]);
  });

  it("marks Overdue as the only alarm bucket", () => {
    const tasks = [
      { id: "a", dueDate: "2024-01-09" },
      { id: "b", dueDate: "2024-01-15" },
      { id: "c", dueDate: "2024-01-16" },
      { id: "d", dueDate: "2024-01-17" },
    ];

    expect(bucketOpenTasks(tasks, TODAY).map((bucket) => bucket.overdue)).toEqual([true, false, false, false]);
  });

  it("returns no buckets when there are no open tasks", () => {
    expect(bucketOpenTasks([], TODAY)).toEqual([]);
  });
});

describe("sortForFieldLog", () => {
  it("orders by label position, ahead of title and arrival order", () => {
    const tasks = [
      { id: "a", title: "Apricorn run", dueDate: "2024-01-15", label: { position: 2 } },
      { id: "b", title: "Catch a Rattata", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "c", title: "Buy potions", dueDate: "2024-01-15", label: { position: 1 } },
    ];

    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties within a label by due date, ahead of title", () => {
    const tasks = [
      { id: "a", title: "Apricorn run", dueDate: "2024-01-20", label: { position: 0 } },
      { id: "b", title: "Catch a Rattata", dueDate: "2024-01-10", label: { position: 0 } },
      { id: "c", title: "Buy potions", dueDate: "2024-01-15", label: { position: 0 } },
    ];

    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("breaks ties within a label and due date by title, alphabetically", () => {
    const tasks = [
      { id: "a", title: "Water the berries", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "b", title: "Catch a Rattata", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "c", title: "Heal at the Centre", dueDate: "2024-01-15", label: { position: 0 } },
    ];

    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps titles differing only by case together rather than segregating by case", () => {
    const tasks = [
      { id: "a", title: "email Ash", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "b", title: "Fly to Pewter", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "c", title: "Email Ash", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "d", title: "catch a Rattata", dueDate: "2024-01-15", label: { position: 0 } },
    ];

    // The case-only pair lands adjacent, between its neighbours; a
    // code-point comparison would instead put every capitalised title above
    // every lowercase one — "Email Ash", "Fly to Pewter", then the two
    // lowercase titles.
    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("compares a run of digits inside a title as a number", () => {
    const tasks = [
      { id: "a", title: "Chapter 10", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "b", title: "Chapter 2", dueDate: "2024-01-15", label: { position: 0 } },
    ];

    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("sorts an accented initial with its base letter", () => {
    const tasks = [
      { id: "a", title: "Battle Brock", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "b", title: "Ápricorn run", dueDate: "2024-01-15", label: { position: 0 } },
      { id: "c", title: "Catch a Rattata", dueDate: "2024-01-15", label: { position: 0 } },
    ];

    expect(sortForFieldLog(tasks).map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate its input", () => {
    const tasks = [
      { id: "a", title: "Apricorn run", dueDate: "2024-01-15", label: { position: 1 } },
      { id: "b", title: "Water the berries", dueDate: "2024-01-15", label: { position: 0 } },
    ];
    const original = [...tasks];

    sortForFieldLog(tasks);

    expect(tasks).toEqual(original);
  });

  it("composes with bucketOpenTasks: every bucket comes out ordered on its own", () => {
    const tasks = [
      { id: "a", title: "Zubat patrol", dueDate: "2024-01-15", label: { position: 1 } }, // today
      { id: "b", title: "Buy potions", dueDate: "2024-01-10", label: { position: 0 } }, // overdue
      { id: "c", title: "Water the berries", dueDate: "2024-01-15", label: { position: 0 } }, // today
      { id: "d", title: "Heal at the Centre", dueDate: "2024-01-09", label: { position: 1 } }, // overdue
      { id: "e", title: "Apricorn run", dueDate: "2024-01-15", label: { position: 0 } }, // today
      { id: "f", title: "Catch a Rattata", dueDate: "2024-01-10", label: { position: 0 } }, // overdue
      { id: "g", title: "Weed the patch", dueDate: "2024-01-16", label: { position: 0 } }, // tomorrow
      { id: "h", title: "Battle Brock", dueDate: "2024-01-16", label: { position: 0 } }, // tomorrow
      { id: "i", title: "Restock repels", dueDate: "2024-02-01", label: { position: 0 } }, // Thu Feb 1
      { id: "j", title: "Cycle to Cerulean", dueDate: "2024-02-01", label: { position: 0 } }, // Thu Feb 1
      { id: "k", title: "Visit Bill", dueDate: "2024-01-20", label: { position: 1 } }, // Sat Jan 20
    ];

    const buckets = bucketOpenTasks(sortForFieldLog(tasks), TODAY);

    expect(buckets.map((bucket) => bucket.tasks.map((t) => t.id))).toEqual([
      ["b", "f", "d"],
      ["e", "c", "a"],
      ["h", "g"],
      ["k"],
      ["j", "i"],
    ]);
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

describe("completedToday", () => {
  it("selects only the tasks completed on the given day key", () => {
    const tasks = [
      { id: "a", status: "done" as const, completedAt: "2024-01-15T09:00:00.000Z" },
      { id: "b", status: "done" as const, completedAt: "2024-01-14T09:00:00.000Z" },
      { id: "c", status: "done" as const, completedAt: "2024-01-15T18:00:00.000Z" },
      { id: "d", status: "done" as const, completedAt: "2024-01-16T09:00:00.000Z" },
    ];

    expect(completedToday(tasks, ZONE, TODAY).map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("excludes open tasks, and done tasks with no completion timestamp", () => {
    const tasks = [
      { id: "a", status: "open" as const, completedAt: null },
      { id: "b", status: "done" as const, completedAt: null },
      { id: "c", status: "done" as const, completedAt: "2024-01-15T09:00:00.000Z" },
    ];

    expect(completedToday(tasks, ZONE, TODAY).map((t) => t.id)).toEqual(["c"]);
  });

  it("resolves the day in the supplied zone, not the machine's", () => {
    // 23:30 UTC on the 14th is already 15:30 on the 15th in Auckland, and
    // still the 14th in UTC.
    const tasks = [{ id: "a", status: "done" as const, completedAt: "2024-01-14T23:30:00.000Z" }];

    expect(completedToday(tasks, "Pacific/Auckland", TODAY).map((t) => t.id)).toEqual(["a"]);
    expect(completedToday(tasks, ZONE, TODAY)).toEqual([]);
  });

  it("is empty when nothing was completed today", () => {
    expect(completedToday([], ZONE, TODAY)).toEqual([]);
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
