import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globalSetup: ["./src/test-support/global-setup.ts"],
    // Z12-35 / D-W12-28: the shared gate fails a test that calls console.error.
    setupFiles: ["../../packages/config/vitest/fail-on-console.js", "./src/test-support/vitest-setup.ts"],
    // Backstop only (task H1): seeded-DB hooks are built once per file and copied per
    // test, so they should finish well under the 10 s default. Do not lean on this.
    hookTimeout: 30_000,
  },
});
