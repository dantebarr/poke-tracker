import { describe, expect, it } from "vitest";

import { buildBaobaLine, type BaobaLineFacts } from "@/lib/baoba/dialogue";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";
import type { LatestDayLedgerEvent } from "@/lib/settlement/ledger";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * encounter-view.test.ts for the same note and its shape.
 */

function pokemon(overrides: Partial<ActivePokemon> = {}): ActivePokemon {
  return {
    instanceId: "instance-1",
    nickname: "Sickle",
    happiness: 5,
    bondLevel: 5,
    bondRequirement: 7,
    distanceToBondRequirement: 2,
    species: {
      id: 123,
      name: "scyther",
      spritePath: "/species/123.png",
      zone: "forest",
      animatedSpritePath: "/species/animated/123.gif",
      ...overrides.species,
    },
    ...overrides,
  };
}

const NO_EVENT: LatestDayLedgerEvent = null;

function facts(overrides: Partial<BaobaLineFacts> = {}): BaobaLineFacts {
  return {
    pokemon: pokemon(),
    dailyTarget: 3,
    latestDay: NO_EVENT,
    readyToEvolve: false,
    overdueCount: 0,
    ...overrides,
  };
}

describe("a Ranger with no Active Pokémon", () => {
  it("gets a line saying what brings one back", () => {
    const line = buildBaobaLine(facts({ pokemon: null }));
    expect(line).toBe("No Pokémon keeping you company right now, Ranger. Hit your daily target and one's bound to come find you.");
  });
});

describe("special states, ahead of the mood fallback", () => {
  it("gets its own line the day a Pokémon arrives, naming it", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: pokemon({ nickname: "Sickle" }),
        latestDay: { event: "approaching", pokemonName: null, delta: 3 },
      }),
    );
    expect(line).toContain("Sickle");
    expect(line).toContain("turned up");
  });

  it("gets its own line the day a Pokémon leaves, naming it and the miss", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: null,
        latestDay: { event: "left", pokemonName: "chansey", delta: -2 },
      }),
    );
    expect(line).toContain("Chansey");
    expect(line).toContain("missed the target by 2");
  });

  it("gets its own line when ready to evolve, naming it", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: pokemon({ nickname: "Sickle", distanceToBondRequirement: 0 }),
        readyToEvolve: true,
      }),
    );
    expect(line).toContain("Sickle");
    expect(line).toContain("next step");
  });

  it("withholds the evolve line for an un-named Instance, deferring to naming (#25)", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: pokemon({ nickname: null, distanceToBondRequirement: 0 }),
        readyToEvolve: true,
      }),
    );
    expect(line).not.toContain("next step");
  });

  it("prefers the arrival line over a same-day evolve readiness", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: pokemon({ nickname: "Sickle", distanceToBondRequirement: 0 }),
        latestDay: { event: "approaching", pokemonName: null, delta: 3 },
        readyToEvolve: true,
      }),
    );
    expect(line).toContain("turned up");
  });

  it("prefers the departure line over the generic no-Pokémon line", () => {
    const line = buildBaobaLine(
      facts({
        pokemon: null,
        latestDay: { event: "left", pokemonName: "chansey", delta: -1 },
      }),
    );
    expect(line).toContain("Chansey");
    expect(line).not.toContain("Hit your daily target");
  });
});

describe("the mood fallback", () => {
  it.each([
    ["sad", "gone for good"],
    ["worried", "restless"],
    ["neutral", "settled in fine"],
    ["happy", "content"],
    ["beaming", "thriving"],
  ] as const)("narrates the %s tier by nickname", (tier, phrase) => {
    const happinessByTier = { sad: -1, worried: 0, neutral: 3, happy: 6, beaming: 12 } as const;
    const line = buildBaobaLine(
      facts({ pokemon: pokemon({ nickname: "Sickle", happiness: happinessByTier[tier] }), dailyTarget: 3 }),
    );
    expect(line).toContain("Sickle");
    expect(line.toLowerCase()).toContain(phrase);
  });

  it("never fires on a day with no event but no other reason not to fall back", () => {
    const line = buildBaobaLine(facts({ latestDay: { event: "none", pokemonName: null, delta: 3 } }));
    expect(line).toContain("Sickle");
  });
});

describe("the Overdue clause", () => {
  it("adds nothing when there's no overdue work", () => {
    const line = buildBaobaLine(facts({ overdueCount: 0 }));
    expect(line).not.toContain("late");
  });

  it("is appended, singular, for exactly one late job", () => {
    const line = buildBaobaLine(facts({ overdueCount: 1 }));
    expect(line).toContain("1 job already late.");
  });

  it("is appended, plural, for more than one late job", () => {
    const line = buildBaobaLine(facts({ overdueCount: 3 }));
    expect(line).toContain("3 jobs already late.");
  });

  it("is appended to the no-Pokémon line too", () => {
    const line = buildBaobaLine(facts({ pokemon: null, overdueCount: 2 }));
    expect(line).toContain("2 jobs already late.");
  });
});
