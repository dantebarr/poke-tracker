import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { GET as protectedResourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { POST } from "@/app/mcp/route";
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

  it("lists list_tasks and list_labels", async () => {
    const { token } = await signedIn("ash@pallet.example");

    const body = await (await rpc(token, "tools/list")).json();

    expect(body.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      "list_labels",
      "list_tasks",
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
