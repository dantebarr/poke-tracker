import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createCookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, signIn } from "./helpers/supabase";

/**
 * The species table is seeded by a migration generated once from PokéAPI
 * (scripts/generate-species.mts), not written by hand. These tests check the
 * seed migration replayed into a fresh local Supabase actually produced the
 * table the acceptance criteria describe — same "no mocks, real migrations"
 * approach the rest of the suite uses.
 */
const ORIGINAL_151_COUNT = 151;
const CHARMANDER_ID = 4;
const CHARMELEON_ID = 5;
const CHARIZARD_ID = 6;
const EEVEE_ID = 133;

describe("the seeded species table", () => {
  const created: string[] = [];

  afterEach(async () => {
    while (created.length > 0) {
      await deleteAccount(created.pop() as string);
    }
  });

  it("has exactly the original 151", async () => {
    const { count, error } = await adminClient()
      .from("species")
      .select("id", { count: "exact", head: true });

    if (error) throw new Error(`Counting species failed: ${JSON.stringify(error)}`);
    expect(count).toBe(ORIGINAL_151_COUNT);
  });

  it("gives Charmander's line a cumulative bond requirement of 4, 9, 16", async () => {
    const { data, error } = await adminClient()
      .from("species")
      .select("id, name, evolves_from_id, bond_requirement")
      .in("id", [CHARMANDER_ID, CHARMELEON_ID, CHARIZARD_ID])
      .order("id");

    if (error) throw new Error(`Reading Charmander's line failed: ${JSON.stringify(error)}`);
    expect(data).toEqual([
      { id: CHARMANDER_ID, name: "charmander", evolves_from_id: null, bond_requirement: 4 },
      { id: CHARMELEON_ID, name: "charmeleon", evolves_from_id: CHARMANDER_ID, bond_requirement: 9 },
      { id: CHARIZARD_ID, name: "charizard", evolves_from_id: CHARMELEON_ID, bond_requirement: 16 },
    ]);
  });

  it("makes Eevee's three Gen 1 evolutions reachable as children of Eevee, with no join table", async () => {
    const { data, error } = await adminClient()
      .from("species")
      .select("name")
      .eq("evolves_from_id", EEVEE_ID)
      .order("name");

    if (error) throw new Error(`Reading Eevee's children failed: ${JSON.stringify(error)}`);
    expect(data).toEqual([{ name: "flareon" }, { name: "jolteon" }, { name: "vaporeon" }]);
  });

  it("is readable by a signed-in trainer", async () => {
    process.env.POKE_TRACKER_ALLOWED_EMAILS = "ash@pallet.example";
    const jar = createCookieJar();
    const account = await createAccount("ash@pallet.example");
    created.push(account.id);
    await signIn(jar, account);

    const { data, error } = await clientForJar(jar).from("species").select("id").eq("id", CHARMANDER_ID);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: CHARMANDER_ID }]);
  });

  it("gives a signed-in trainer no write access", async () => {
    process.env.POKE_TRACKER_ALLOWED_EMAILS = "misty@cerulean.example";
    const jar = createCookieJar();
    const account = await createAccount("misty@cerulean.example");
    created.push(account.id);
    await signIn(jar, account);

    const { error } = await clientForJar(jar)
      .from("species")
      .update({ bond_requirement: 999 })
      .eq("id", CHARMANDER_ID);

    // No grant for update at all: refused before row-level security is even
    // consulted, the same "column-level grant or none" default every column
    // added after the trainer table gets.
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege
  });
});

/**
 * "The application makes no PokéAPI calls at runtime" is an architectural
 * rule, not a runtime behaviour — checked structurally, the same way the data
 * access boundary is. scripts/generate-species.mts is the one file allowed to
 * mention it; everything under src/ must not.
 */
describe("the running app", () => {
  it("never talks to PokéAPI", async () => {
    const src = path.resolve(import.meta.dirname, "..", "src");
    const offenders: string[] = [];

    async function walk(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        if (!/\.(tsx?|mts)$/.test(entry.name)) continue;

        const source = await readFile(full, "utf8");
        if (/pokeapi/i.test(source)) offenders.push(path.relative(src, full));
      }
    }

    await walk(src);
    expect(offenders).toEqual([]);
  });
});
