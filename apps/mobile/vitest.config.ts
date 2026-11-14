/// <reference types="vitest/config" />
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Two projects, so the render harness cannot slow down or re-resolve the
 * existing logic suites:
 *
 * - `node` keeps every `.test.ts` exactly where it was: `environment: "node"`,
 *   no aliases.
 * - `render` runs `.test.tsx` in a DOM with `react-native` aliased to
 *   `react-native-web`, which is already a runtime dependency of this app (the
 *   Expo web target uses it). That is what lets a React Native component tree
 *   render under vitest at all — see `src/test/render.tsx` for why
 *   `@testing-library/react-native` is not used.
 *
 * Both projects load the shared `packages/config/vitest/fail-on-console.js`, which fails any test that
 * calls `console.error` (Z12-35, the W12 device gate).
 */
const failOnConsole = fileURLToPath(new URL("../../packages/config/vitest/fail-on-console.js", import.meta.url));
// Resolved to an absolute path on purpose: a bare "react-native-web"
// replacement is re-resolved from each importer, and the workspace packages
// that import "react-native" (for example @fitbud/ui-mobile) do not have
// react-native-web in their own node_modules.
const reactNativeWeb = dirname(
  createRequire(import.meta.url).resolve("react-native-web/package.json"),
);

const renderAlias = [{ find: /^react-native$/, replacement: reactNativeWeb }];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "app.config.test.ts", "metro.config.test.ts", "eslint-rules/**/*.test.mjs"],
          setupFiles: [failOnConsole],
        },
      },
      {
        resolve: { alias: renderAlias },
        test: {
          name: "render",
          environment: "happy-dom",
          include: ["src/**/*.test.tsx"],
          setupFiles: [failOnConsole, "src/test/render.tsx"],
        },
      },
    ],
  },
});
