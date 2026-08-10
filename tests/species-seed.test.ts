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
 * The zone and animated sprite path (#22), added by a second migration
 * (supabase/migrations/20260809110000_species_zone_and_animated_sprite.sql)
 * since the first seed migration had already shipped — see that file's own
 * comment and ADR-0006.
 */
describe("the seeded species table's zone and animated sprite", () => {
  const SIX_ZONES = ["forest", "marshland", "meadow", "peak", "plains", "savannah"];
  const created: string[] = [];

  afterEach(async () => {
    while (created.length > 0) {
      await deleteAccount(created.pop() as string);
    }
  });

  it("gives every one of the 151 a zone and an animated sprite path", async () => {
    const { count, error } = await adminClient()
      .from("species")
      .select("id", { count: "exact", head: true })
      .not("zone", "is", null)
      .not("animated_sprite_path", "is", null);

    if (error) throw new Error(`Counting species with a zone and sprite failed: ${JSON.stringify(error)}`);
    expect(count).toBe(ORIGINAL_151_COUNT);
  });

  it("only ever uses one of the six real Safari Zone areas", async () => {
    const { data, error } = await adminClient().from("species").select("zone");

    if (error) throw new Error(`Reading species zones failed: ${JSON.stringify(error)}`);
    const zonesInUse = new Set((data as { zone: string }[]).map((row) => row.zone));
    for (const zone of zonesInUse) {
      expect(SIX_ZONES).toContain(zone);
    }
  });

  it("puts Charmander's whole line in the same zone, since Zone belongs to the Species", async () => {
    const { data, error } = await adminClient()
      .from("species")
      .select("id, zone")
      .in("id", [CHARMANDER_ID, CHARMELEON_ID, CHARIZARD_ID])
      .order("id");

    if (error) throw new Error(`Reading Charmander's line's zone failed: ${JSON.stringify(error)}`);
    const zones = (data as { id: number; zone: string }[]).map((row) => row.zone);
    expect(new Set(zones).size).toBe(1);
  });

  it("points the animated sprite at a path distinct from the static one", async () => {
    const { data, error } = await adminClient()
      .from("species")
      .select("sprite_path, animated_sprite_path")
      .eq("id", CHARMANDER_ID)
      .single();

    if (error) throw new Error(`Reading Charmander's sprites failed: ${JSON.stringify(error)}`);
    expect(data.animated_sprite_path).not.toBe(data.sprite_path);
    expect(data.animated_sprite_path).toMatch(/^\/species\/animated\/.+\.gif$/);
  });

  it("gives a signed-in trainer no write access to the zone column either", async () => {
    process.env.POKE_TRACKER_ALLOWED_EMAILS = "brock@pewter.example";
    const jar = createCookieJar();
    const account = await createAccount("brock@pewter.example");
    created.push(account.id);
    await signIn(jar, account);

    const { error } = await clientForJar(jar)
      .from("species")
      .update({ zone: "plains" })
      .eq("id", CHARMANDER_ID);

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
