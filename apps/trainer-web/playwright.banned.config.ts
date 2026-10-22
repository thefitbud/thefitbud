import { defineConfig } from "@playwright/test";

/** Banned-strings only — assumes API/web already seeded and running. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/banned-strings.spec.ts",
  timeout: 180_000,
  use: {
    baseURL: process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173",
    trace: "off",
  },
});
