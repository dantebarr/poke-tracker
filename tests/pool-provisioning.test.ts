import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, signIn } from "./helpers/supabase";

/**
 * Pool provisioning runs against a real local Supabase built from the real
 * migrations, the same way trainer provisioning does — see
 * trainer-provisioning.test.ts for the fuller rationale on the `next/headers`
 * mock.
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

const { ensureTrainer } = await import("@/app/actions/trainer");
const { setNickname } = await import("@/app/actions/pokemon");
const { currentActivePokemon } = await import("@/lib/pokemon/session");
const { NotSignedInError } = await import("@/lib/trainer/errors");

const ASH = "ash@pallet.example";
const GARY = "gary@oak.example";
const POOL_SIZE = 81;
const EEVEE_ID = 133;
const BULBASAUR_ID = 1;

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = ASH;
});

afterEach(async () => {
  for (const id of created) {
    await deleteAccount(id);
  }
  jarRef.current = null;
});

async function account(email: string) {
  const testAccount = await createAccount(email);
  created.push(testAccount.id);
  return testAccount;
}

async function signedIn(email: string, targetJar: CookieJar) {
  const testAccount = await account(email);
  await signIn(targetJar, testAccount);
  return testAccount;
}

async function countInstances(trainerId: string): Promise<number> {
  const { count, error } = await adminClient()
    .from("instance")
    .select("id", { count: "exact", head: true })
    .eq("trainer_id", trainerId);
  if (error) throw new Error(`Counting instances failed: ${JSON.stringify(error)}`);
  return count ?? 0;
}

describe("signing up", () => {
  it("creates exactly 81 instances, one per line plus Eevee's three branches", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();

    expect(await countInstances(ash.id)).toBe(POOL_SIZE);

    const { data: eevees, error } = await adminClient()
      .from("instance")
      .select("id")
      .eq("trainer_id", ash.id)
      .eq("species_id", EEVEE_ID);
    if (error) throw new Error(JSON.stringify(error));
    expect(eevees).toHaveLength(3);
  });

  it("activates exactly one instance, at happiness zero and bond level zero", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();

    const pokemon = await currentActivePokemon();

    expect(pokemon).not.toBeNull();
    expect(pokemon?.happiness).toBe(0);
    expect(pokemon?.bondLevel).toBe(0);
    expect(pokemon?.species.id).toBe(BULBASAUR_ID);
    expect(pokemon?.distanceToBondRequirement).toBe(pokemon?.bondRequirement);
  });

  it("leaves the pool untouched on a second sign-in", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();
    const first = await adminClient()
      .from("instance")
      .select("id")
      .eq("trainer_id", ash.id)
      .order("pool_slot");

    jar.clear();
    await signIn(jar, ash);
    await ensureTrainer();

    expect(await countInstances(ash.id)).toBe(POOL_SIZE);
    const second = await adminClient().from("instance").select("id").eq("trainer_id", ash.id).order("pool_slot");
    expect(second.data).toEqual(first.data);
  });
});

describe("the pool, once created", () => {
  it("cannot be added to directly", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();

    const { error } = await clientForJar(jar)
      .from("instance")
      .insert({ trainer_id: ash.id, pool_slot: 5, species_id: BULBASAUR_ID });

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501"); // insufficient_privilege — no insert grant at all
    expect(await countInstances(ash.id)).toBe(POOL_SIZE);
  });

  it("refuses to let a trainer set their own active instance or happiness", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();
    const pokemon = (await currentActivePokemon())!;

    const { error } = await clientForJar(jar)
      .from("trainer")
      .update({ active_instance_id: pokemon.instanceId, happiness: 999 })
      .eq("id", ash.id);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("refuses to let a trainer raise an instance's bond level directly", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();
    const pokemon = (await currentActivePokemon())!;

    const { error } = await clientForJar(jar)
      .from("instance")
      .update({ bond_level: 99 })
      .eq("id", pokemon.instanceId);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });

  it("hides one trainer's instances from another", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();

    process.env.POKE_TRACKER_ALLOWED_EMAILS = `${ASH},${GARY}`;
    const otherJar = createCookieJar();
    await signedIn(GARY, otherJar);

    const { data } = await clientForJar(otherJar).from("instance").select("id").eq("trainer_id", ash.id);

    expect(data).toEqual([]);
  });
});

describe("nicknaming the active Pokémon", () => {
  it("sets a nickname", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();
    const pokemon = (await currentActivePokemon())!;

    const formData = new FormData();
    formData.set("nickname", "Sparky");
    await setNickname(pokemon.instanceId, formData);

    expect((await currentActivePokemon())?.nickname).toBe("Sparky");
  });

  it("changes a nickname already set", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();
    const pokemon = (await currentActivePokemon())!;

    const first = new FormData();
    first.set("nickname", "Sparky");
    await setNickname(pokemon.instanceId, first);

    const second = new FormData();
    second.set("nickname", "Bolt");
    await setNickname(pokemon.instanceId, second);

    expect((await currentActivePokemon())?.nickname).toBe("Bolt");
  });

  it("clears a nickname back to null when submitted blank", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();
    const pokemon = (await currentActivePokemon())!;

    const setIt = new FormData();
    setIt.set("nickname", "Sparky");
    await setNickname(pokemon.instanceId, setIt);

    const clearIt = new FormData();
    clearIt.set("nickname", "   ");
    await setNickname(pokemon.instanceId, clearIt);

    expect((await currentActivePokemon())?.nickname).toBeNull();
  });

  it("refuses to nickname another trainer's instance", async () => {
    await signedIn(ASH, jar);
    await ensureTrainer();
    const ashPokemon = (await currentActivePokemon())!;

    process.env.POKE_TRACKER_ALLOWED_EMAILS = `${ASH},${GARY}`;
    const otherJar = createCookieJar();
    await signedIn(GARY, otherJar);
    jarRef.current = otherJar;
    await ensureTrainer();

    const formData = new FormData();
    formData.set("nickname", "Stolen");
    await expect(setNickname(ashPokemon.instanceId, formData)).rejects.toThrow();

    jarRef.current = jar;
    expect((await currentActivePokemon())?.nickname).toBeNull();
  });

  it("refuses to write without a session", async () => {
    // jar is fresh from beforeEach — nobody has signed in yet.
    const formData = new FormData();
    formData.set("nickname", "Nobody");

    await expect(
      setNickname("00000000-0000-0000-0000-000000000000", formData),
    ).rejects.toBeInstanceOf(NotSignedInError);
  });
});

describe("with no active Pokémon", () => {
  it("reads as a clear empty state", async () => {
    const ash = await signedIn(ASH, jar);
    await ensureTrainer();

    // Not reachable through the app yet — a Pokémon only leaves once
    // settlement (#10) exists — so this simulates that state directly.
    const { error } = await adminClient()
      .from("trainer")
      .update({ active_instance_id: null })
      .eq("id", ash.id);
    if (error) throw new Error(JSON.stringify(error));

    expect(await currentActivePokemon()).toBeNull();
  });
});
