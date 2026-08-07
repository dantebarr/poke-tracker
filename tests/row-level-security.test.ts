import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { queryCatalog } from "./helpers/postgres";
import { adminClient, clientForJar, createAccount, deleteAccount, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way every other suite touching a server action does — see
 * trainer-provisioning.test.ts for the fuller rationale on the
 * `next/headers` mock.
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

/**
 * The isolation guarantee itself — reading and writing another trainer's
 * rows is refused — is proved alongside each feature that touches a table
 * (see tests/label-settings.test.ts, tests/pool-provisioning.test.ts,
 * tests/task-list.test.ts and tests/task-writes.test.ts). This suite covers
 * what those don't: guarantees that hold across the *whole* schema rather
 * than any one table, and the one gap in per-feature coverage (`trainer`
 * has no write of its own to hijack in any feature test, so nothing there
 * proves a rival can't set another trainer's daily target directly).
 *
 * `ledger rows` and `Pokédex entries` (#9's acceptance criteria) aren't
 * separate tables yet — happiness and bond level are read-only columns on
 * `trainer` and `instance`, and the day ledger and Pokédex are future
 * slices (see CONTEXT.md). The schema-wide audit below isn't a fixed list
 * of table names, so it starts covering them automatically the moment they
 * exist, with no test to remember to add.
 */

const ALLOW_LISTED = "ash@pallet.example";
const RIVAL = "gary@oak.example";

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

async function signedInTrainer(email: string, targetJar: CookieJar) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(targetJar, account);
  const previous = jarRef.current;
  jarRef.current = targetJar;
  try {
    await ensureTrainer();
  } finally {
    jarRef.current = previous;
  }
  return account;
}

describe("every table in the schema", () => {
  it("carries row-level security", async () => {
    const tables = await queryCatalog<{ table_name: string; rls_enabled: boolean }>(`
      select c.relname as table_name, c.relrowsecurity as rls_enabled
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname
    `);

    // A regression here means a new table landed without `enable row level
    // security` — this asserts against whatever the migrations actually
    // created, not a list of names that would silently go stale.
    expect(tables.length).toBeGreaterThan(0);
    expect(tables.filter((table) => !table.rls_enabled).map((table) => table.table_name)).toEqual([]);
  });
});

describe("a signed-out request", () => {
  it("is refused on every table, not just tasks", async () => {
    const anonymous = clientForJar(createCookieJar());
    const tables = ["trainer", "label", "instance", "tasks", "species", "pool_template"];

    for (const table of tables) {
      const { error } = await anonymous.from(table).select("*").limit(1);
      // 42501 is insufficient_privilege — `anon` holds no grant at all,
      // the same way Jarvis HUD's "anon full access" policies on `tasks`
      // (this table's own history — see the adopt-tasks migration) no
      // longer exist to fall back on.
      expect(error?.code, `expected ${table} to refuse anon`).toBe("42501");
    }
  });
});

describe("a trainer's own row", () => {
  it("cannot be updated by another trainer", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED, jar);

    const rivalJar = createCookieJar();
    await signedInTrainer(RIVAL, rivalJar);

    const { data } = await clientForJar(rivalJar)
      .from("trainer")
      .update({ daily_target: 99 })
      .eq("id", ash.id)
      .select("id");

    // The row-level security `using` clause hides ash's row from gary's
    // update reach entirely, so it matches nothing rather than erroring.
    expect(data).toEqual([]);

    const { data: unchanged } = await adminClient()
      .from("trainer")
      .select("daily_target")
      .eq("id", ash.id)
      .single();
    expect(unchanged?.daily_target).toBe(3);
  });
});
