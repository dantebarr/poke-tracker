import { describe, expect, it } from "vitest";

import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { ActivePokemon } from "@/lib/pokemon/pokemon";

/**
 * Pure logic, no database — these run without the local Supabase stack even
 * though the global setup starts it for the suite as a whole. See
 * tests/settlement-reducer.test.ts for the same note and its shape.
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

describe("a Ranger with no Active Pokémon", () => {
  it("gets a scene without a Pokémon in it", () => {
    expect(buildEncounterView(null, 3)).toEqual({ hasPokemon: false });
  });
});

describe("the mood tier", () => {
  it.each([
    [-1, 3, "sad", "Gone", true], // -1/3 < 0
    [0, 3, "worried", "Restless", true], // 0/3 = 0, in [0, 1)
    [2, 3, "worried", "Restless", true], // 2/3 ≈ 0.67, in [0, 1)
    [3, 3, "neutral", "Settled", false], // 3/3 = 1, in [1, 2)
    [6, 3, "happy", "Content", false], // 6/3 = 2, in [2, 4)
    [11, 3, "happy", "Content", false], // 11/3 ≈ 3.67, in [2, 4)
    [12, 3, "beaming", "Thriving", false], // 12/3 = 4, in [4, ∞)
  ] as const)("happiness %i against target %i is %s (warn: %s)", (happiness, dailyTarget, tier, label, warn) => {
    const view = buildEncounterView(pokemon({ happiness }), dailyTarget);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.mood).toEqual({ tier, label, warn });
  });

  it("never carries a numeric happiness value anywhere in the view", () => {
    const view = buildEncounterView(pokemon({ happiness: 42 }), 3);
    expect(JSON.stringify(view)).not.toContain("42");
  });
});

describe("the bond bar", () => {
  it("reads level against requirement below the requirement", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 5, bondRequirement: 7 }), 3);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.bond).toEqual({ level: 5, requirement: 7, percent: 71 });
  });

  it("stays full past the requirement while the number keeps rising", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 9, bondRequirement: 7 }), 3);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.bond).toEqual({ level: 9, requirement: 7, percent: 100 });
  });

  it("reads exactly full right at the requirement", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 7, bondRequirement: 7 }), 3);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.bond.percent).toBe(100);
  });
});

describe("the rest of the view", () => {
  it("carries nickname, species, zone and the animated sprite", () => {
    const view = buildEncounterView(
      pokemon({
        nickname: "Sickle",
        species: { id: 123, name: "scyther", spritePath: "/species/123.png", zone: "forest", animatedSpritePath: "/species/animated/123.gif" },
      }),
      3,
    );
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.nickname).toBe("Sickle");
    expect(view.speciesName).toBe("Scyther");
    expect(view.speciesNumber).toBe(123);
    expect(view.zone).toBe("forest");
    expect(view.spritePath).toBe("/species/animated/123.gif");
  });

  it("falls back to the species name when there is no nickname yet", () => {
    const view = buildEncounterView(pokemon({ nickname: null }), 3);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.nickname).toBe("Scyther");
  });
});
