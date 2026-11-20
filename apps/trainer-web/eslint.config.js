import config from "@fitbud/config/eslint/base";
import fitbudErrors from "./eslint-rules/no-raw-error-message.mjs";

export default [
  ...config,
  {
    // Z12-64: never feed err.message into UI setters / JSX.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "src/test/**", "eslint-rules/**"],
    plugins: { "fitbud-errors": fitbudErrors },
    rules: { "fitbud-errors/no-raw-error-message": "error" },
  },
];
