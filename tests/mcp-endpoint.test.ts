import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const revalidated = vi.hoisted(() => [] as unknown[][]);
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => {
    revalidated.push(args);
  },
}));

import { GET as protectedResourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { POST } from "@/app/mcp/route";
import { provisionPool } from "@/lib/pokemon/pokemon";
import { createRecurrence } from "@/lib/recurrence/recurrence";
import { provisionTrainer } from "@/lib/trainer/trainer";

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
 * The MCP route's single test seam: JSON-RPC requests sent to the route handler
 * with a bearer token, against a real local Supabase and a real signed-in
 * trainer's access token (ADR-0013).
 */
const ORIGIN = "http://localhost:3000";
const DAY = 24 * 60 * 60 * 1000;

let created: string[] = [];

beforeEach(() => {
  created = [];
  revalidated.length = 0;
});

afterEach(async () => {
  for (const id of created) {
    await deleteAccount(id);
  }
});

type Session = { jar: CookieJar; token: string; id: string };

/** A signed-in account, with or without the trainer record sign-in would give it. */
async function signedIn(email: string, options: { trainer: boolean } = { trainer: true }) {
  const account = await createAccount(email);
  created.push(account.id);
  const jar = createCookieJar();
  await signIn(jar, account);

  const client = clientForJar(jar);
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw new Error("no session");

  if (options.trainer) {
    await provisionTrainer(client, { id: account.id, email, displayName: null });
  }
  return { jar, token: session.access_token, id: account.id } satisfies Session;
}

function rpc(token: string | null, method: string, params?: unknown, id: number | null = 1) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  return POST(
    new NextRequest(`${ORIGIN}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
    }),
  );
}

async function callTool(token: string, name: string, args: unknown = {}) {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  expect(body.result.isError).not.toBe(true);
  return JSON.parse(body.result.content[0].text);
}

/** A tool call that is expected to fail, returning the message Claude is shown. */
async function callToolError(token: string, name: string, args: unknown = {}): Promise<string> {
  const response = await rpc(token, "tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.error).toBeUndefined();
  expect(body.result.isError).toBe(true);
  return body.result.content[0].text;
}

async function taskRow(id: string) {
  const { data } = await adminClient().from("tasks").select("*").eq("id", id).maybeSingle();
  return data;
}

describe("the MCP endpoint's authentication", () => {
  it("tells a caller with no token where to authenticate", async () => {
    const response = await rpc(null, "tools/list");

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it("turns away a token the auth server does not accept", async () => {
    const real = await signedIn("ash@pallet.example");
    const [header, payload] = real.token.split(".");
    const forged = `${header}.${payload}.${"A".repeat(43)}`;

    for (const token of ["not-a-jwt", forged]) {
      const response = await rpc(token, "tools/list");
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    }
  });

  it("refuses an account that has no trainer record", async () => {
    const stranger = await signedIn("stranger@viridian.example", { trainer: false });

    const response = await rpc(stranger.token, "tools/list");

    expect(response.status).toBe(403);
  });

  it("serves protected-resource metadata naming Supabase Auth as the authorization server", async () => {
    for (const suffix of ["", "/mcp"]) {
      const response = await protectedResourceMetadata(
        new NextRequest(`${ORIGIN}/.well-known/oauth-protected-resource${suffix}`),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        resource: `${ORIGIN}/mcp`,
        authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      });
    }
  });
});

describe("the resource a client is told to expect", () => {
  it("is the host the client actually called, since a client rejects any other", async () => {
    // Next's dev server reports `localhost` in the request URL whatever the
    // client addressed; the Host header is what the client sent.
    const response = await protectedResourceMetadata(
      new NextRequest(`${ORIGIN}/.well-known/oauth-protected-resource/mcp`, {
        headers: { host: "127.0.0.1:3000" },
      }),
    );

    expect(await response.json()).toMatchObject({ resource: "http://127.0.0.1:3000/mcp" });
  });
});

describe("the MCP protocol", () => {
  it("answers initialize with the tools capability", async () => {
    const { token } = await signedIn("ash@pallet.example");

    const response = await rpc(token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.capabilities).toHaveProperty("tools");
    expect(body.result.protocolVersion).toBe("2025-06-18");
  });

  it("acknowledges a notification without a body", async () => {
    const { token } = await signedIn("ash@pallet.example");

    const response = await rpc(token, "notifications/initialized", undefined, null);

    expect(response.status).toBe(202);
  });

  it("lists the read and write tools", async () => {
    const { token } = await signedIn("ash@pallet.example");

    const body = await (await rpc(token, "tools/list")).json();

    expect(body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      "complete_task",
      "create_task",
      "delete_task",
      "list_labels",
      "list_tasks",
      "reopen_task",
      "update_task",
    ]);
  });

  it("reports an unknown tool and an unknown method as JSON-RPC errors", async () => {
    const { token } = await signedIn("ash@pallet.example");

    const tool = await (await rpc(token, "tools/call", { name: "delete_everything" })).json();
    const method = await (await rpc(token, "resources/list")).json();

    expect(tool.error.code).toBe(-32602);
    expect(method.error.code).toBe(-32601);
  });
});

describe("list_tasks", () => {
  it("returns open tasks and tasks completed in the last 7 days, with what a reader needs", async () => {
    const { token, id } = await signedIn("ash@pallet.example");
    const [personal] = await labelsFor(id);
    const now = Date.now();

    const open = await insertTask({
      trainerId: id,
      labelId: personal.id,
      task: "Water the plants",
      dueDate: "2030-01-02",
      size: "medium",
    });
    const recentlyDone = await insertTask({
      trainerId: id,
      labelId: personal.id,
      task: "File taxes",
      status: "done",
      completedAt: new Date(now - 2 * DAY).toISOString(),
    });
    await insertTask({
      trainerId: id,
      labelId: personal.id,
      task: "Ancient history",
      status: "done",
      completedAt: new Date(now - 9 * DAY).toISOString(),
    });
    await adminClient().from("tasks").update({ notes: "Fern needs the most" }).eq("id", open.id);

    const tasks = await callTool(token, "list_tasks");

    expect(tasks.map((task: { title: string }) => task.title).sort()).toEqual([
      "File taxes",
      "Water the plants",
    ]);
    expect(tasks.find((task: { id: string }) => task.id === open.id)).toEqual({
      id: open.id,
      title: "Water the plants",
      dueDate: "2030-01-02",
      status: "open",
      label: personal.name,
      size: "medium",
      notes: "Fern needs the most",
      completedAt: null,
      fromRecurrence: false,
    });
    expect(tasks.find((task: { id: string }) => task.id === recentlyDone.id)).toMatchObject({
      status: "done",
      completedAt: expect.any(String),
    });
  });

  it("says when a recurrence generated a task", async () => {
    const { jar, token, id } = await signedIn("ash@pallet.example");
    const [personal] = await labelsFor(id);
    const rule = await createRecurrence(clientForJar(jar), id, {
      frequency: "daily",
      dayOfWeek: null,
      dayOfMonth: null,
      startsOn: "2030-01-01",
      title: "Stretch",
      labelId: personal.id,
      size: "small",
      notes: null,
    });
    await adminClient()
      .from("tasks")
      .insert({
        trainer_id: id,
        recurrence_id: rule.id,
        label_id: personal.id,
        task: "Stretch",
        due_date: "2030-01-01",
        size: "small",
      });
    await insertTask({ trainerId: id, labelId: personal.id, task: "Typed by hand" });

    const tasks = await callTool(token, "list_tasks");

    const byTitle = Object.fromEntries(
      tasks.map((task: { title: string; fromRecurrence: boolean }) => [task.title, task.fromRecurrence]),
    );
    expect(byTitle).toEqual({ Stretch: true, "Typed by hand": false });
  });

  it("never shows another trainer's tasks", async () => {
    const ash = await signedIn("ash@pallet.example");
    const gary = await signedIn("gary@oak.example");
    const [ashLabel] = await labelsFor(ash.id);
    const [garyLabel] = await labelsFor(gary.id);
    await insertTask({ trainerId: ash.id, labelId: ashLabel.id, task: "Ash's task" });
    await insertTask({ trainerId: gary.id, labelId: garyLabel.id, task: "Gary's task" });

    const tasks = await callTool(ash.token, "list_tasks");

    expect(tasks.map((task: { title: string }) => task.title)).toEqual(["Ash's task"]);
  });
});

describe("list_labels", () => {
  it("returns the trainer's label names in their order", async () => {
    const { token, id } = await signedIn("ash@pallet.example");

    const labels = await callTool(token, "list_labels");

    expect(labels).toEqual((await labelsFor(id)).map((label) => label.name));
    expect(labels.length).toBeGreaterThan(0);
  });

  it("never shows another trainer's labels", async () => {
    const ash = await signedIn("ash@pallet.example");
    const gary = await signedIn("gary@oak.example");
    await adminClient()
      .from("label")
      .insert({ trainer_id: gary.id, name: "Gary only", color: "#112233", position: 99, abbreviation: "GO" });

    const labels = await callTool(ash.token, "list_labels");

    expect(labels).not.toContain("Gary only");
  });
});

describe("create_task", () => {
  it("creates an open task from a label name, a day and a size, and returns it", async () => {
    const { token, id } = await signedIn("ash@pallet.example");
    const [label] = await labelsFor(id);

    const task = await callTool(token, "create_task", {
      title: "Book the vet",
      dueDate: "2030-03-04",
      label: label.name,
      size: "large",
      notes: "  ask about shots  ",
    });

    expect(task).toEqual({
      id: expect.any(String),
      title: "Book the vet",
      dueDate: "2030-03-04",
      status: "open",
      label: label.name,
      size: "large",
      notes: "ask about shots",
      completedAt: null,
      fromRecurrence: false,
    });
    expect(await taskRow(task.id)).toMatchObject({ trainer_id: id, label_id: label.id, status: "open" });
    expect(revalidated).toContainEqual(["/", "layout"]);
  });

  it("matches a label name without regard to case and stores blank notes as null", async () => {
    const { token, id } = await signedIn("ash@pallet.example");
    const [label] = await labelsFor(id);

    const task = await callTool(token, "create_task", {
      title: "Case",
      dueDate: "2030-03-04",
      label: label.name.toUpperCase(),
      size: "small",
      notes: "   ",
    });

    expect(task.label).toBe(label.name);
    expect((await taskRow(task.id))?.notes).toBeNull();
  });

  it("answers an unknown label with the trainer's labels", async () => {
    const { token, id } = await signedIn("ash@pallet.example");
    const labels = await labelsFor(id);

    const message = await callToolError(token, "create_task", {
      title: "Nope",
      dueDate: "2030-03-04",
      label: "No such label",
      size: "small",
    });

    expect(message).toContain("No such label");
    for (const label of labels) expect(message).toContain(label.name);
  });

  it("rejects a malformed or impossible date and an invalid size before the database", async () => {
    const { token, id } = await signedIn("ash@pallet.example");
    const [label] = await labelsFor(id);
    const valid = { title: "Bad", dueDate: "2030-03-04", label: label.name, size: "small" };

    expect(await callToolError(token, "create_task", { ...valid, dueDate: "04/03/2030" })).toContain("YYYY-MM-DD");
    expect(await callToolError(token, "create_task", { ...valid, dueDate: "2030-02-30" })).toContain("YYYY-MM-DD");
    expect(await callToolError(token, "create_task", { ...valid, size: "huge" })).toContain("small");
    expect(await callToolError(token, "create_task", { ...valid, title: "  " })).toContain("title");

    const { count } = await adminClient()
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("trainer_id", id);
    expect(count).toBe(0);
  });
});

/** A trainer with one open task, ready for the write tools. */
async function withOpenTask(email = "ash@pallet.example", fields: { size?: "small" | "medium" | "large" } = {}) {
  const session = await signedIn(email);
  const [label, other] = await labelsFor(session.id);
  const task = await insertTask({
    trainerId: session.id,
    labelId: label.id,
    task: "Original",
    dueDate: "2030-05-06",
    size: fields.size ?? "small",
  });
  await adminClient().from("tasks").update({ notes: "Original notes" }).eq("id", task.id);
  return { ...session, label, other, taskId: task.id };
}

/** A trainer with one open task a recurrence generated. */
async function withGeneratedTask() {
  const { jar, token, id } = await signedIn("ash@pallet.example");
  const [label] = await labelsFor(id);
  const rule = await createRecurrence(clientForJar(jar), id, {
    frequency: "daily", dayOfWeek: null, dayOfMonth: null, startsOn: "2030-01-01",
    title: "Stretch", labelId: label.id, size: "small", notes: null,
  });
  const { data } = await adminClient()
    .from("tasks")
    .insert({ trainer_id: id, recurrence_id: rule.id, label_id: label.id, task: "Stretch", due_date: "2030-01-01", size: "small" })
    .select("id")
    .single();
  return { token, taskId: data?.id as string };
}

describe("update_task", () => {
  it("changes only the fields sent", async () => {
    const { token, taskId, label, other } = await withOpenTask();

    const task = await callTool(token, "update_task", { id: taskId, title: "Renamed", label: other.name });

    expect(task).toMatchObject({ id: taskId, title: "Renamed", label: other.name, dueDate: "2030-05-06", size: "small", notes: "Original notes" });
    expect(await taskRow(taskId)).toMatchObject({ task: "Renamed", label_id: other.id, due_date: "2030-05-06" });
    expect(label.id).not.toBe(other.id);
    expect(revalidated).toContainEqual(["/", "layout"]);
  });

  it("changes the due date and size", async () => {
    const { token, taskId } = await withOpenTask();

    const task = await callTool(token, "update_task", { id: taskId, dueDate: "2031-01-02", size: "large" });

    expect(task).toMatchObject({ dueDate: "2031-01-02", size: "large", title: "Original" });
  });

  it("clears notes with null and stores blank notes as null", async () => {
    const { token, taskId } = await withOpenTask();

    expect((await callTool(token, "update_task", { id: taskId, notes: null })).notes).toBeNull();
    await adminClient().from("tasks").update({ notes: "again" }).eq("id", taskId);
    await callTool(token, "update_task", { id: taskId, notes: "  " });
    expect((await taskRow(taskId))?.notes).toBeNull();
  });

  it("rejects bad values before the database, and an empty change", async () => {
    const { token, taskId } = await withOpenTask();

    expect(await callToolError(token, "update_task", { id: taskId, dueDate: "tomorrow" })).toContain("YYYY-MM-DD");
    expect(await callToolError(token, "update_task", { id: taskId, size: "tiny" })).toContain("size");
    expect(await callToolError(token, "update_task", { id: taskId, label: "Nope" })).toContain("Your labels are");
    expect(await callToolError(token, "update_task", { id: taskId })).toContain("Nothing to change");
    expect(await taskRow(taskId)).toMatchObject({ task: "Original", due_date: "2030-05-06" });
  });

  it("can edit a task a recurrence generated", async () => {
    const { token, taskId } = await withGeneratedTask();

    const task = await callTool(token, "update_task", { id: taskId, title: "Stretch longer" });

    expect(task).toMatchObject({ title: "Stretch longer", fromRecurrence: true });
  });

  it("cannot change another trainer's task", async () => {
    const mine = await withOpenTask("ash@pallet.example");
    const theirs = await withOpenTask("gary@oak.example");

    const message = await callToolError(mine.token, "update_task", { id: theirs.taskId, title: "Hijacked" });

    expect(message).toContain("No task with id");
    expect((await taskRow(theirs.taskId))?.task).toBe("Original");
  });
});

describe("complete_task", () => {
  it("stamps the trainer's current Active Pokémon and returns the done task", async () => {
    const { jar, token, id, taskId } = await withOpenTask();
    await provisionPool(clientForJar(jar));
    const { data: trainer } = await adminClient().from("trainer").select("active_instance_id").eq("id", id).single();
    expect(trainer?.active_instance_id).not.toBeNull();

    const task = await callTool(token, "complete_task", { id: taskId });

    expect(task).toMatchObject({ id: taskId, status: "done", completedAt: expect.any(String) });
    expect(await taskRow(taskId)).toMatchObject({ status: "done", completed_instance_id: trainer?.active_instance_id });
    expect(revalidated).toContainEqual(["/", "layout"]);
  });

  it("stamps none when the trainer has no Active Pokémon", async () => {
    const { token, id, taskId } = await withOpenTask();
    await adminClient().from("trainer").update({ active_instance_id: null }).eq("id", id);

    await callTool(token, "complete_task", { id: taskId });

    expect(await taskRow(taskId)).toMatchObject({ status: "done", completed_instance_id: null });
  });

  it("can complete a task a recurrence generated", async () => {
    const { token, taskId } = await withGeneratedTask();

    const task = await callTool(token, "complete_task", { id: taskId });

    expect(task).toMatchObject({ status: "done", fromRecurrence: true });
  });

  it("cannot complete another trainer's task, or one that does not exist", async () => {
    const mine = await withOpenTask("ash@pallet.example");
    const theirs = await withOpenTask("gary@oak.example");

    expect(await callToolError(mine.token, "complete_task", { id: theirs.taskId })).toContain("No task with id");
    expect(await callToolError(mine.token, "complete_task", { id: "not-a-uuid" })).toContain("No task with id");
    expect((await taskRow(theirs.taskId))?.status).toBe("open");
  });
});

describe("reopen_task", () => {
  it("erases the completion", async () => {
    const { jar, token, taskId } = await withOpenTask();
    await provisionPool(clientForJar(jar));
    await callTool(token, "complete_task", { id: taskId });

    const task = await callTool(token, "reopen_task", { id: taskId });

    expect(task).toMatchObject({ status: "open", completedAt: null });
    expect(await taskRow(taskId)).toMatchObject({ status: "open", completed_at: null, completed_instance_id: null });
    expect(revalidated).toContainEqual(["/", "layout"]);
  });

  it("cannot reopen another trainer's task", async () => {
    const mine = await withOpenTask("ash@pallet.example");
    const theirs = await withOpenTask("gary@oak.example");
    await adminClient().from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).eq("id", theirs.taskId);

    expect(await callToolError(mine.token, "reopen_task", { id: theirs.taskId })).toContain("No task with id");
    expect((await taskRow(theirs.taskId))?.status).toBe("done");
  });
});

describe("delete_task", () => {
  it("deletes an open task", async () => {
    const { token, taskId } = await withOpenTask();

    await callTool(token, "delete_task", { id: taskId });

    expect(await taskRow(taskId)).toBeNull();
    expect(revalidated).toContainEqual(["/", "layout"]);
  });

  it("refuses a done task and says to reopen it first", async () => {
    const { token, taskId } = await withOpenTask();
    await callTool(token, "complete_task", { id: taskId });

    const message = await callToolError(token, "delete_task", { id: taskId });

    expect(message).toContain("reopen_task");
    expect(await taskRow(taskId)).not.toBeNull();
  });

  it("can delete a task a recurrence generated", async () => {
    const { token, taskId } = await withGeneratedTask();

    await callTool(token, "delete_task", { id: taskId });

    expect(await taskRow(taskId)).toBeNull();
  });

  it("cannot delete another trainer's task", async () => {
    const mine = await withOpenTask("ash@pallet.example");
    const theirs = await withOpenTask("gary@oak.example");

    expect(await callToolError(mine.token, "delete_task", { id: theirs.taskId })).toContain("No task with id");
    expect(await taskRow(theirs.taskId)).not.toBeNull();
  });
});

describe("the MCP route's database access", () => {
  it("never reaches for the service-role client", async () => {
    const files = [
      path.resolve(import.meta.dirname, "../src/app/mcp/route.ts"),
      ...(await readdir(path.resolve(import.meta.dirname, "../src/lib/mcp"))).map((name) =>
        path.resolve(import.meta.dirname, "../src/lib/mcp", name),
      ),
    ];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      expect(source, file).not.toMatch(/supabase\/service|supabaseServiceRoleKey|SERVICE_ROLE/);
    }
  });
});
