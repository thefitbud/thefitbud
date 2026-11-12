import js from "@eslint/js";
import tseslint from "typescript-eslint";

import fitbudUrl from "./no-urlsearchparams-size.js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Z11b-1: Expo's native URLSearchParams has no `size`; it dropped every api-client query string.
    plugins: { "fitbud-url": fitbudUrl },
    rules: { "fitbud-url/no-urlsearchparams-size": "error" },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/.turbo/**", "**/.expo/**"],
  },
];
