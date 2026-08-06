import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The browser never talks to the database: server components read, server
 * actions write.
 *
 * That is an architectural rule rather than a runtime behaviour, so it is
 * checked structurally. The single exception is starting the Google OAuth
 * redirect, which can only happen in the browser and touches auth, not data.
 */
const SRC = path.resolve(import.meta.dirname, "..", "src");

const OAUTH_ENTRY_POINT = path.join("app", "sign-in", "google-sign-in-button.tsx");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.tsx?$/.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

describe("the data access boundary", () => {
  it("keeps client components away from Supabase, bar the OAuth redirect", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      const source = await readFile(file, "utf8");
      const isClientComponent = /^\s*["']use client["']/m.test(source);
      const importsSupabase = /from\s+["'](@\/lib\/supabase\/|@supabase\/)/.test(source);
      const relative = path.relative(SRC, file);

      if (isClientComponent && importsSupabase && relative !== OAUTH_ENTRY_POINT) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});
