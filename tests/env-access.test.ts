import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Environment variables must be read by static property access —
 * `process.env.NEXT_PUBLIC_FOO`, never `process.env[name]`.
 *
 * Next.js exposes `NEXT_PUBLIC_*` to the browser by substituting that literal
 * text at build time. A computed lookup matches nothing, so it yields
 * `undefined` in client code while continuing to work on the server. The
 * failure is invisible to server-side tests and shows up only when a real
 * browser runs the code, which is exactly how it got shipped once already.
 */
const SRC = path.resolve(import.meta.dirname, "..", "src");

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

/** Comments discuss this rule, so only real code is scanned for breaking it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("environment access", () => {
  it("never reads process.env by computed key", async () => {
    const offenders: string[] = [];

    for (const file of await sourceFiles(SRC)) {
      const source = withoutComments(await readFile(file, "utf8"));
      if (/process\.env\s*\[/.test(source)) {
        offenders.push(path.relative(SRC, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
