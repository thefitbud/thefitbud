import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Staging API smoke suite (QT6). Separate from `vitest.config.ts`, whose `include`
 * (`src/**` and `scripts/**`) never matches `qa-smoke/**`, so `pnpm test` does not
 * run it and it needs no in-memory D1 or the API test setup files.
 *
 *   pnpm --filter @fitbud/api exec vitest run -c vitest.staging.config.ts
 *
 * Reports go to the repo-root `qa-results/api/` that the QA nightly job (QT7) and the
 * summary builder (QT8) read. The paths are absolute so they do not depend on the
 * directory the command runs from.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const reportDir = path.resolve(here, "..", "..", "qa-results", "api");

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    include: ["qa-smoke/**/*.test.ts"],
    globalSetup: ["./qa-smoke/global-setup.ts"],
    // Files share staging data and sign-in state: run one after another.
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: ["default", ["junit", { suiteName: "api" }], "json"],
    outputFile: {
      junit: path.join(reportDir, "junit.xml"),
      json: path.join(reportDir, "results.json"),
    },
  },
});
