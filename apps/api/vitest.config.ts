import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    globalSetup: ["./src/test-support/global-setup.ts"],
    setupFiles: ["./src/test-support/vitest-setup.ts"],
    // Backstop only (task H1): seeded-DB hooks are built once per file and copied per
    // test, so they should finish well under the 10 s default. Do not lean on this.
    hookTimeout: 30_000,
  },
});
