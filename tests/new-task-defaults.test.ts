import { describe, expect, it } from "vitest";

import { newTaskFields } from "@/app/task-edit-fields";
import type { Label } from "@/lib/label/label";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * tests/chrome-navigation.test.ts for the same note and its shape.
 *
 * What a brand new task's form opens on. `listLabels` hands the app a
 * trainer's labels already in display order, so "the top label" is the first
 * of the array here, exactly as both add forms receive it.
 */
const TODAY = "2024-01-15";

function label(id: string, position: number): Label {
  return {
    id,
    trainerId: "trainer-1",
    name: `Label ${id}`,
    color: "#123456",
    position,
    abbreviation: id.slice(0, 2).toUpperCase(),
  };
}

const labels = [label("work", 0), label("home", 1)];

describe("newTaskFields", () => {
  it("is due today", () => {
    expect(newTaskFields({ todayKey: TODAY, labels }).dueDate).toBe(TODAY);
  });

  it("uses the trainer's own day, not the device's", () => {
    expect(newTaskFields({ todayKey: "2023-06-30", labels }).dueDate).toBe("2023-06-30");
  });

  it("takes the top label in the trainer's display order", () => {
    expect(newTaskFields({ todayKey: TODAY, labels }).labelId).toBe("work");
  });

  it("follows the trainer's order rather than a fixed label", () => {
    const reordered = [label("home", 0), label("work", 1)];
    expect(newTaskFields({ todayKey: TODAY, labels: reordered }).labelId).toBe("home");
  });

  it("is small", () => {
    expect(newTaskFields({ todayKey: TODAY, labels }).size).toBe("small");
  });

  it("starts with an empty title and no notes", () => {
    const fields = newTaskFields({ todayKey: TODAY, labels });
    expect(fields.title).toBe("");
    expect(fields.notes).toBe("");
  });

  it("leaves the label blank for a trainer with none, rather than inventing one", () => {
    expect(newTaskFields({ todayKey: TODAY, labels: [] }).labelId).toBe("");
  });
});
