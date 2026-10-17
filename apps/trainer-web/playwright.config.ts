import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: {
    baseURL: process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: process.env.CI
    ? undefined
    : [
        {
          command: "pnpm exec wrangler dev --port 8787",
          cwd: "../../apps/api",
          url: "http://127.0.0.1:8787/health",
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: "pnpm dev --host 127.0.0.1 --port 5173",
          url: "http://127.0.0.1:5173",
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
});
