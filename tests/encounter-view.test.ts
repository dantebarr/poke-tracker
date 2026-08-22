import { describe, expect, it } from "vitest";

import { buildEncounterView } from "@/lib/pokemon/encounter-view";
import type { EvolutionOption } from "@/lib/pokemon/evolution";
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
    expect(buildEncounterView(null)).toEqual({ hasPokemon: false, fieldMenu: null });
  });
});

describe("happiness", () => {
  // The guard on the whole point of this view model: happiness is a
  // background number with no surface. The bands that pick Warden Baoba's
  // line live in baoba/dialogue.ts and are tested there.
  it("never carries a numeric happiness value anywhere in the view", () => {
    const view = buildEncounterView(pokemon({ happiness: 42 }));
    expect(JSON.stringify(view)).not.toContain("42");
  });
});

describe("the bond bar", () => {
  it("reads level against requirement below the requirement", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 5, bondRequirement: 7 }));
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.bond).toEqual({ level: 5, percent: 71 });
  });

  it("stays full past the requirement while the number keeps rising", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 9, bondRequirement: 7 }));
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.bond).toEqual({ level: 9, percent: 100 });
  });

  it("reads exactly full right at the requirement", () => {
    const view = buildEncounterView(pokemon({ bondLevel: 7, bondRequirement: 7 }));
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
    );
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.nickname).toBe("Sickle");
    expect(view.speciesName).toBe("Scyther");
    expect(view.speciesNumber).toBe(123);
    expect(view.zone).toBe("forest");
    expect(view.spritePath).toBe("/species/animated/123.gif");
  });

  it("falls back to the species name when there is no nickname yet", () => {
    const view = buildEncounterView(pokemon({ nickname: null }));
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.nickname).toBe("Scyther");
  });
});

describe("the naming prompt (#24)", () => {
  it("is offered when the Instance has no Nickname", () => {
    const view = buildEncounterView(pokemon({ nickname: null }));
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("naming");
  });

  it("is never offered to a returning Instance that already has a Nickname", () => {
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }));
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBeNull();
  });
});

const EVOLUTION_OPTIONS: EvolutionOption[] = [
  { speciesId: 134, name: "vaporeon", spritePath: "/species/134.png" },
  { speciesId: 135, name: "jolteon", spritePath: "/species/135.png" },
  { speciesId: 136, name: "flareon", spritePath: "/species/136.png" },
];

describe("the evolve prompt (#25)", () => {
  it("is offered to a named Instance with somewhere to evolve to", () => {
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }), EVOLUTION_OPTIONS);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("evolve");
  });

  it("is never offered when there are no evolution options", () => {
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }), []);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBeNull();
  });

  it("is offered for a single-target line exactly the same way as a branch", () => {
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }), [EVOLUTION_OPTIONS[0]]);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("evolve");
  });
});

describe("precedence between the naming and evolve prompts (#25)", () => {
  it("offers naming first when an un-named Instance also has somewhere to evolve to", () => {
    // Reachable when an Instance sat at its bond requirement, left un-named
    // and un-evolved, and has now returned to the pool still meeting it —
    // CONTEXT.md's "Naming" and "Evolving" entries both allow this.
    const view = buildEncounterView(pokemon({ nickname: null }), EVOLUTION_OPTIONS);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("naming");
  });

  it("falls through to evolve once the Instance is named", () => {
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }), EVOLUTION_OPTIONS);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("evolve");
  });
});

describe("the field menu (#5)", () => {
  it("is absent entirely for a Ranger with no Active Pokémon", () => {
    expect(buildEncounterView(null).fieldMenu).toBeNull();
  });

  it("offers moving on to a Ranger who has one", () => {
    const view = buildEncounterView(pokemon());
    expect(view.fieldMenu).toEqual(["move-on"]);
  });

  it("offers cancelling instead once a Parting is set", () => {
    const view = buildEncounterView(pokemon(), [], true);
    expect(view.fieldMenu).toEqual(["cancel-move"]);
  });

  it("is offered whatever prompt the scene is also showing", () => {
    const view = buildEncounterView(pokemon({ nickname: null }), EVOLUTION_OPTIONS);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("naming");
    expect(view.fieldMenu).toEqual(["move-on"]);
  });

  it("still offers naming to a Pokémon the Ranger has decided to part with (#27)", () => {
    const view = buildEncounterView(pokemon({ nickname: null }), [], true);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("naming");
    expect(view.fieldMenu).toEqual(["cancel-move"]);
  });

  it("still offers evolving to a Pokémon the Ranger has decided to part with (#28)", () => {
    // Nothing about the decision is a hidden penalty: a bond requirement
    // already met can still be spent before the instance returns to the pool
    // in that form.
    const view = buildEncounterView(pokemon({ nickname: "Sickle" }), EVOLUTION_OPTIONS, true);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.prompt).toBe("evolve");
    expect(view.parting).toBe(true);
  });
});

describe("the MOVING ON marker (#5)", () => {
  it("is off by default", () => {
    const view = buildEncounterView(pokemon());
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.parting).toBe(false);
  });

  it("is on while a Parting is set", () => {
    const view = buildEncounterView(pokemon(), [], true);
    if (!view.hasPokemon) throw new Error("expected a Pokémon");
    expect(view.parting).toBe(true);
  });

  it("still carries no happiness number, parting or not", () => {
    const view = buildEncounterView(pokemon({ happiness: 42 }), [], true);
    expect(JSON.stringify(view)).not.toContain("42");
  });
});
