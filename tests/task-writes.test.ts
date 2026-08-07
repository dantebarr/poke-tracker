import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, labelsFor, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the
 * same way the label and task-read suites do — see
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

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

const { ensureTrainer } = await import("@/app/actions/trainer");
const {
  completeTaskAction,
  createTaskAction,
  deleteTaskAction,
  updateTaskAction,
} = await import("@/app/actions/task");
const { currentActivePokemon } = await import("@/lib/pokemon/session");
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

describe("creating a task", () => {
  it("creates it open, with the given fields", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const task = await createTaskAction(
      formData({
        title: "Water the plants",
        dueDate: "2024-01-20",
        labelId: personal.id,
        size: "medium",
        notes: "Twice a week",
      }),
    );

    expect(task.title).toBe("Water the plants");
    expect(task.status).toBe("open");
    expect(task.size).toBe("medium");
    expect(task.notes).toBe("Twice a week");
    expect(task.label.id).toBe(personal.id);

    const [stored] = await currentTasks(trainer.id);
    expect(stored.id).toBe(task.id);
  });

  it("rejects a missing title, due date, label or size", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const complete = { title: "x", dueDate: "2024-01-20", labelId: personal.id, size: "small" };

    for (const missing of ["title", "dueDate", "labelId", "size"]) {
      const fields = { ...complete };
      delete (fields as Record<string, string>)[missing];
      await expect(createTaskAction(formData(fields))).rejects.toThrow();
    }
  });
});

describe("editing an open task", () => {
  it("changes title, due date, label, size and notes", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal, babylon] = await labelsFor(trainer.id);
    const task = await createTaskAction(
      formData({ title: "Old", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
    );

    const edited = await updateTaskAction(
      formData({
        id: task.id,
        title: "New",
        dueDate: "2024-01-25",
        labelId: babylon.id,
        size: "large",
        notes: "Updated notes",
      }),
    );

    expect(edited.title).toBe("New");
    expect(edited.dueDate).toBe("2024-01-25");
    expect(edited.label.id).toBe(babylon.id);
    expect(edited.size).toBe("large");
    expect(edited.notes).toBe("Updated notes");
  });
});

describe("completing a task", () => {
  it("takes one click and stamps the instance active at that moment", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const activePokemon = await currentActivePokemon();
    const task = await createTaskAction(
      formData({ title: "Do it", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
    );

    const completed = await completeTaskAction(formData({ id: task.id }));

    expect(completed.status).toBe("done");
    expect(completed.completedAt).not.toBeNull();

    const { data } = await adminClient()
      .from("tasks")
      .select("completed_instance_id")
      .eq("id", task.id)
      .single();
    expect(data?.completed_instance_id).toBe(activePokemon?.instanceId);
  });

  it("stamps no instance when the trainer currently has none", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const task = await createTaskAction(
      formData({ title: "Do it", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
    );

    const { error } = await adminClient()
      .from("trainer")
      .update({ active_instance_id: null })
      .eq("id", trainer.id);
    if (error) throw new Error(JSON.stringify(error));

    const completed = await completeTaskAction(formData({ id: task.id }));

    const { data } = await adminClient()
      .from("tasks")
      .select("completed_instance_id")
      .eq("id", completed.id)
      .single();
    expect(data?.completed_instance_id).toBeNull();
  });
});

describe("done is terminal (ADR-0002)", () => {
  it("refuses to edit, re-complete or delete a done task", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const task = await createTaskAction(
      formData({ title: "Do it", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
    );
    await completeTaskAction(formData({ id: task.id }));

    await expect(
      updateTaskAction(
        formData({ id: task.id, title: "Nope", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
      ),
    ).rejects.toThrow();
    await expect(completeTaskAction(formData({ id: task.id }))).rejects.toThrow();
    await expect(deleteTaskAction(formData({ id: task.id }))).rejects.toThrow();

    const [stillThere] = await currentTasks(trainer.id);
    expect(stillThere.status).toBe("done");
    expect(stillThere.title).toBe("Do it");
  });
});

describe("deleting an open task", () => {
  it("removes it", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const task = await createTaskAction(
      formData({ title: "Do it", dueDate: "2024-01-20", labelId: personal.id, size: "small" }),
    );

    await deleteTaskAction(formData({ id: task.id }));

    expect(await currentTasks(trainer.id)).toHaveLength(0);
  });
});

describe("row-level security, not the application, isolates one trainer's task writes from another", () => {
  it("refuses another trainer's edit, completion and delete", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    const task = await createTaskAction(
      formData({ title: "Ash's task", dueDate: "2024-01-20", labelId: ashLabel.id, size: "small" }),
    );

    const rivalJar = createCookieJar();
    const rivalAccount = await createAccount(ALSO_ALLOW_LISTED);
    created.push(rivalAccount.id);
    await signIn(rivalJar, rivalAccount);
    await as(rivalJar, ensureTrainer);

    await as(rivalJar, () =>
      expect(
        updateTaskAction(
          formData({ id: task.id, title: "Hijacked", dueDate: "2024-01-20", labelId: ashLabel.id, size: "small" }),
        ),
      ).rejects.toThrow(),
    );
    await as(rivalJar, () => expect(completeTaskAction(formData({ id: task.id }))).rejects.toThrow());
    await as(rivalJar, () => expect(deleteTaskAction(formData({ id: task.id }))).rejects.toThrow());

    const [stillAsh] = await currentTasks(ash.id);
    expect(stillAsh.title).toBe("Ash's task");
    expect(stillAsh.status).toBe("open");
  });

  it("refuses a completion that stamps another trainer's instance", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    const task = await createTaskAction(
      formData({ title: "Ash's task", dueDate: "2024-01-20", labelId: ashLabel.id, size: "small" }),
    );

    const rivalAccount = await createAccount(ALSO_ALLOW_LISTED);
    created.push(rivalAccount.id);
    const rivalJar = createCookieJar();
    await signIn(rivalJar, rivalAccount);
    await as(rivalJar, ensureTrainer);
    const rivalPokemon = await as(rivalJar, currentActivePokemon);

    const { error } = await clientForJar(jar)
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString(), completed_instance_id: rivalPokemon?.instanceId })
      .eq("id", task.id);

    expect(error).not.toBeNull();
    expect((error as { code: string }).code).toBe("42501");
  });

  it("refuses to create or edit a task against another trainer's label", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    const task = await createTaskAction(
      formData({ title: "Ash's task", dueDate: "2024-01-20", labelId: ashLabel.id, size: "small" }),
    );

    const rivalAccount = await createAccount(ALSO_ALLOW_LISTED);
    created.push(rivalAccount.id);
    const rivalJar = createCookieJar();
    await signIn(rivalJar, rivalAccount);
    await as(rivalJar, ensureTrainer);
    const [rivalLabel] = await labelsFor(rivalAccount.id);

    const insertResult = await clientForJar(jar)
      .from("tasks")
      .insert({ trainer_id: ash.id, label_id: rivalLabel.id, task: "Sneaky", due_date: "2024-01-15", size: "small" });
    expect(insertResult.error?.code).toBe("42501");

    const updateResult = await clientForJar(jar)
      .from("tasks")
      .update({ label_id: rivalLabel.id })
      .eq("id", task.id);
    expect(updateResult.error?.code).toBe("42501");
  });
});

