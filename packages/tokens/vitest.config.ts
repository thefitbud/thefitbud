import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Z12-35 / D-W12-28: every vitest workspace fails a test that calls console.error.
export default defineConfig({
  test: {
    setupFiles: [fileURLToPath(new URL("../config/vitest/fail-on-console.js", import.meta.url))],
  },
});
