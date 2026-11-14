import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// The app's Vite config (plugins, server) plus the shared console-error gate: every
// vitest workspace fails a test that calls console.error (Z12-35, D-W12-28). vitest
// reads this file instead of vite.config.ts, so the Vite config is merged in unchanged.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      setupFiles: [fileURLToPath(new URL("../../packages/config/vitest/fail-on-console.js", import.meta.url))],
    },
  }),
);
