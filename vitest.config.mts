import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) =>
  fileURLToPath(new URL(`./src/${path}`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/db$/, replacement: src("test/no-database.ts") },
      { find: /^@\//, replacement: src("") },
    ],
  },
  test: {
    // Only this checkout, not the other sessions' worktrees under .claude.
    include: ["src/**/*.test.ts"],
  },
});
