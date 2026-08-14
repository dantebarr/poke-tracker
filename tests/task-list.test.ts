import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import {
  adminClient,
  clientForJar,
  createAccount,
  deleteAccount,
  insertTask,
  labelsFor,
  signIn,
} from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way the label and pool suites do — see trainer-provisioning.test.ts
 * for the fuller rationale on the `next/headers` mock.
 *
 * This suite is about reading tasks, so it arranges rows with `insertTask`
 * (a service-role insert) rather than through the app's write actions —
 * see tests/task-writes.test.ts for those.
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
const { deleteLabelAction } = await import("@/app/actions/label");
const { currentTasks } = await import("@/lib/task/session");

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

function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("reading a trainer's tasks", () => {
  it("maps each row to its label, due date, size and status", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    await insertTask({
      trainerId: trainer.id,
      labelId: personal.id,
      task: "Water the plants",
      dueDate: "2024-01-20",
      size: "medium",
    });

    const tasks = await currentTasks(trainer.id);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "Water the plants",
      dueDate: "2024-01-20",
      size: "medium",
      status: "open",
      completedAt: null,
      label: { id: personal.id, name: personal.name, color: personal.color, position: personal.position },
    });
  });

  it("includes a done task's completion time", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const completedAt = "2024-01-14T09:00:00.000Z";

    await insertTask({
      trainerId: trainer.id,
      labelId: personal.id,
      status: "done",
      completedAt,
    });

    const [task] = await currentTasks(trainer.id);
    expect(task.status).toBe("done");
    // Postgres round-trips the timestamp in its own offset notation rather
    // than echoing the ISO string back verbatim.
    expect(new Date(task.completedAt!).toISOString()).toBe(completedAt);
  });
});

describe("row-level security, not the application, isolates one trainer's tasks from another", () => {
  it("hides them from a read", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    await insertTask({ trainerId: ash.id, labelId: ashLabel.id });

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(ALSO_ALLOW_LISTED);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);

    jarRef.current = rivalJar;
    await ensureTrainer();

    const { data } = await clientForJar(rivalJar)
      .from("tasks")
      .select("id")
      .eq("trainer_id", ash.id);

    expect(data).toEqual([]);
  });
});

// #7 shipped tasks read-only, and had a test here proving `authenticated`
// held no insert, update or delete grant at all. #8 supersedes that
// invariant deliberately — see tests/task-writes.test.ts for the write
// suite, including the row-level security tests that replace this one
// (a trainer can now write their own open tasks, but never another
// trainer's, and never a done one — ADR-0002).

describe("the task invariant lives in the database (ADR-0001)", () => {
  it("refuses a null due date, label or size", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const noDueDate = await adminClient()
      .from("tasks")
      .insert({ trainer_id: trainer.id, label_id: personal.id, task: "x", due_date: null, size: "small" });
    expect(noDueDate.error?.code).toBe("23502"); // not_null_violation

    const noLabel = await adminClient()
      .from("tasks")
      .insert({ trainer_id: trainer.id, label_id: null, task: "x", due_date: "2024-01-15", size: "small" });
    expect(noLabel.error?.code).toBe("23502");

    const noSize = await adminClient()
      .from("tasks")
      .insert({ trainer_id: trainer.id, label_id: personal.id, task: "x", due_date: "2024-01-15", size: null });
    expect(noSize.error?.code).toBe("23502");
  });

  it("refuses a size outside small, medium or large", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { error } = await adminClient()
      .from("tasks")
      .insert({
        trainer_id: trainer.id,
        label_id: personal.id,
        task: "x",
        due_date: "2024-01-15",
        size: "extra-large",
      });

    expect(error?.code).toBe("23514"); // check_violation
  });

  it("refuses the former third status", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { error } = await adminClient()
      .from("tasks")
      .insert({
        trainer_id: trainer.id,
        label_id: personal.id,
        task: "x",
        due_date: "2024-01-15",
        size: "small",
        status: "in_progress",
      });

    expect(error?.code).toBe("23514");
  });

  it("refuses to delete a label a task still references", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    await insertTask({ trainerId: trainer.id, labelId: personal.id });

    await expect(deleteLabelAction(formData({ id: personal.id }))).rejects.toThrow();
    expect((await labelsFor(trainer.id)).some((label) => label.id === personal.id)).toBe(true);
  });
});
