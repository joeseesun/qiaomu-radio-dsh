import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    environmentMatchGlobs: [["tests/ui.*.test.ts", "happy-dom"]],
    globals: false,
    testTimeout: 20_000,
  },
});