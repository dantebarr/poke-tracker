import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { clientForJar, createAccount, deleteAccount, labelsFor, signIn } from "./helpers/supabase";

/**
 * Server actions run against a real local Supabase built from the real
 * migrations. Nothing about the database is mocked — see
 * tests/trainer-provisioning.test.ts for the rationale.
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

const { ensureTrainer, updateDailyTargetAction } = await import("@/app/actions/trainer");
const {
  createLabelAction,
  deleteLabelAction,
  moveLabelAction,
  recolorLabelAction,
  renameLabelAction,
} = await import("@/app/actions/label");
const { listLabels } = await import("@/lib/label/label");
const { DatabaseError } = await import("@/lib/supabase/errors");

const ALLOW_LISTED = "ash@pallet.example";
const ALSO_ALLOW_LISTED = "gary@oak.example";

let jar: CookieJar;
let created: string[] = [];

beforeEach(() => {
  jar = createCookieJar();
  jarRef.current = jar;
  created = [];
  process.env.POKE_TRACKER_ALLOWED_EMAILS = `${ALLOW_LISTED},${ALSO_ALLOW_LISTED}`;
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

/** Runs `fn` as if the given jar's session were the request's own. */
async function as<T>(otherJar: CookieJar, fn: () => Promise<T>): Promise<T> {
  jarRef.current = otherJar;
  try {
    return await fn();
  } finally {
    jarRef.current = jar;
  }
}

/** What a real `<form>` submission produces — every action takes one of these. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("signing up", () => {
  it("seeds the four default labels, in order", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);

    const labels = await labelsFor(trainer.id);

    expect(labels.map((label) => label.name)).toEqual(["Personal", "Babylon", "EA", "Atlas"]);
    expect(labels.map((label) => label.position)).toEqual([0, 1, 2, 3]);
    // Values, not style class names.
    for (const label of labels) {
      expect(label.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
    // Distinct colours.
    expect(new Set(labels.map((label) => label.color)).size).toBe(4);
  });

  it("does not reseed labels on a second sign-in", async () => {
    const account = await createAccount(ALLOW_LISTED);
    created.push(account.id);
    await signIn(jar, account);
    const trainer = await ensureTrainer();

    jar.clear();
    await signIn(jar, account);
    await ensureTrainer();

    expect(await labelsFor(trainer.id)).toHaveLength(4);
  });
});

describe("creating a label", () => {
  it("adds it at the end of the order", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);

    const label = await createLabelAction(formData({ name: "Errands", color: "#111111" }));

    expect(label.name).toBe("Errands");
    expect(label.color).toBe("#111111");
    expect(label.position).toBe(4);
    expect(await listLabels(client, trainer.id)).toHaveLength(5);
  });

  it("refuses a name that collides with an existing label, case-insensitively", async () => {
    await signedInTrainer(ALLOW_LISTED);

    try {
      await createLabelAction(formData({ name: "personal", color: "#222222" }));
      expect.unreachable("duplicate name should have been refused");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(DatabaseError);
      // 23505 is unique_violation.
      expect((thrown as InstanceType<typeof DatabaseError>).code).toBe("23505");
    }
  });
});

describe("renaming a label", () => {
  it("changes only the name, leaving the id (and so any task reference) alone", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const [personal] = await listLabels(client, trainer.id);

    const renamed = await renameLabelAction(formData({ id: personal.id, name: "Chores" }));

    expect(renamed.id).toBe(personal.id);
    expect(renamed.name).toBe("Chores");
  });
});

describe("recolouring a label", () => {
  it("stores the raw colour value passed in", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const [personal] = await listLabels(client, trainer.id);

    const recoloured = await recolorLabelAction(formData({ id: personal.id, color: "#abcdef" }));

    expect(recoloured.color).toBe("#abcdef");
  });
});

describe("reordering labels", () => {
  it("moving a label up swaps it with its predecessor", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const before = await listLabels(client, trainer.id);
    const babylon = before[1];

    const after = await moveLabelAction(formData({ id: babylon.id, direction: "up" }));

    expect(after.map((label) => label.name)).toEqual(["Babylon", "Personal", "EA", "Atlas"]);
  });

  it("moving the first label up is a no-op", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const before = await listLabels(client, trainer.id);

    const after = await moveLabelAction(formData({ id: before[0].id, direction: "up" }));

    expect(after.map((label) => label.name)).toEqual(before.map((label) => label.name));
  });

  it("moving the last label down is a no-op", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const before = await listLabels(client, trainer.id);

    const after = await moveLabelAction(
      formData({ id: before[before.length - 1].id, direction: "down" }),
    );

    expect(after.map((label) => label.name)).toEqual(before.map((label) => label.name));
  });
});

describe("deleting a label", () => {
  it("removes it when nothing references it", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const client = clientForJar(jar);
    const [personal] = await listLabels(client, trainer.id);

    await deleteLabelAction(formData({ id: personal.id }));

    expect(await listLabels(client, trainer.id)).toHaveLength(3);
  });
});

describe("row-level security, not the application, isolates one trainer's labels from another", () => {
  it("hides them from a read and refuses a write through another trainer's session", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(ALSO_ALLOW_LISTED);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);
    await as(rivalJar, ensureTrainer);

    const rivalView = await listLabels(clientForJar(rivalJar), ash.id);
    expect(rivalView).toEqual([]);

    await as(rivalJar, () =>
      expect(
        renameLabelAction(formData({ id: ashLabel.id, name: "Hijacked" })),
      ).rejects.toThrow(),
    );

    expect((await labelsFor(ash.id)).find((label) => label.id === ashLabel.id)?.name).toBe(
      "Personal",
    );
  });
});

describe("the daily target", () => {
  it("defaults to 3 and can be raised for future days", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    expect(trainer.dailyTarget).toBe(3);

    const updated = await updateDailyTargetAction(formData({ target: "5" }));
    expect(updated.dailyTarget).toBe(5);
  });

  it("refuses a target below 1", async () => {
    await signedInTrainer(ALLOW_LISTED);

    try {
      await updateDailyTargetAction(formData({ target: "0" }));
      expect.unreachable("a target below 1 should have been refused");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(DatabaseError);
      // 23514 is check_violation.
      expect((thrown as InstanceType<typeof DatabaseError>).code).toBe("23514");
    }
  });
});
