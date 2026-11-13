import config from "@fitbud/config/eslint/base";

import fitbudAccessibility from "./eslint-rules/no-invalid-accessibility-role.mjs";
import fitbudDependencies from "./eslint-rules/no-undeclared-dependency.mjs";

export default [
  ...config,
  {
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
      },
    },
  },
  {
    // AB2 crash guard: Android throws on a non-native accessibilityRole.
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: { "fitbud-a11y": fitbudAccessibility },
    rules: { "fitbud-a11y/no-invalid-accessibility-role": "error" },
  },
  {
    // Z11b-3 crash guard: a package that is not in this app's dependencies is
    // not resolvable under pnpm, and an unresolved require is fatal on device.
    // Tests and config may use devDependencies.
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: ["**/*.test.{ts,tsx,mjs}", "src/test/**", "eslint-rules/**", "eslint.config.mjs"],
    plugins: { "fitbud-deps": fitbudDependencies },
    rules: { "fitbud-deps/no-undeclared-dependency": "error" },
  },
];
