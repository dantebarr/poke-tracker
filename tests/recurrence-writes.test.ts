import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NewTaskFields } from "@/app/recurring-fields";

import { createCookieJar, type CookieJar } from "./helpers/cookie-jar";
import { adminClient, clientForJar, createAccount, deleteAccount, labelsFor, signIn } from "./helpers/supabase";

/**
 * Runs against a real local Supabase built from the real migrations, the same
 * way tests/task-writes.test.ts does — see trainer-provisioning.test.ts for
 * the fuller rationale on the `next/headers` mock.
 *
 * The rule's shape, its grants and its isolation are asserted against the
 * database rather than against the action, because that is where they live: a
 * check constraint and a missing update grant are the guarantee (ADR-0001),
 * and a test that only drove the action would pass just as happily with the
 * guarantee written in TypeScript.
 *
 * Fixed dates throughout: 2024-01-15 is a Monday.
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
const { createRecurrenceAction, deleteRecurrenceAction } = await import("@/app/actions/recurrence");
const { completeTaskAction, createTaskAction, deleteTaskAction } = await import("@/app/actions/task");
const { describeRecurringForm, newRecurringFields, newTaskFormData } = await import("@/app/recurring-fields");
const { generateTasks } = await import("@/lib/recurrence/generation");
const { listRecurrences } = await import("@/lib/recurrence/recurrence");
const { currentTasks } = await import("@/lib/task/session");

const ALLOW_LISTED = "ash@pallet.example";
const RIVAL = "gary@oak.example";

const MONDAY = "2024-01-15";
const WEDNESDAY = 3;

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

async function signedInTrainer(email: string, targetJar: CookieJar = jar) {
  const account = await createAccount(email);
  created.push(account.id);
  await signIn(targetJar, account);
  return as(targetJar, ensureTrainer);
}

/** Runs `fn` as if the given jar's session were the request's own. */
async function as<T>(otherJar: CookieJar, fn: () => Promise<T>): Promise<T> {
  const previous = jarRef.current;
  jarRef.current = otherJar;
  try {
    return await fn();
  } finally {
    jarRef.current = previous;
  }
}

/** What a real `<form>` submission produces — the action takes one of these. */
function formData(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

/** A rule's row as an auditor would see it, ignoring row-level security. */
async function storedRecurrence(id: string) {
  const { data, error } = await adminClient()
    .from("recurrence")
    .select("id, generated_through, task")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(JSON.stringify(error));
  return data;
}

describe("creating a recurrence", () => {
  it("creates exactly one task, on the resolved first date, carrying the rule's fields", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { recurrence, tasks } = await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "medium",
        notes: "Green bin on alternate weeks",
        frequency: "weekly",
        dayOfWeek: String(WEDNESDAY),
      }),
    );

    expect(recurrence.frequency).toBe("weekly");
    expect(recurrence.dayOfWeek).toBe(WEDNESDAY);
    expect(recurrence.startsOn).toBe(MONDAY);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].dueDate).toBe("2024-01-17");
    expect(tasks[0].title).toBe("Bins out");
    expect(tasks[0].size).toBe("medium");
    expect(tasks[0].notes).toBe("Green bin on alternate weeks");
    expect(tasks[0].label.id).toBe(personal.id);
    expect(tasks[0].status).toBe("open");

    const stored = await currentTasks(trainer.id);
    expect(stored.map((task) => task.dueDate)).toEqual(["2024-01-17"]);
  });

  it("creates no task for the start date, which is an anchor rather than a date of its own", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "weekly",
        dayOfWeek: String(WEDNESDAY),
      }),
    );

    const stored = await currentTasks(trainer.id);
    expect(stored.some((task) => task.dueDate === MONDAY)).toBe(false);
  });

  it("does put a task on the start date when the rule falls on it anyway", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { tasks } = await createRecurrenceAction(
      formData({
        title: "Water the plants",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "daily",
      }),
    );

    expect(tasks.map((task) => task.dueDate)).toEqual([MONDAY]);
  });

  it("clamps a monthly rule to the last day of a shorter month", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { tasks } = await createRecurrenceAction(
      formData({
        title: "Rent",
        startsOn: "2024-02-01",
        labelId: personal.id,
        size: "large",
        frequency: "monthly",
        dayOfMonth: "31",
      }),
    );

    expect(tasks.map((task) => task.dueDate)).toEqual(["2024-02-29"]);
  });

  it("leaves the watermark on the last date generation considered", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { recurrence } = await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "weekly",
        dayOfWeek: String(WEDNESDAY),
      }),
    );

    expect((await storedRecurrence(recurrence.id))?.generated_through).toBe("2024-01-17");
  });
});

describe("generation", () => {
  async function ruleFor(trainerId: string, fields: Record<string, string>) {
    await createRecurrenceAction(formData(fields));
    const [rule] = await listRecurrences(adminClient(), trainerId);
    return rule;
  }

  it("writes nothing the second time it is asked for the same reach", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await ruleFor(trainer.id, {
      title: "Water the plants",
      startsOn: MONDAY,
      labelId: personal.id,
      size: "small",
      frequency: "daily",
    });

    const again = await generateTasks(adminClient(), rule, rule.generatedThrough);

    expect(again).toEqual([]);
    expect(await currentTasks(trainer.id)).toHaveLength(1);
  });

  it("fills every date between the watermark and a further horizon", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await ruleFor(trainer.id, {
      title: "Water the plants",
      startsOn: MONDAY,
      labelId: personal.id,
      size: "small",
      frequency: "daily",
    });

    const backfilled = await generateTasks(adminClient(), rule, "2024-01-18");

    expect(backfilled.map((task) => task.dueDate)).toEqual(["2024-01-16", "2024-01-17", "2024-01-18"]);
    expect((await storedRecurrence(rule.id))?.generated_through).toBe("2024-01-18");
  });

  it("refuses to stamp a label the trainer does not own, and leaves the watermark alone", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await ruleFor(trainer.id, {
      title: "Water the plants",
      startsOn: MONDAY,
      labelId: personal.id,
      size: "small",
      frequency: "daily",
    });

    // Only service-role can put a rule in this state; row-level security
    // refuses it to the trainer's own JWT. The point is that generation, which
    // also runs as service-role, does not trust that it can't happen: a task
    // carrying a foreign label reads back with a null label and crashes the
    // label chip's render.
    const rivalJar = createCookieJar();
    const rival = await signedInTrainer(RIVAL, rivalJar);
    const [rivalLabel] = await labelsFor(rival.id);
    await adminClient().from("recurrence").update({ label_id: rivalLabel.id }).eq("id", rule.id);

    const [foreign] = await listRecurrences(adminClient(), trainer.id);
    const generated = await generateTasks(adminClient(), foreign, "2024-01-18");

    expect(generated).toEqual([]);
    expect(await currentTasks(trainer.id)).toHaveLength(1);
    expect((await storedRecurrence(rule.id))?.generated_through).toBe(MONDAY);
  });
});

/**
 * The add form's own submission (#15), end to end: the body it builds, handed
 * to the action it picks. The form's *decisions* are proved without a database
 * in tests/recurring-form.test.ts; what needs the real schema is that the two
 * agree at all — `FormData` is string-keyed, so a misspelt key is invisible to
 * the compiler and shows up only as a missing required field at runtime.
 */
describe("what the add form submits", () => {
  async function saveAddForm(fields: Partial<NewTaskFields> & { labelId: string }) {
    const complete: NewTaskFields = {
      title: "Water the plants",
      notes: "",
      dueDate: MONDAY,
      size: "small",
      ...newRecurringFields(),
      ...fields,
    };
    const { rule } = describeRecurringForm(complete);
    const formData = newTaskFormData(complete, rule);
    return rule ? createRecurrenceAction(formData) : createTaskAction(formData);
  }

  it("creates a rule and its one first task when the toggle is on", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    await saveAddForm({
      labelId: personal.id,
      title: "Bins out",
      notes: "Green bin",
      size: "medium",
      recurring: true,
      frequency: "weekly",
      dayOfWeek: WEDNESDAY,
    });

    const [rule] = await listRecurrences(adminClient(), trainer.id);
    expect(rule).toMatchObject({ frequency: "weekly", dayOfWeek: WEDNESDAY, dayOfMonth: null, startsOn: MONDAY });

    const tasks = await currentTasks(trainer.id);
    expect(tasks.map((task) => task.dueDate)).toEqual(["2024-01-17"]);
    expect(tasks[0]).toMatchObject({ title: "Bins out", size: "medium", notes: "Green bin" });
  });

  it("sends a daily rule neither day, which is the only shape the check constraint accepts", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    // The form never clears an override once it is set, so a trainer who
    // picked a weekday and then chose "every day" still holds one. It must not
    // reach the database: a daily rule carrying a day of week is refused.
    await saveAddForm({ labelId: personal.id, recurring: true, frequency: "daily", dayOfWeek: WEDNESDAY });

    const [rule] = await listRecurrences(adminClient(), trainer.id);
    expect(rule).toMatchObject({ frequency: "daily", dayOfWeek: null, dayOfMonth: null });
    expect((await currentTasks(trainer.id)).map((task) => task.dueDate)).toEqual([MONDAY]);
  });

  it("resolves the day the trainer never touched, rather than sending the null the form holds", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    // A weekly rule submitted with a null day of week is refused outright, so
    // the default the picker shows has to be the value that is sent.
    await saveAddForm({ labelId: personal.id, recurring: true, frequency: "weekly" });

    const [rule] = await listRecurrences(adminClient(), trainer.id);
    // 2024-01-15 is a Monday.
    expect(rule.dayOfWeek).toBe(1);
  });

  it("creates an ordinary one-off task, and no rule, when the toggle is off", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    await saveAddForm({ labelId: personal.id, title: "Just the once", dueDate: MONDAY });

    expect(await listRecurrences(adminClient(), trainer.id)).toEqual([]);
    const tasks = await currentTasks(trainer.id);
    expect(tasks.map((task) => task.title)).toEqual(["Just the once"]);
    expect(tasks[0].dueDate).toBe(MONDAY);
  });
});

describe("the shape a rule may have at all", () => {
  async function insertRule(trainerId: string, labelId: string, fields: Record<string, unknown>) {
    return clientForJar(jar)
      .from("recurrence")
      .insert({ trainer_id: trainerId, task: "Bins out", starts_on: MONDAY, label_id: labelId, size: "small", ...fields });
  }

  it("refuses a weekly rule without a day of week, and a monthly one without a day of month", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const weekly = await insertRule(trainer.id, personal.id, { frequency: "weekly" });
    const monthly = await insertRule(trainer.id, personal.id, { frequency: "monthly" });

    expect(weekly.error?.code).toBe("23514");
    expect(monthly.error?.code).toBe("23514");
  });

  it("refuses either frequency carrying the other's field", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const weekly = await insertRule(trainer.id, personal.id, {
      frequency: "weekly",
      day_of_week: WEDNESDAY,
      day_of_month: 15,
    });
    const monthly = await insertRule(trainer.id, personal.id, {
      frequency: "monthly",
      day_of_month: 15,
      day_of_week: WEDNESDAY,
    });
    const daily = await insertRule(trainer.id, personal.id, { frequency: "daily", day_of_week: WEDNESDAY });

    expect(weekly.error?.code).toBe("23514");
    expect(monthly.error?.code).toBe("23514");
    expect(daily.error?.code).toBe("23514");
  });

  it("refuses a frequency it has never heard of", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { error } = await insertRule(trainer.id, personal.id, { frequency: "fortnightly" });

    expect(error?.code).toBe("23514");
  });
});

describe("one task per rule per due date", () => {
  it("refuses a second task for the same rule and due date", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const { recurrence, tasks } = await createRecurrenceAction(
      formData({
        title: "Water the plants",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "daily",
      }),
    );

    const { error } = await adminClient().from("tasks").insert({
      trainer_id: trainer.id,
      recurrence_id: recurrence.id,
      task: "Water the plants",
      due_date: tasks[0].dueDate,
      label_id: personal.id,
      size: "small",
    });

    expect(error?.code).toBe("23505");
  });

  it("leaves hand-typed tasks, which name no rule, free to share a due date", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const row = { trainer_id: trainer.id, task: "Twice", due_date: MONDAY, label_id: personal.id, size: "small" };

    const { error } = await adminClient().from("tasks").insert([row, row]);

    expect(error).toBeNull();
  });
});

/**
 * The three verbs on a generated task (#16). Complete is not retested here —
 * it is ordinary completion, already covered by tests/task-writes.test.ts, and
 * the rule is untouched by it, which the delete-and-stop test below relies on
 * to have a done task to leave behind.
 */
describe("the verbs on a generated task", () => {
  /** A daily rule with a backfill behind it: 15th through 18th, four open tasks. */
  async function dailyRuleWithBackfill(trainerId: string, labelId: string) {
    await createRecurrenceAction(
      formData({
        title: "Water the plants",
        startsOn: MONDAY,
        labelId,
        size: "small",
        frequency: "daily",
      }),
    );
    const [rule] = await listRecurrences(adminClient(), trainerId);
    await generateTasks(adminClient(), rule, "2024-01-18");
    return rule;
  }

  it("surfaces the rule alongside the task it generated, and nothing alongside one typed by hand", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);

    const { recurrence } = await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "weekly",
        dayOfWeek: String(WEDNESDAY),
      }),
    );
    await createTaskAction(
      formData({ title: "Just the once", dueDate: MONDAY, labelId: personal.id, size: "small" }),
    );

    const tasks = await currentTasks(trainer.id);
    const generated = tasks.find((task) => task.title === "Bins out");
    const handTyped = tasks.find((task) => task.title === "Just the once");

    expect(generated?.recurrence).toEqual({
      id: recurrence.id,
      frequency: "weekly",
      dayOfWeek: WEDNESDAY,
      dayOfMonth: null,
      startsOn: MONDAY,
    });
    expect(handTyped?.recurrence).toBeNull();
  });

  it("deletes just this one, leaving the rule running and the deleted date gone for good", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await dailyRuleWithBackfill(trainer.id, personal.id);

    const wednesday = (await currentTasks(trainer.id)).find((task) => task.dueDate === "2024-01-17");
    await deleteTaskAction(formData({ id: wednesday!.id }));

    // The rule is untouched…
    const [survivor] = await listRecurrences(adminClient(), trainer.id);
    expect(survivor.id).toBe(rule.id);

    // …and it carries on from where the watermark already reached, so the
    // deleted date does not come back with the next one.
    const next = await generateTasks(adminClient(), survivor, "2024-01-19");
    expect(next.map((task) => task.dueDate)).toEqual(["2024-01-19"]);

    const dates = (await currentTasks(trainer.id)).map((task) => task.dueDate);
    expect(dates).toEqual(["2024-01-15", "2024-01-16", "2024-01-18", "2024-01-19"]);
  });

  it("deletes and stops: the rule, the pending task and every overdue leftover", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await dailyRuleWithBackfill(trainer.id, personal.id);

    const done = (await currentTasks(trainer.id)).find((task) => task.dueDate === MONDAY);
    await completeTaskAction(formData({ id: done!.id }));

    await deleteRecurrenceAction(formData({ id: rule.id }));

    expect(await storedRecurrence(rule.id)).toBeNull();
    expect(await listRecurrences(adminClient(), trainer.id)).toEqual([]);

    // The done task is the only survivor, and carries a null reference — from
    // here it is indistinguishable from a task typed by hand.
    const remaining = await currentTasks(trainer.id);
    expect(remaining.map((task) => task.id)).toEqual([done!.id]);
    expect(remaining[0].status).toBe("done");
    expect(remaining[0].recurrence).toBeNull();
  });

  it("leaves a second rule's tasks alone", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const rule = await dailyRuleWithBackfill(trainer.id, personal.id);
    await createRecurrenceAction(
      formData({
        title: "Bins out",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "weekly",
        dayOfWeek: String(WEDNESDAY),
      }),
    );

    await deleteRecurrenceAction(formData({ id: rule.id }));

    const remaining = await currentTasks(trainer.id);
    expect(remaining.map((task) => task.title)).toEqual(["Bins out"]);
  });

  it("refuses a rival's delete, and takes none of the tasks with it", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    const rule = await dailyRuleWithBackfill(ash.id, ashLabel.id);

    const rivalJar = createCookieJar();
    await signedInTrainer(RIVAL, rivalJar);

    await expect(as(rivalJar, () => deleteRecurrenceAction(formData({ id: rule.id })))).rejects.toThrow();

    expect((await storedRecurrence(rule.id))?.task).toBe("Water the plants");
    expect(await currentTasks(ash.id)).toHaveLength(4);
  });
});

/**
 * The row on its own, not the verb: what the foreign key does when a rule is
 * deleted and nothing has cleared its tasks first. The verb above is what
 * clears them; this is the guarantee underneath it, and the reason a done task
 * survives one.
 */
describe("deleting a rule row directly", () => {
  it("leaves the tasks it generated in place, pointing at nothing", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const { recurrence, tasks } = await createRecurrenceAction(
      formData({
        title: "Water the plants",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "daily",
      }),
    );

    const { error } = await clientForJar(jar).from("recurrence").delete().eq("id", recurrence.id);
    expect(error).toBeNull();

    expect(await storedRecurrence(recurrence.id)).toBeNull();

    const survivor = await currentTasks(trainer.id);
    expect(survivor.map((task) => task.id)).toEqual([tasks[0].id]);

    const { data } = await adminClient().from("tasks").select("recurrence_id").eq("id", tasks[0].id).single();
    expect(data?.recurrence_id).toBeNull();
  });
});

describe("a rule is immutable to a trainer's own JWT", () => {
  it("refuses an update, there being no edit surface and so no update grant", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal] = await labelsFor(trainer.id);
    const { recurrence } = await createRecurrenceAction(
      formData({
        title: "Water the plants",
        startsOn: MONDAY,
        labelId: personal.id,
        size: "small",
        frequency: "daily",
      }),
    );

    for (const patch of [{ task: "Hijacked" }, { generated_through: "2099-01-01" }, { starts_on: "2099-01-01" }]) {
      const { error } = await clientForJar(jar).from("recurrence").update(patch).eq("id", recurrence.id);
      // 42501 is insufficient_privilege — the grant is absent, so this is
      // refused before any policy is consulted.
      expect(error?.code).toBe("42501");
    }

    const stored = await storedRecurrence(recurrence.id);
    expect(stored?.task).toBe("Water the plants");
    expect(stored?.generated_through).toBe(MONDAY);
  });
});

describe("row-level security, not the application, isolates one trainer's rules from another", () => {
  it("refuses another trainer's read, create and delete", async () => {
    const ash = await signedInTrainer(ALLOW_LISTED);
    const [ashLabel] = await labelsFor(ash.id);
    const { recurrence } = await createRecurrenceAction(
      formData({
        title: "Ash's rule",
        startsOn: MONDAY,
        labelId: ashLabel.id,
        size: "small",
        frequency: "daily",
      }),
    );

    const rivalJar = createCookieJar();
    const rival = await signedInTrainer(RIVAL, rivalJar);
    const rivalClient = clientForJar(rivalJar);

    // Read: the `using` clause hides the row rather than erroring.
    const read = await rivalClient.from("recurrence").select("id").eq("id", recurrence.id);
    expect(read.data).toEqual([]);

    // Create, in ash's name: refused by the `with check`.
    const forged = await rivalClient.from("recurrence").insert({
      trainer_id: ash.id,
      frequency: "daily",
      starts_on: MONDAY,
      task: "Forged",
      label_id: ashLabel.id,
      size: "small",
    });
    expect(forged.error?.code).toBe("42501");

    // Create, in their own name, against ash's label: refused for the same
    // reason a task may not name a foreign label.
    const foreignLabel = await rivalClient.from("recurrence").insert({
      trainer_id: rival.id,
      frequency: "daily",
      starts_on: MONDAY,
      task: "Borrowed",
      label_id: ashLabel.id,
      size: "small",
    });
    expect(foreignLabel.error?.code).toBe("42501");

    // Delete: out of reach, so it matches nothing rather than erroring.
    const deleted = await rivalClient.from("recurrence").delete().eq("id", recurrence.id).select("id");
    expect(deleted.data).toEqual([]);

    expect((await storedRecurrence(recurrence.id))?.task).toBe("Ash's rule");
    expect(await listRecurrences(rivalClient, ash.id)).toEqual([]);
  });
});

describe("a label a live rule depends on", () => {
  it("cannot be deleted, the same foreign key that guards a task's label guarding a rule's", async () => {
    const trainer = await signedInTrainer(ALLOW_LISTED);
    const [personal, babylon] = await labelsFor(trainer.id);

    const { tasks } = await createRecurrenceAction(
      formData({
        title: "Rent",
        startsOn: "2024-02-01",
        labelId: babylon.id,
        size: "small",
        frequency: "monthly",
        dayOfMonth: "31",
      }),
    );

    // The generated task references the label too, and its own guard is
    // already covered (tests/task-list.test.ts). Clearing it leaves the rule
    // as the only thing holding the label, which is what is under test here.
    await clientForJar(jar).from("tasks").delete().eq("id", tasks[0].id);

    const { error } = await clientForJar(jar).from("label").delete().eq("id", babylon.id);

    // 23503 is foreign_key_violation — the default NO ACTION on
    // `recurrence.label_id`, exactly as `tasks.label_id` behaves.
    expect(error?.code).toBe("23503");

    expect((await labelsFor(trainer.id)).map((label) => label.id)).toContain(personal.id);
  });
});
