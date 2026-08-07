import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, insertTask, labelsFor, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the same
 * way settlement.test.ts does — see trainer-provisioning.test.ts for the
 * fuller rationale on the `next/headers` mock.
 *
 * Most scenarios arrange an instance's species and bond level directly
 * through `adminClient`, bypassing row-level security the way
 * pool-provisioning.test.ts's "with no active Pokémon" describe block does:
 * reaching bond 14 through real settlement runs is settlement's own suite's
 * job, not this one's, except for the one describe block below that exists
 * specifically to prove settlement itself can trigger an unlock.
 */
const jarRef = vi.hoisted(() => ({ current: null as CookieJar | null }));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!jarRef.current) {
      throw new Error("No request cookies in scope");
    }
    return jarRef.current;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { ensureTrainer } = await import("@/app/actions/trainer");
const { evolvePokemon } = await import("@/app/actions/pokemon");
const { settleOnEntry } = await import("@/app/actions/settlement");
const { currentActivePokemon, currentEvolutionOptions } = await import("@/lib/pokemon/session");
const { dayKeyInTimeZone } = await import("@/lib/settlement/timezone");
const { NotSignedInError } = await import("@/lib/trainer/errors");

const ALLOW_LISTED = "ash@pallet.example";
const RIVAL = "gary@oak.example";
const TIME_ZONE = "UTC";

const CHARMANDER_ID = 4;
const CHARMELEON_ID = 5;
const CHARIZARD_ID = 6;
const EEVEE_ID = 133;

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = `${ALLOW_LISTED},${RIVAL}`;
});

afterEach(async () => {
  for (const id of created) {
    await deleteAccount(id);
  }
  jarRef.current = null;
});

async function signedInTrainer(email: string) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(jar, account);
  return ensureTrainer();
}

function dayKey(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return dayKeyInTimeZone(date, TIME_ZONE);
}

function noonOf(day: string): string {
  return `${day}T12:00:00.000Z`;
}

async function setLastSettledDay(trainerId: string, day: string) {
  const { error } = await adminClient().from("trainer").update({ last_settled_day: day }).eq("id", trainerId);
  if (error) throw new Error(`Forcing last_settled_day failed: ${JSON.stringify(error)}`);
}

/** Settles `count` consecutive days, each with one qualifying (large) task, oldest first. */
async function settleGoodDays(trainerId: string, labelId: string, count: number) {
  await setLastSettledDay(trainerId, dayKey(count + 1));
  for (let daysAgo = count; daysAgo >= 1; daysAgo--) {
    await insertTask({ trainerId, labelId, size: "large", status: "done", completedAt: noonOf(dayKey(daysAgo)) });
  }
  await settleOnEntry(TIME_ZONE);
}

/** Arranges an instance directly into a given species and bond level — the starting point evolution tests need, not itself under test. */
async function forceInstance(instanceId: string, fields: { speciesId?: number; bondLevel?: number }) {
  const patch: Record<string, number> = {};
  if (fields.speciesId !== undefined) patch.species_id = fields.speciesId;
  if (fields.bondLevel !== undefined) patch.bond_level = fields.bondLevel;
  const { error } = await adminClient().from("instance").update(patch).eq("id", instanceId);
  if (error) throw new Error(`Forcing instance state failed: ${JSON.stringify(error)}`);
}

async function bondLevelOf(instanceId: string): Promise<number> {
  const { data, error } = await adminClient()
    .from("instance")
    .select("bond_level")
    .eq("id", instanceId)
    .single<{ bond_level: number }>();
  if (error) throw new Error(`Reading bond level failed: ${JSON.stringify(error)}`);
  return data.bond_level;
}

async function pokedexEntries(trainerId: string) {
  const { data, error } = await adminClient()
    .from("pokedex_entry")
    .select("species_id, unlocked_on")
    .eq("trainer_id", trainerId)
    .order("species_id")
    .returns<{ species_id: number; unlocked_on: string }[]>();
  if (error) throw new Error(`Reading pokedex entries failed: ${JSON.stringify(error)}`);
  return data;
}

async function childrenOf(speciesId: number): Promise<number[]> {
  const { data, error } = await adminClient()
    .from("species")
    .select("id")
    .eq("evolves_from_id", speciesId)
    .order("id")
    .returns<{ id: number }[]>();
  if (error) throw new Error(`Reading children failed: ${JSON.stringify(error)}`);
  return data.map((row) => row.id);
}

async function bondRequirementOf(speciesId: number): Promise<number> {
  const { data, error } = await adminClient()
    .from("species")
    .select("bond_requirement")
    .eq("id", speciesId)
    .single<{ bond_requirement: number }>();
  if (error) throw new Error(`Reading bond requirement failed: ${JSON.stringify(error)}`);
  return data.bond_requirement;
}

function evolveFormData(fields: { instanceId: string; expectedSpeciesId: number; targetSpeciesId: number }): FormData {
  const formData = new FormData();
  formData.set("instanceId", fields.instanceId);
  formData.set("expectedSpeciesId", String(fields.expectedSpeciesId));
  formData.set("targetSpeciesId", String(fields.targetSpeciesId));
  return formData;
}

describe("evolving", () => {
  it("evolves into the requested species, keeping bond level unchanged", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );

    const after = (await currentActivePokemon())!;
    expect(after.species.id).toBe(CHARMELEON_ID);
    expect(after.bondLevel).toBe(4);
  });

  it("refuses evolving when the bond requirement isn't met", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 3 });

    await expect(
      evolvePokemon(
        evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
      ),
    ).rejects.toThrow();

    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });

  it("refuses evolving into a species that is not a child of the current species", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    await expect(
      evolvePokemon(
        evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARIZARD_ID }),
      ),
    ).rejects.toThrow();

    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });

  it("refuses a stale expected species as a silent no-op, so a double-click can't chain a second evolution", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 14 });

    // The first click evolves it for real.
    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );

    // The second click still believes the instance is Charmander — exactly
    // what a double-submitted form would send.
    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARIZARD_ID }),
    );

    expect((await currentActivePokemon())?.species.id).toBe(CHARMELEON_ID);
  });

  it("refuses evolving into a species another of the trainer's instances already is", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    // Not reachable through the app under the fixed-pool invariant (only one
    // Charmander-line instance ever exists) — simulated directly to prove
    // the guard itself, the same way pool-provisioning.test.ts simulates
    // states the app can't yet produce.
    const { data: otherInstance, error } = await adminClient()
      .from("instance")
      .select("id")
      .eq("trainer_id", trainer.id)
      .neq("id", pokemon.instanceId)
      .limit(1)
      .single<{ id: string }>();
    if (error) throw new Error(JSON.stringify(error));
    await forceInstance(otherInstance.id, { speciesId: CHARMELEON_ID });

    await expect(
      evolvePokemon(
        evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
      ),
    ).rejects.toThrow();

    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });

  it("refuses evolving into a species already in the trainer's Pokédex", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    // Not reachable through the app (an entry only exists once some instance
    // truly earned it) — simulated directly, same rationale as above.
    const { error } = await adminClient()
      .from("pokedex_entry")
      .insert({ trainer_id: trainer.id, species_id: CHARMELEON_ID, unlocked_on: dayKey(0) });
    if (error) throw new Error(JSON.stringify(error));

    await expect(
      evolvePokemon(
        evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
      ),
    ).rejects.toThrow();

    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });

  it("refuses evolving another trainer's instance", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const ashPokemon = (await currentActivePokemon())!;
    await forceInstance(ashPokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    const garyJar = createCookieJar();
    const garyAccount = await createAccount(RIVAL);
    created.push(garyAccount.id);
    await signIn(garyJar, garyAccount);
    jarRef.current = garyJar;
    await ensureTrainer();

    await expect(
      evolvePokemon(
        evolveFormData({ instanceId: ashPokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
      ),
    ).rejects.toThrow();

    jarRef.current = jar;
    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });

  it("refuses without a session", async () => {
    await expect(
      evolvePokemon(
        evolveFormData({
          instanceId: "00000000-0000-0000-0000-000000000000",
          expectedSpeciesId: CHARMANDER_ID,
          targetSpeciesId: CHARMELEON_ID,
        }),
      ),
    ).rejects.toBeInstanceOf(NotSignedInError);
  });
});

describe("Pokédex unlocks from evolving", () => {
  it("unlocks the target's entry immediately when banked bond already meets its requirement", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 14 });

    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );

    expect(await pokedexEntries(trainer.id)).toEqual([{ species_id: CHARMELEON_ID, unlocked_on: dayKey(0) }]);
  });

  it("does not unlock an entry when the target's requirement is not yet met", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 5 });

    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );

    expect(await pokedexEntries(trainer.id)).toEqual([]);
  });

  it("a bond-14 Charmander evolved twice ends as a Charizard with a Charmeleon entry and no Charizard entry", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 14 });

    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );
    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMELEON_ID, targetSpeciesId: CHARIZARD_ID }),
    );

    const after = (await currentActivePokemon())!;
    expect(after.species.id).toBe(CHARIZARD_ID);
    expect(after.bondLevel).toBe(14);
    expect(await pokedexEntries(trainer.id)).toEqual([{ species_id: CHARMELEON_ID, unlocked_on: dayKey(0) }]);
  });
});

describe("Pokédex unlocks from settlement", () => {
  it("unlocks a species' own entry the moment bond rising while still that species meets its requirement", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID });
    const requirement = await bondRequirementOf(CHARMANDER_ID);

    await settleGoodDays(trainer.id, label.id, requirement);

    expect(await bondLevelOf(pokemon.instanceId)).toBe(requirement);
    expect(await pokedexEntries(trainer.id)).toEqual([{ species_id: CHARMANDER_ID, unlocked_on: dayKey(1) }]);
  });

  it("does not unlock early, one bond level short of the requirement", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [label] = await labelsFor(trainer.id);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID });
    const requirement = await bondRequirementOf(CHARMANDER_ID);

    await settleGoodDays(trainer.id, label.id, requirement - 1);

    expect(await pokedexEntries(trainer.id)).toEqual([]);
  });
});

describe("evolution options (the picker)", () => {
  it("offers no options for a species with no further evolutions", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARIZARD_ID, bondLevel: 20 });

    expect(await currentEvolutionOptions(trainer.id, CHARIZARD_ID)).toEqual([]);
  });

  it("offers a branching line's children, hiding ones already owned or already in the Pokédex", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const eeveeChildren = await childrenOf(EEVEE_ID);
    expect(eeveeChildren.length).toBeGreaterThanOrEqual(3);
    const [firstEeveelution, secondEeveelution, thirdEeveelution] = eeveeChildren;
    const eeveeRequirement = await bondRequirementOf(EEVEE_ID);

    const { data: eevees, error } = await adminClient()
      .from("instance")
      .select("id")
      .eq("trainer_id", trainer.id)
      .eq("species_id", EEVEE_ID)
      .returns<{ id: string }[]>();
    if (error) throw new Error(JSON.stringify(error));
    expect(eevees).toHaveLength(3);

    // All three branches are open before anyone has evolved.
    const initialOptions = await currentEvolutionOptions(trainer.id, EEVEE_ID);
    expect(initialOptions.map((option) => option.speciesId).sort((a, b) => a - b)).toEqual(
      [...eeveeChildren].sort((a, b) => a - b),
    );

    await forceInstance(eevees[0].id, { bondLevel: eeveeRequirement });
    await evolvePokemon(
      evolveFormData({ instanceId: eevees[0].id, expectedSpeciesId: EEVEE_ID, targetSpeciesId: firstEeveelution }),
    );

    const optionsAfterOne = await currentEvolutionOptions(trainer.id, EEVEE_ID);
    expect(optionsAfterOne.map((option) => option.speciesId)).not.toContain(firstEeveelution);
    expect(optionsAfterOne).toHaveLength(2);

    await forceInstance(eevees[1].id, { bondLevel: eeveeRequirement });
    await evolvePokemon(
      evolveFormData({ instanceId: eevees[1].id, expectedSpeciesId: EEVEE_ID, targetSpeciesId: secondEeveelution }),
    );

    const optionsAfterTwo = await currentEvolutionOptions(trainer.id, EEVEE_ID);
    expect(optionsAfterTwo).toEqual([
      expect.objectContaining({ speciesId: thirdEeveelution }),
    ]);
  });
});

describe("row-level security", () => {
  it("refuses a trainer's own JWT inserting a Pokédex entry directly", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    const { error } = await clientForJar(jar)
      .from("pokedex_entry")
      .insert({ trainer_id: trainer.id, species_id: CHARMANDER_ID, unlocked_on: dayKey(0) });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("hides one trainer's Pokédex entries from another", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 14 });
    await evolvePokemon(
      evolveFormData({ instanceId: pokemon.instanceId, expectedSpeciesId: CHARMANDER_ID, targetSpeciesId: CHARMELEON_ID }),
    );
    expect(await pokedexEntries(trainer.id)).not.toEqual([]);

    const garyJar = createCookieJar();
    const garyAccount = await createAccount(RIVAL);
    created.push(garyAccount.id);
    await signIn(garyJar, garyAccount);

    const { data } = await clientForJar(garyJar).from("pokedex_entry").select("species_id").eq("trainer_id", trainer.id);
    expect(data).toEqual([]);
  });

  it("still refuses a fabricated target species when evolve_instance is called directly, not only through the picker", async () => {
    await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    await forceInstance(pokemon.instanceId, { speciesId: CHARMANDER_ID, bondLevel: 4 });

    const { error } = await clientForJar(jar).rpc("evolve_instance", {
      p_instance_id: pokemon.instanceId,
      p_expected_species_id: CHARMANDER_ID,
      p_target_species_id: CHARIZARD_ID,
    });

    expect(error).not.toBeNull();
    expect((await currentActivePokemon())?.species.id).toBe(CHARMANDER_ID);
  });
});
