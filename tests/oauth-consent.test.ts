import { afterEach, beforeEach, describe, expect, inject, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import {
  clientForJar,
  createAccount,
  deleteAccount,
  signIn,
  type TestAccount,
} from "./helpers/supabase";

/**
 * The consent server actions, run against the local Supabase's real OAuth 2.1
 * server (ADR-0013): a client is registered dynamically, an authorization is
 * started the way Claude would start it, and the actions decide it under a
 * signed-in session.
 */
const jarRef = vi.hoisted(() => ({ current: null as CookieJar | null }));

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (!jarRef.current) throw new Error("No request cookies in scope");
    return jarRef.current;
  },
}));

const { approveAuthorizationAction, denyAuthorizationAction } = await import(
  "@/app/actions/oauth"
);
const { NotAllowListedError } = await import("@/lib/trainer/errors");
const { getURLFromRedirectError } = await import("next/dist/client/components/redirect");
const { isRedirectError } = await import("next/dist/client/components/redirect-error");

const { url: API } = inject("supabaseEnv");
const CLIENT_REDIRECT = "http://localhost:9999/cb";
const ALLOW_LISTED = "oak@pallet.example";
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
  for (const id of created) await deleteAccount(id);
  jarRef.current = null;
});

async function signedIn(email: string, options: { trainer: boolean }): Promise<TestAccount> {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(jar, account);
  if (options.trainer) {
    const { provisionTrainer } = await import("@/lib/trainer/trainer");
    await provisionTrainer(clientForJar(jar), { id: account.id, email, displayName: null });
  }
  return account;
}

/** Registers a client and starts an authorization, as Claude would. */
async function pendingAuthorization(): Promise<string> {
  const registered = await fetch(`${API}/auth/v1/oauth/clients/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Test Claude", redirect_uris: [CLIENT_REDIRECT] }),
  });
  const { client_id } = await registered.json();

  const authorize = new URL(`${API}/auth/v1/oauth/authorize`);
  authorize.search = new URLSearchParams({
    client_id,
    redirect_uri: CLIENT_REDIRECT,
    response_type: "code",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz",
  }).toString();
  const started = await fetch(authorize, { redirect: "manual" });
  const id = new URL(started.headers.get("location")!).searchParams.get("authorization_id");
  if (!id) throw new Error("no authorization_id");

  // The consent page reads the details on load, and the server ties the
  // authorization to the signed-in user at that point.
  const { error } = await clientForJar(jar).auth.oauth.getAuthorizationDetails(id);
  if (error) throw error;
  return id;
}

function form(authorizationId: string): FormData {
  const data = new FormData();
  data.set("authorization_id", authorizationId);
  return data;
}

/** Runs an action and returns where it redirected to. */
async function redirectedTo(run: () => Promise<unknown>): Promise<URL> {
  try {
    await run();
  } catch (thrown) {
    if (isRedirectError(thrown)) return new URL(getURLFromRedirectError(thrown));
    throw thrown;
  }
  throw new Error("expected a redirect");
}

describe("approving an authorization", () => {
  it("sends the signed-in trainer's browser back to the client with a code", async () => {
    await signedIn(ALLOW_LISTED, { trainer: true });
    const id = await pendingAuthorization();

    const target = await redirectedTo(() => approveAuthorizationAction(form(id)));

    expect(target.origin + target.pathname).toBe(CLIENT_REDIRECT);
    expect(target.searchParams.get("code")).toBeTruthy();
    expect(target.searchParams.get("state")).toBe("xyz");
  });

  it("refuses an account that has no trainer record, and approves nothing", async () => {
    await signedIn(NOT_ALLOW_LISTED, { trainer: false });
    const id = await pendingAuthorization();

    await expect(approveAuthorizationAction(form(id))).rejects.toBeInstanceOf(
      NotAllowListedError,
    );

    // Still pending: it can be decided later by someone entitled to.
    const details = await clientForJar(jar).auth.oauth.getAuthorizationDetails(id);
    expect(details.data).toHaveProperty("client");
    expect(details.data).not.toHaveProperty("redirect_url");
  });

  it("refuses an account that has since come off the allow-list", async () => {
    await signedIn(ALLOW_LISTED, { trainer: true });
    const id = await pendingAuthorization();
    process.env.POKE_TRACKER_ALLOWED_EMAILS = "someone-else@pallet.example";

    await expect(approveAuthorizationAction(form(id))).rejects.toBeInstanceOf(
      NotAllowListedError,
    );
  });
});

describe("denying an authorization", () => {
  it("sends the browser back to the client with an access_denied error and no code", async () => {
    await signedIn(ALLOW_LISTED, { trainer: true });
    const id = await pendingAuthorization();

    const target = await redirectedTo(() => denyAuthorizationAction(form(id)));

    expect(target.origin + target.pathname).toBe(CLIENT_REDIRECT);
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.get("code")).toBeNull();
  });
});
