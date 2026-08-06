import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The suite shares one local database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    // Starting the stack and replaying every migration is not quick.
    hookTimeout: 300_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
});
