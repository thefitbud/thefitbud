import { defineConfig, devices } from "@playwright/test";

// Ports are configurable so e2e can run beside a dev stack (or in CI).
// FITBUD_API_PORT (default 8787) is read by e2e/global-setup.ts and the Vite proxy.
const webPort = process.env.FITBUD_WEB_PORT ?? "5173";
const webUrl = process.env.TRAINER_WEB_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  // Seed mutations (password reset, invite reissue) must not race across files.
  workers: 1,
  use: {
    baseURL: webUrl,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // banned-strings runs on its own config (pnpm test:e2e:banned).
      testIgnore: [/tw-g-ipad\.spec\.ts/, /banned-strings\.spec\.ts/],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit-ipad-portrait",
      testMatch: /tw-g-ipad\.spec\.ts/,
      use: {
        ...devices["iPad Pro 11"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "webkit-ipad-landscape",
      testMatch: /tw-g-ipad\.spec\.ts/,
      use: {
        ...devices["iPad Pro 11 landscape"],
        viewport: { width: 1024, height: 768 },
      },
    },
  ],
  webServer: process.env.TRAINER_WEB_URL
    ? undefined
    : {
        command: `pnpm dev --host 127.0.0.1 --port ${webPort} --strictPort`,
        url: webUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
