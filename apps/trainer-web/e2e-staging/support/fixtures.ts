import { test as base, expect, type Page } from "@playwright/test";
import {
  ENV_OTP_CODE,
  ENV_PASSWORD,
  loadExpectations,
  missingSecretsMessage,
  trainerEmail,
  account,
  type QaAccount,
  type QaExpectations,
} from "./env.js";
import { assertAllowedNavigation, resolveStagingBaseUrl } from "./host-guard.js";

export { expect };

// Same keys as apps/trainer-web/src/lib/session.ts (the web app keeps its session in
// sessionStorage). e2e/support/session.ts is not reused: it logs in over the API with
// the demo accounts against a local port, and the sign-in here goes through the UI.
const SESSION_KEYS = [
  "fitbud.trainer.accessToken",
  "fitbud.trainer.email",
  "fitbud.trainer.refreshToken",
  "fitbud.trainer.accessTokenExpiresAt",
] as const;

// One UI password sign-in per worker (the suite runs on one worker). /auth/login is
// rate limited per IP, so every test signing in through the form would trip it. The
// sign-in journeys keep their own full UI tests.
let cachedSession: Record<string, string> | null = null;

/** Sign in through the real form with the QA password. Never screenshots the filled form. */
export async function signInWithPassword(page: Page, email: string): Promise<void> {
  const password = process.env[ENV_PASSWORD];
  if (!password) throw new Error(`${ENV_PASSWORD} is not set`);
  await page.goto("/sign-in");
  await page.locator('input[name="username"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByTestId("sign-in-submit").click();
  await waitForHome(page);
}

export async function waitForHome(page: Page): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === "/", { timeout: 45_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible({
    timeout: 45_000,
  });
}

export async function captureSession(page: Page): Promise<void> {
  const entries = await page.evaluate((keys: string[]) => {
    const found: Array<[string, string]> = [];
    for (const key of keys) {
      const value = sessionStorage.getItem(key);
      if (value !== null) found.push([key, value]);
    }
    return found;
  }, [...SESSION_KEYS]);
  cachedSession = Object.fromEntries(entries);
}

/** The signed-in trainer's access token, read from the page like the app does. */
export async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => sessionStorage.getItem("fitbud.trainer.accessToken"));
  if (!token) throw new Error("no trainer session in this page");
  return token;
}

/** GET through the web app's own `/api` proxy, as the signed-in trainer. */
export async function apiGet<T>(page: Page, apiPath: string): Promise<T> {
  const res = await page.request.get(`/api${apiPath}`, {
    headers: { Authorization: `Bearer ${await accessToken(page)}` },
  });
  if (!res.ok()) throw new Error(`GET ${apiPath} returned ${res.status()}`);
  const json = (await res.json()) as { data?: T } & T;
  return (json.data ?? json) as T;
}

type Fixtures = {
  /** Fails the test if the page leaves the allowed origin. Runs for every test. */
  hostGuard: void;
  /** Skips (locally) or fails (in CI) when the QA secrets are missing. Runs for every test. */
  secretsGate: void;
  qa: {
    expectations: QaExpectations;
    trainer: QaAccount;
    onTrack: QaAccount;
    slipping: QaAccount;
    trainerEmail: string;
  };
  /** A page already signed in as the QA trainer. */
  trainerPage: Page;
};

export const test = base.extend<Fixtures>({
  // Declared first, so it runs before the browser is launched.
  secretsGate: [
    // Playwright reads a fixture's dependencies from this parameter's destructuring
    // pattern and throws "First argument must use the object destructuring pattern" for
    // anything else, so a fixture that depends on no other fixture has to be written
    // `({}, use)`. Renaming it to `_` would break the run, hence the disable.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, testInfo) => {
      const message = missingSecretsMessage();
      if (message) {
        if (process.env.CI) {
          // In CI a missing secret is a broken run, never a quiet skip.
          throw new Error(message.replace(/^skipped/, "failed"));
        }
        testInfo.skip(true, message);
      }
      await use();
    },
    { auto: true },
  ],

  hostGuard: [
    async ({ page, baseURL }, use) => {
      // Re-derive the origin from the environment: a baseURL set some other way
      // (a CLI override, a project-level `use`) must still pass the guard.
      const allowed = resolveStagingBaseUrl(process.env);
      if (!baseURL || new URL(baseURL).origin !== allowed) {
        throw new Error("staging host guard: baseURL does not match the allowed origin.");
      }
      const violations: Error[] = [];
      page.on("framenavigated", (frame) => {
        if (frame !== page.mainFrame()) return;
        try {
          assertAllowedNavigation(frame.url(), allowed);
        } catch (err) {
          violations.push(err as Error);
        }
      });
      await use();
      if (violations.length) throw violations[0];
    },
    { auto: true },
  ],

  // As above: Playwright requires the empty destructuring pattern for a fixture that
  // depends on no other fixture.
  // eslint-disable-next-line no-empty-pattern
  qa: async ({}, use) => {
    const expectations = loadExpectations();
    await use({
      expectations,
      trainer: account(expectations, "trainer"),
      onTrack: account(expectations, "ontrack"),
      slipping: account(expectations, "slipping"),
      trainerEmail: trainerEmail(expectations),
    });
  },

  trainerPage: async ({ page, qa }, use) => {
    if (cachedSession) {
      await page.addInitScript((entries) => {
        for (const [k, v] of Object.entries(entries)) {
          if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, v);
        }
      }, cachedSession);
      await page.goto("/");
      await waitForHome(page);
    } else {
      await signInWithPassword(page, qa.trainerEmail);
      await captureSession(page);
    }
    await use(page);
  },
});

/** Dates read like "Wed 21 Oct", never ISO. Checks the visible text of the page. */
export async function expectNoIsoDates(page: Page): Promise<void> {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/);
}

export { ENV_OTP_CODE, ENV_PASSWORD };
