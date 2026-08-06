import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Brings up a local Supabase built from the migrations in this repository, and
 * hands the tests its URL and keys.
 *
 * The reset is the point: every run rebuilds the database by replaying
 * `supabase/migrations` from empty, so the tests exercise the same schema a
 * fresh environment would get. A constraint that only exists in someone's
 * long-lived local database fails here.
 */

function supabase(args: string[]): string {
  return execFileSync("npx", ["--no-install", "supabase", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Parses the `KEY="value"` lines that `supabase status -o env` emits. */
function parseStatus(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export default async function setup(project: TestProject) {
  // Idempotent: a stack that is already up is left alone.
  supabase(["start"]);

  // Replay the migrations from empty.
  supabase(["db", "reset", "--no-seed"]);

  const status = parseStatus(supabase(["status", "-o", "env"]));

  const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"] as const;
  for (const key of required) {
    if (!status[key]) {
      throw new Error(`supabase status did not report ${key}`);
    }
  }

  project.provide("supabaseEnv", {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  });
}

declare module "vitest" {
  export interface ProvidedContext {
    supabaseEnv: { url: string; anonKey: string; serviceRoleKey: string };
  }
}
