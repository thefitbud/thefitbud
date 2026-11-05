import config from "@fitbud/config/eslint/base";

import fitbudAccessibility from "./eslint-rules/no-invalid-accessibility-role.mjs";

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
];
