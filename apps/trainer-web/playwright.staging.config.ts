import { defineConfig, devices } from "@playwright/test";
import { resolveStagingBaseUrl } from "./e2e-staging/support/host-guard";
import { OUTPUT_DIR, WEB_RESULTS_DIR } from "./e2e-staging/support/paths";
import path from "node:path";

/**
 * Trainer web on STAGING (QT5, batch QA1). Runs beside the local suite and never replaces
 * it: `playwright.config.ts` (testDir ./e2e, local seeded API, the PR gate in ci.yml job
 * `e2e`) is untouched, and this config's testDir is ./e2e-staging, so neither picks up
 * the other's files.
 *
 *   pnpm --filter @fitbud/trainer-web exec playwright test -c playwright.staging.config.ts
 *
 * No webServer and no global setup: nothing local is started and no database is touched.
 * The target is the deployed app, which proxies /api to api-staging (same origin).
 *
 * Environment (names only; values are never written to a file, a log or a screenshot):
 *   STAGING_WEB_URL      optional; must be exactly https://app-staging.thefitbud.com or
 *                        the run refuses to start (host guard, e2e-staging/support/host-guard.ts)
 *   QA_TRAINER_EMAIL     optional; default is the QA trainer in expectations.json; must
 *                        match the QA allowlist qa+<tag>@thefitbud.com
 *   QA_TEST_OTP_CODE     the staging test OTP (D-QA1-1). Treated as public (D-QA1-14) but
 *                        never screenshotted
 *   FITBUD_QA_PASSWORD   the QA trainer's password
 *   QA_RESULTS_DIR       optional; moves the qa-results tree (default <repo>/qa-results)
 *   QA_STAGING_LOCAL_REHEARSAL=1  admits http://127.0.0.1 / localhost so the specs can be
 *                        checked against a LOCAL API and seed. Not a staging run.
 * Missing secrets: tests skip with "skipped: QA secrets not set" (locally) and fail in CI
 * (CI=true), so a run without secrets can never look green. QT8 reports an all-skipped
 * suite as `error`.
 *
 * Report contract (QT8, docs/runbooks/qa-nightly.md): qa-results/web/junit.xml,
 * qa-results/web/results.json, screenshots in qa-results/web/screenshots/, log in
 * qa-results/logs/web.log.
 *
 * ---------------------------------------------------------------------------------
 * SCREENSHOT -> FRAME MAPPING. This block is the contract with the FitBud UI bot and
 * with scripts/qa/summarize.mjs, which parses it: one line per screenshot, the shot name
 * (web-<journey>__<step>, no extension) then the locked frame in docs/design/mockups/png/.
 * Keep exactly one shot name and one frame per mapping line, and no other line may hold
 * a shot name. e2e-staging/01-frame-map.spec.ts checks every frame exists and every shot
 * taken has a line.
 *
 *   web-signin__form                  -> 01-trainer-web-signin.png
 *   web-clients__list                 -> 136-trainer-web-clients-web.png
 *   web-home__attention               -> 02-trainer-web-home-panel-v3-web.png
 *   web-exception__panel              -> 02-trainer-web-home-panel-v3-web.png
 *   web-exception__resolve-form       -> 02-trainer-web-home-panel-v3-resolve-web.png
 *   web-exception__resolved           -> 02-trainer-web-home-panel-v3-resolved-web.png
 *   web-client-overview__rohan        -> 03-trainer-web-client-rohan.png
 *   web-client-overview__aarav        -> 03-trainer-web-client-rohan.png
 *   web-checkins__inbox               -> 166-trainer-web-checkins-inbox-web.png
 *   web-checkin-review__open          -> 163-trainer-web-checkin-review-web.png
 *   web-checkin-review__reviewed      -> 164-trainer-web-checkin-reviewed-web.png
 *   web-notes__composer               -> 188-trainer-web-note-composer-web.png
 *   web-settings__profile             -> 176-trainer-web-settings-profile-web.png
 *   web-settings__notifications       -> 177-trainer-web-settings-notifications-web.png
 *
 * Notes for the bot. The frames show demo data (Rohan Mehta, Sun 18 Oct); the QA accounts
 * are "QA Rohan" and "QA Aarav" with generated data, so compare layout, hierarchy, copy
 * and states, not names or dates. The 02 frames show the Home list with the review panel
 * open; web-home__attention is the same screen before the panel opens. The QA on-track
 * client has no frame of its own and uses the Rohan overview. Failure screenshots
 * (test-failed-*) are not mapped. There is deliberately no screenshot between entering the
 * sign-in code or password and submitting it (D-QA1-14).
 * ---------------------------------------------------------------------------------
 */

// Throws, before any browser opens, for any host but staging.
const baseURL = resolveStagingBaseUrl(process.env);

export default defineConfig({
  testDir: "./e2e-staging",
  testMatch: /.*\.spec\.ts$/,
  outputDir: OUTPUT_DIR,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // Specs write to the QA accounts (D-QA1-7) and share one cached sign-in: one worker,
  // in file order, no retries (a retried write would hide a real failure).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["junit", { outputFile: path.join(WEB_RESULTS_DIR, "junit.xml") }],
    ["json", { outputFile: path.join(WEB_RESULTS_DIR, "results.json") }],
    ["./e2e-staging/support/log-reporter.ts"],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: "only-on-failure",
    // Off, not retain-on-failure: any test that signs in with the password (the fixture does,
    // when spec 02 did not run first) would keep the typed password in the trace DOM snapshots.
    trace: "off",
  },
  projects: [
    {
      // Frames are 1440 wide; iPad is covered by the local suite.
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
