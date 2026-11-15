import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// Z12-35 / D-W12-28: every vitest workspace fails a test that calls console.error.
export default defineConfig({
  test: {
    // vitest 4 no longer excludes build output: never run the compiled copies of tests in dist/.
    exclude: [...configDefaults.exclude, "**/dist/**"],
    setupFiles: [fileURLToPath(new URL("../config/vitest/fail-on-console.js", import.meta.url))],
  },
});
