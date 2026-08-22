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

    // `happinessAfter` is the happiness this day left the trainer with, and
    // an Approaching day banks its own delta on top of whatever was carried
    // (ADR-0009) — it is no longer hardcoded to 0 on a pokemon-less row.
    expect(result.ledgerRows[0]).toEqual({
      day: "2024-01-01",
      pointsEarned: 6,
      target: 3,
      delta: 3,
      happinessAfter: 3,
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

/**
 * Parting (#5): a day the Ranger chose to end the pairing on, supplied to
 * the reducer as a day key rather than a flag — see ADR-0009 for the
 * happiness clamp that replaced the reset, and why a `parted` day carries
 * its happiness where a `left` day does not.
 */
describe("a parting", () => {
  it("at or above target ends the pairing, carries the happiness and still earns bond", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large, large] }); // 6, target 3
    const result = settleDays(withPokemon(2), ds, tasksByDay, 3, noDraw, "2024-01-01");

    expect(result.ledgerRows).toEqual([
      { day: "2024-01-01", pointsEarned: 6, target: 3, delta: 3, happinessAfter: 5, activeInstanceId: STARTER, outcome: "parted" },
    ]);
    expect(result.state).toEqual({ happiness: 5, activeInstanceId: null });
  });

  it("below target but still above zero happiness parts anyway, carrying what's left", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [large] }); // 3, target 9
    const result = settleDays(withPokemon(8), ds, tasksByDay, 9, noDraw, "2024-01-01");

    expect(result.ledgerRows[0]).toMatchObject({ delta: -6, outcome: "parted", happinessAfter: 2 });
    expect(result.state).toEqual({ happiness: 2, activeInstanceId: null });
  });

  it("loses to neglect when the same day would take happiness below zero", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [] }); // 0, target 3
    const result = settleDays(withPokemon(2), ds, tasksByDay, 3, noDraw, "2024-01-01");

    expect(result.ledgerRows[0]).toMatchObject({ delta: -3, outcome: "left", happinessAfter: 0 });
    expect(result.state).toEqual(noPokemon());
  });

  it("applies to the day it names when several are settled in one catch-up run", () => {
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [large, large], // the parting day: 6 vs target 3
      "2024-01-02": [], // pokemon-less and below target — costs nothing
      "2024-01-03": [], // likewise
    });

    const result = settleDays(withPokemon(1), ds, tasksByDay, 3, noDraw, "2024-01-01");

    expect(result.ledgerRows.map((row) => row.outcome)).toEqual(["parted", "none", "none"]);
    expect(result.ledgerRows[1]).toMatchObject({ activeInstanceId: null, happinessAfter: 4 });
    expect(result.state).toEqual({ happiness: 4, activeInstanceId: null });
  });

  it("carries its happiness into the Pokémon that arrives next", () => {
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [large, large], // parting day: delta 3, happiness 1 -> 4
      "2024-01-02": [large, large], // Approaching: delta 3, happiness 4 -> 7
    });
    const draw = vi.fn().mockReturnValue(ARRIVAL);

    const result = settleDays(withPokemon(1), ds, tasksByDay, 3, draw, "2024-01-01");

    expect(result.ledgerRows.map((row) => row.outcome)).toEqual(["parted", "approaching"]);
    expect(result.ledgerRows[1]).toMatchObject({ activeInstanceId: null, happinessAfter: 7 });
    expect(result.state).toEqual({ happiness: 7, activeInstanceId: ARRIVAL });
  });

  it("matching no day in the run does nothing at all", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-02": [large, large] });
    const result = settleDays(withPokemon(2), ds, tasksByDay, 3, noDraw, "2023-12-25");

    expect(result.ledgerRows[0]).toMatchObject({ outcome: "bond", activeInstanceId: STARTER });
    expect(result.state).toEqual(withPokemon(5));
  });
});

describe("happiness carried while pokemon-less (ADR-0009)", () => {
  it("sits still through a bad day — there is nobody there to neglect", () => {
    const { days: ds, tasksByDay } = days({ "2024-01-01": [] });
    const result = settleDays({ happiness: 4, activeInstanceId: null }, ds, tasksByDay, 3, noDraw);

    expect(result.ledgerRows[0]).toMatchObject({ delta: -3, outcome: "none", happinessAfter: 4 });
    expect(result.state).toEqual({ happiness: 4, activeInstanceId: null });
  });

  it("is never dragged below zero by a run of bad days", () => {
    const tasksByDay = new Map<string, { size: "small" | "medium" | "large" }[]>(
      Array.from({ length: 5 }, (_, i) => [`2024-01-0${i + 1}`, []]),
    );
    const result = settleDays({ happiness: 2, activeInstanceId: null }, [...tasksByDay.keys()], tasksByDay, 3, noDraw);

    expect(result.state).toEqual({ happiness: 2, activeInstanceId: null });
  });
});

/**
 * The spec's own "cases that must be covered explicitly" closes on this one:
 * every ledger row settled under the old rules keeps its meaning. Before
 * Parting existed, carried happiness could only ever be zero — nothing
 * survived a departure — so these pin the two rules ADR-0009 rewrote against
 * the states that were actually reachable then.
 */
describe("rows settled under the old rules keep their meaning (ADR-0009)", () => {
  it("credits bond on exactly the days `outcome: bond` used to name", () => {
    // The bond credit moved from `outcome === "bond"` to `delta >= 0`. With
    // no parting set the two are the same predicate, and this asserts it
    // across a run that hits every branch an active day has.
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [large, large], // delta +3 — good
      "2024-01-02": [large], // delta 0 — good, exactly at target
      "2024-01-03": [], // delta -3 — bad, but happiness absorbs it
      "2024-01-04": [], // delta -3 — bad, and happiness runs out
    });

    const result = settleDays(withPokemon(0), ds, tasksByDay, 3, noDraw);

    for (const row of result.ledgerRows) {
      expect(row.delta >= 0, `row ${row.day}`).toBe(row.outcome === "bond");
    }
    expect(result.ledgerRows.map((row) => row.outcome)).toEqual(["bond", "bond", "none", "left"]);
  });

  it("leaves an active-Pokémon run byte-identical to what the old rules produced", () => {
    const { days: ds, tasksByDay } = days({
      "2024-01-01": [large, large],
      "2024-01-02": [large],
      "2024-01-03": [],
      "2024-01-04": [],
    });

    const result = settleDays(withPokemon(0), ds, tasksByDay, 3, noDraw);

    expect(result.ledgerRows).toEqual([
      { day: "2024-01-01", pointsEarned: 6, target: 3, delta: 3, happinessAfter: 3, activeInstanceId: STARTER, outcome: "bond" },
      { day: "2024-01-02", pointsEarned: 3, target: 3, delta: 0, happinessAfter: 3, activeInstanceId: STARTER, outcome: "bond" },
      { day: "2024-01-03", pointsEarned: 0, target: 3, delta: -3, happinessAfter: 0, activeInstanceId: STARTER, outcome: "none" },
      { day: "2024-01-04", pointsEarned: 0, target: 3, delta: -3, happinessAfter: 0, activeInstanceId: STARTER, outcome: "left" },
    ]);
    expect(result.state).toEqual(noPokemon());
  });

  it("clamps to zero on the day the Pokémon leaves, exactly as the reset used to", () => {
    // The clamp replaced `happiness: 0` on departure. Starting from any
    // happiness reachable before Parting, the two are the same write.
    const { days: ds, tasksByDay } = days({ "2024-01-01": [] });
    const result = settleDays(withPokemon(1), ds, tasksByDay, 5, noDraw);

    expect(result.ledgerRows[0]).toMatchObject({ outcome: "left", happinessAfter: 0 });
    expect(result.state).toEqual(noPokemon());
  });
});
