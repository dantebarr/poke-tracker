import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way every other suite touching a server action does — see
 * trainer-provisioning.test.ts for the fuller rationale on the
 * `next/headers` mock.
 *
 * Warden Baoba's first-day briefing (#27) is recorded against the trainer
 * rather than the browser, precisely so it survives a second device — the
 * scenario the "does not reappear" test below exercises by signing the same
 * account in through a fresh cookie jar, the same stand-in for "a different
 * device" trainer-time-zone.test.ts's sibling suites use.
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

const { ensureTrainer, markIntroSeenAction } = await import("@/app/actions/trainer");

const ALLOW_LISTED = "misty@cerulean.example";

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

async function signedInTrainer(email: string, targetJar: CookieJar) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(targetJar, account);
  const previous = jarRef.current;
  jarRef.current = targetJar;
  try {
    return { account, trainer: await ensureTrainer() };
  } finally {
    jarRef.current = previous;
  }
}

async function introSeenAt(trainerId: string): Promise<string | null> {
  const { data, error } = await adminClient()
    .from("trainer")
    .select("intro_seen_at")
    .eq("id", trainerId)
    .single<{ intro_seen_at: string | null }>();
  if (error) throw new Error(`Reading trainer failed: ${JSON.stringify(error)}`);
  return data.intro_seen_at;
}

describe("a freshly-provisioned trainer", () => {
  it("has not seen the briefing yet", async () => {
    const { trainer } = await signedInTrainer(ALLOW_LISTED, jar);
    expect(trainer.introSeenAt).toBeNull();
  });
});

describe("dismissing the briefing", () => {
  it("records the moment it was seen", async () => {
    const { trainer } = await signedInTrainer(ALLOW_LISTED, jar);

    const before = new Date();
    const updated = await markIntroSeenAction();

    expect(updated.introSeenAt).not.toBeNull();
    expect(updated.introSeenAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    expect(await introSeenAt(trainer.id)).not.toBeNull();
  });

  it("does not reappear on a second sign-in from a fresh cookie jar — the stand-in for a different device", async () => {
    const { account, trainer } = await signedInTrainer(ALLOW_LISTED, jar);
    await markIntroSeenAction();

    const otherDeviceJar = createCookieJar();
    await signIn(otherDeviceJar, account);
    jarRef.current = otherDeviceJar;
    const returning = await ensureTrainer();
    jarRef.current = jar;

    expect(returning.id).toBe(trainer.id);
    expect(returning.introSeenAt).not.toBeNull();
  });
});

describe("column-level grants on trainer", () => {
  it("let a trainer's own JWT update intro_seen_at directly, the column it was granted", async () => {
    const { trainer } = await signedInTrainer(ALLOW_LISTED, jar);
    const now = new Date().toISOString();

    const { data, error } = await clientForJar(jar)
      .from("trainer")
      .update({ intro_seen_at: now })
      .eq("id", trainer.id)
      .select("intro_seen_at")
      .single<{ intro_seen_at: string }>();

    expect(error).toBeNull();
    expect(new Date(data!.intro_seen_at).getTime()).toBe(new Date(now).getTime());
  });

  it("refuses a trainer's own JWT updating email, a column this migration did not grant", async () => {
    const { trainer } = await signedInTrainer(ALLOW_LISTED, jar);

    // `email` carries no column-level grant at all (only daily_target,
    // time_zone and now intro_seen_at do), so this is refused before
    // row-level security is even consulted — see
    // tests/label-settings.test.ts and tests/species-seed.test.ts for the
    // same "column-level grant or none" pattern on other tables.
    const { error } = await clientForJar(jar)
      .from("trainer")
      .update({ email: "hijacked@example.com" })
      .eq("id", trainer.id);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});
