import { defineConfig } from "@playwright/test";

/**
 * Banned-strings only. Boots and seeds the API like the full e2e run
 * (e2e/global-setup.ts) and starts trainer-web unless TRAINER_WEB_URL is set.
 * To reuse an already seeded API, set SKIP_E2E_API_BOOT=1.
 */
const webPort = process.env.FITBUD_WEB_PORT ?? "5173";
const webUrl = process.env.TRAINER_WEB_URL ?? `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/banned-strings.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 180_000,
  use: {
    baseURL: webUrl,
    trace: "off",
  },
  webServer: process.env.TRAINER_WEB_URL
    ? undefined
    : {
        command: `pnpm dev --host 127.0.0.1 --port ${webPort} --strictPort`,
        url: webUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
