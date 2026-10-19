import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  // Seed mutations (password reset, invite reissue) must not race across files.
  workers: 1,
  use: {
    baseURL: process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /tw-g-ipad\.spec\.ts/,
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
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev --host 127.0.0.1 --port 5173",
        url: "http://127.0.0.1:5173",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
