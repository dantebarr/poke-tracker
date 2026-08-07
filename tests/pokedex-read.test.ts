import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, signIn } from "./helpers/supabase";

/**
 * The Pokédex screen's read side (#13), against the real schema: all 151 in
 * order, locked entries stripped of their name, row-level security scoping
 * the unlock check to the caller's own. `pokedex_entry` writes themselves —
 * settlement and evolve_instance unlocking an entry — are already covered by
 * evolution.test.ts; this suite only proves `listPokedex` reads what is
 * stored, correctly, and never derives an unlock from anything else.
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
const { listPokedex } = await import("@/lib/pokemon/pokedex");
const { currentActivePokemon } = await import("@/lib/pokemon/session");

const ALLOW_LISTED = "misty@cerulean.example";
const RIVAL = "brock@pewter.example";

const BULBASAUR_ID = 1;
const CHARMANDER_ID = 4;
const MEW_ID = 151;
const ORIGINAL_151_COUNT = 151;

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

async function unlockEntry(trainerId: string, speciesId: number) {
  const { error } = await adminClient()
    .from("pokedex_entry")
    .insert({ trainer_id: trainerId, species_id: speciesId, unlocked_on: "2026-08-01" });
  if (error) throw new Error(`Forcing pokedex entry failed: ${JSON.stringify(error)}`);
}

async function forceInstanceSpecies(instanceId: string, speciesId: number) {
  const { error } = await adminClient().from("instance").update({ species_id: speciesId }).eq("id", instanceId);
  if (error) throw new Error(`Forcing instance species failed: ${JSON.stringify(error)}`);
}

describe("reading the pokedex", () => {
  it("shows all 151, ordered by species number, locked when nothing is unlocked", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    const entries = await listPokedex(clientForJar(jar), trainer.id);

    expect(entries).toHaveLength(ORIGINAL_151_COUNT);
    expect(entries.map((entry) => entry.speciesId)).toEqual(
      Array.from({ length: ORIGINAL_151_COUNT }, (_, index) => index + 1),
    );
    expect(entries.every((entry) => !entry.unlocked && entry.name === null)).toBe(true);
  });

  it("shows the species name and sprite once its entry is unlocked", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await unlockEntry(trainer.id, BULBASAUR_ID);

    const entries = await listPokedex(clientForJar(jar), trainer.id);

    const bulbasaur = entries.find((entry) => entry.speciesId === BULBASAUR_ID);
    expect(bulbasaur).toMatchObject({ unlocked: true, name: "bulbasaur" });
    expect(bulbasaur?.spritePath).toBeTruthy();

    const mew = entries.find((entry) => entry.speciesId === MEW_ID);
    expect(mew).toMatchObject({ unlocked: false, name: null });
  });

  it("reflects the stored entry rather than deriving one from the active instance's current species", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const pokemon = (await currentActivePokemon())!;
    // The instance genuinely is Charmander now, but no pokedex_entry was
    // ever written for it — CONTEXT.md's "Pokédex entry" is explicit that
    // being the species isn't enough on its own.
    await forceInstanceSpecies(pokemon.instanceId, CHARMANDER_ID);

    const entries = await listPokedex(clientForJar(jar), trainer.id);

    expect(entries.find((entry) => entry.speciesId === CHARMANDER_ID)).toMatchObject({
      unlocked: false,
      name: null,
    });
  });

  it("hides one trainer's unlocks from another", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    await unlockEntry(trainer.id, BULBASAUR_ID);

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(RIVAL);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);

    const rivalEntries = await listPokedex(clientForJar(rivalJar), trainer.id);
    expect(rivalEntries.find((entry) => entry.speciesId === BULBASAUR_ID)).toMatchObject({
      unlocked: false,
      name: null,
    });
  });
});
