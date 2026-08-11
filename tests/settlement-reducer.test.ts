import { describe, expect, it, vi } from "vitest";

import { settleDays, type SettlementState } from "@/lib/settlement/reducer";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * task-dates.test.ts for the same note.
 */

const STARTER = "starter-instance";
const ARRIVAL = "arrival-instance";

function noPokemon(): SettlementState {
  return { happiness: 0, activeInstanceId: null };
}

function withPokemon(happiness: number, activeInstanceId: string = STARTER): SettlementState {
  return { happiness, activeInstanceId };
}

function days(tasksByDay: Record<string, { size: "small" | "medium" | "large" }[]>) {
  return { days: Object.keys(tasksByDay), tasksByDay: new Map(Object.entries(tasksByDay)) };
}

const large = { size: "large" as const };
const noDraw = () => {
  throw new Error("did not expect an arrival draw");
};

describe("a day with an active Pokémon", () => {
  it("at or above target raises happiness by the surplus and awards bond", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large, large] }); // 6 points
    const result = settleDays(withPokemon(2), ds, tasksByDay, 3, noDraw);

    expect(result.ledgerRows).toEqual([
      { day: "2024-01-01", pointsEarned: 6, target: 3, delta: 3, happinessAfter: 5, activeInstanceId: STARTER, outcome: "bond" },
    ]);
    expect(result.state).toEqual(withPokemon(5));
  });

  it("a delta of exactly zero counts as a good day and awards bond", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large, large, large] }); // 9 points
    const result = settleDays(withPokemon(0), ds, tasksByDay, 9, noDraw);

    expect(result.ledgerRows[0]).toMatchObject({ delta: 0, outcome: "bond", happinessAfter: 0 });
  });

  it("below target drops happiness by the shortfall and leaves bond alone", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large] }); // 3 points
    const result = settleDays(withPokemon(8), ds, tasksByDay, 9, noDraw);

    expect(result.ledgerRows[0]).toMatchObject({ delta: -6, outcome: "none", happinessAfter: 2 });
    expect(result.state.activeInstanceId).toBe(STARTER);
  });

  it("happiness below zero makes the Pokémon leave, resetting happiness and clearing the active instance", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [] });
    const result = settleDays(withPokemon(0), ds, tasksByDay, 3, noDraw);

    expect(result.ledgerRows[0]).toEqual({
      day: "2024-01-01",
      pointsEarned: 0,
      target: 3,
      delta: -3,
      happinessAfter: 0,
      activeInstanceId: STARTER,
      outcome: "left",
    });
    expect(result.state).toEqual(noPokemon());
  });

  it("a fourteen-day absence loses the Pokémon on the day happiness went negative, not at the end", () => {
    const tasksByDay = new Map<string, { size: "small" | "medium" | "large" }[]>(
      Array.from({ length: 14 }, (_, i) => [`2024-01-${String(i + 1).padStart(2, "0")}`, []]),
    );
    const fourteenDays = Array.from(tasksByDay.keys());

    // Starting happiness 3, target 1, zero points every day: the shortfall is
    // 1/day, so happiness crosses zero on day 4, not day 14.
    const result = settleDays(withPokemon(3), fourteenDays, tasksByDay, 1, noDraw);

    expect(result.ledgerRows).toHaveLength(14);
    expect(result.ledgerRows.map((row) => row.outcome)).toEqual([
      "none", "none", "none", "left", "none", "none", "none", "none", "none", "none", "none", "none", "none", "none",
    ]);
    expect(result.ledgerRows[3].day).toBe("2024-01-04");
    expect(result.state).toEqual(noPokemon());
  });
});

describe("a day with no active Pokémon", () => {
  it("draws an Arrival immediately on a qualifying day, its row naming no Pokémon", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large, large] }); // 6, target 3
    const draw = vi.fn().mockReturnValue(ARRIVAL);

    const result = settleDays(noPokemon(), ds, tasksByDay, 3, draw);

    expect(result.ledgerRows[0]).toEqual({
      day: "2024-01-01",
      pointsEarned: 6,
      target: 3,
      delta: 3,
      happinessAfter: 0,
      activeInstanceId: null,
      outcome: "approaching",
    });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(result.state).toEqual({ happiness: 3, activeInstanceId: ARRIVAL });
  });

  it("does nothing on a day below target", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [] });
    const result = settleDays(noPokemon(), ds, tasksByDay, 3, noDraw);

    expect(result.state).toEqual(noPokemon());
    expect(result.ledgerRows[0].outcome).toBe("none");
  });

  it("leave, then an Approaching day, then the Arrival's first day settles as an ordinary one on top of that day's delta", () => {
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [], // leaves (happiness 0 - 3 < 0)
      "2024-01-02": [large, large], // Approaching: draws now, delta = 6 - 3 = 3
      "2024-01-03": [large], // the Arrival's first day: 3 points, delta = 0, an ordinary bond day
    });
    const draw = vi.fn().mockReturnValue(ARRIVAL);

    const result = settleDays(withPokemon(0), ds, tasksByDay, 3, draw);

    expect(result.ledgerRows.map((row) => row.outcome)).toEqual(["left", "approaching", "bond"]);
    expect(result.ledgerRows[1].activeInstanceId).toBeNull();
    expect(result.ledgerRows[2]).toMatchObject({ activeInstanceId: ARRIVAL, delta: 0, happinessAfter: 3 });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(result.state).toEqual({ happiness: 3, activeInstanceId: ARRIVAL });
  });

  it("draws even when the qualifying day is the last one in the batch — no second day needed", () => {
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [],
      "2024-01-02": [],
      "2024-01-03": [large, large], // qualifies (6 - 3 = 3 >= 0), and it's the last day in this batch
    });
    const draw = vi.fn().mockReturnValue(ARRIVAL);

    const result = settleDays(noPokemon(), ds, tasksByDay, 3, draw);

    expect(result.ledgerRows[2]).toMatchObject({ day: "2024-01-03", outcome: "approaching", activeInstanceId: null });
    expect(draw).toHaveBeenCalledTimes(1);
    expect(result.state).toEqual({ happiness: 3, activeInstanceId: ARRIVAL });
  });
});

describe("settling with nothing to settle", () => {
  it("is a no-op", () => {
    const starting = withPokemon(4);
    const result = settleDays(starting, [], new Map(), 3, noDraw);

    expect(result.state).toEqual(starting);
    expect(result.ledgerRows).toEqual([]);
  });
});
