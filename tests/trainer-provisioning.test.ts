import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import {
  clientForJar,
  countTrainers,
  createAccount,
  deleteAccount,
  signIn,
} from "./helpers/supabase";

/**
 * The server action runs against a real local Supabase built from the real
 * migrations. Nothing about the database is mocked — only `next/headers`, which
 * cannot exist outside a request, and which is replaced by a cookie jar holding
 * a genuine session.
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
const { currentTrainer } = await import("@/lib/trainer/session");
const { NotAllowListedError, NotSignedInError } = await import("@/lib/trainer/errors");
const { DatabaseError, unwrap } = await import("@/lib/supabase/errors");

const ALLOW_LISTED = "ash@pallet.example";
const NOT_ALLOW_LISTED = "giovanni@rocket.example";

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = ALLOW_LISTED;
});

afterEach(async () => {
  for (const id of created) {
    await deleteAccount(id);
  }
  jarRef.current = null;
});

async function account(email: string, metadata?: Record<string, unknown>) {
  const testAccount = await createAccount(email, metadata);
  created.push(testAccount.id);
  return testAccount;
}

async function signedIn(email: string, metadata?: Record<string, unknown>) {
  const testAccount = await account(email, metadata);
  await signIn(jar, testAccount);
  return testAccount;
}

describe("signing in with an allow-listed account", () => {
  it("creates exactly one trainer record and lands on a home route that knows who they are", async () => {
    const ash = await signedIn(ALLOW_LISTED, { full_name: "Ash" });

    const trainer = await ensureTrainer();

    expect(trainer.id).toBe(ash.id);
    expect(trainer.email).toBe(ALLOW_LISTED);
    expect(trainer.displayName).toBe("Ash");
    expect(await countTrainers()).toBe(1);

    // What the home route reads.
    expect(await currentTrainer()).toEqual(trainer);
  });

  it("starts them at the lowest daily target and neutral happiness", async () => {
    await signedIn(ALLOW_LISTED);

    const trainer = await ensureTrainer();

    expect(trainer.dailyTarget).toBe(1);
    expect(trainer.happiness).toBe(0);
    expect(trainer.lastSettledDay).toBeNull();
  });
});

describe("signing in a second time", () => {
  it("reuses the existing trainer record", async () => {
    const ash = await signedIn(ALLOW_LISTED);
    const first = await ensureTrainer();

    // A second sign-in: a fresh session for the same account.
    jar.clear();
    await signIn(jar, ash);
    const second = await ensureTrainer();

    expect(second.id).toBe(first.id);
    expect(await countTrainers()).toBe(1);
  });

  it("leaves what the trainer has since changed alone", async () => {
    const ash = await signedIn(ALLOW_LISTED);
    await ensureTrainer();

    unwrap(
      "Raising daily target",
      await clientForJar(jar)
        .from("trainer")
        .update({ daily_target: 5, happiness: 12 })
        .eq("id", ash.id)
        .select("daily_target")
        .single(),
    );

    const returning = await ensureTrainer();

    expect(returning.dailyTarget).toBe(5);
    expect(returning.happiness).toBe(12);
  });
});

describe("an account that is not on the allow-list", () => {
  it("is rejected and gets no trainer record", async () => {
    await signedIn(NOT_ALLOW_LISTED);

    await expect(ensureTrainer()).rejects.toBeInstanceOf(NotAllowListedError);
    expect(await countTrainers()).toBe(0);
    expect(await currentTrainer()).toBeNull();
  });

  it("is rejected even when the allow-list is empty", async () => {
    process.env.POKE_TRACKER_ALLOWED_EMAILS = "";
    await signedIn(ALLOW_LISTED);

    await expect(ensureTrainer()).rejects.toBeInstanceOf(NotAllowListedError);
    expect(await countTrainers()).toBe(0);
  });
});

describe("with no session at all", () => {
  it("refuses to provision anything", async () => {
    await expect(ensureTrainer()).rejects.toBeInstanceOf(NotSignedInError);
    expect(await countTrainers()).toBe(0);
  });
});

describe("the database, not the application, is the guarantee", () => {
  it("surfaces a violated check constraint as a real failure", async () => {
    const ash = await signedIn(ALLOW_LISTED);
    await ensureTrainer();

    // A daily target of zero would make every absent day neutral. Postgres
    // refuses it — no application-side validation involved.
    const result = await clientForJar(jar)
      .from("trainer")
      .update({ daily_target: 0 })
      .eq("id", ash.id)
      .select("daily_target")
      .single();

    expect(() => unwrap("Setting daily target", result)).toThrow(DatabaseError);

    try {
      unwrap("Setting daily target", result);
      expect.unreachable("the update should have been refused");
    } catch (thrown) {
      // 23514 is check_violation.
      expect((thrown as InstanceType<typeof DatabaseError>).code).toBe("23514");
    }
  });

  it("hides one trainer's record from another", async () => {
    const ash = await signedIn(ALLOW_LISTED);
    await ensureTrainer();

    const otherJar = createCookieJar();
    const rival = await account("gary@oak.example");
    await signIn(otherJar, rival);

    const { data } = await clientForJar(otherJar)
      .from("trainer")
      .select("id")
      .eq("id", ash.id);

    // Row-level security, not a `where` clause the app remembered to write.
    expect(data).toEqual([]);
  });
});
