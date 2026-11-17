/**
 * Z12-3 visual captures at 1440×900 (frames 137–139).
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-3/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 1440, height: 900 };

const EMPTY_FACETS = {
  status: {
    active: 0,
    invited: 0,
    onboarding_incomplete: 0,
    onboarding_submitted: 0,
    coaching_ready: 0,
    ended: 0,
  },
  adherence: {},
  renewal: {},
};

const FILTERED_FACETS = {
  status: {
    active: 15,
    invited: 1,
    onboarding_incomplete: 0,
    onboarding_submitted: 1,
    coaching_ready: 1,
    ended: 2,
  },
  adherence: {
    on_track: 4,
    needs_attention: 6,
    no_recent_data: 5,
    not_available: 3,
  },
  renewal: { expired: 1, due: 1, none: 18, upcoming: 0 },
};

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function capture(page, name) {
  const file = join(OUT, `${name}-1440x900.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-1440x900.txt`), text.slice(0, 4000));
  console.log("wrote", file);
}

async function fulfillDirectory(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await signIn(page);

  // --- 137 filtered-empty ---
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await fulfillDirectory(route, {
      data: { items: [], nextCursor: null, facets: FILTERED_FACETS },
    });
  });
  await page.goto(
    `${BASE}/clients?adherenceState=no_recent_data&renewal=due`,
    { waitUntil: "domcontentloaded" },
  );
  await page.getByTestId("clients-empty").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "137-trainer-web-clients-filtered-empty-web");

  // --- 138 true empty ---
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await fulfillDirectory(route, {
      data: { items: [], nextCursor: null, facets: EMPTY_FACETS },
    });
  });
  await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("clients-empty").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "138-trainer-web-clients-empty-web");

  // --- 139 error (seed facets first so the subtitle stays, then fail) ---
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  let clientsMode = "ok";
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    if (clientsMode === "ok") {
      await fulfillDirectory(route, {
        data: {
          items: [
            {
              relationshipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              invitationId: null,
              traineeDisplayName: "Rohan Mehta",
              status: "active",
              goalShort: "Lose 6 kg",
              nextCheckin: null,
              effectivePlan: null,
              adherenceState: "not_available",
              renewalState: null,
              renewsOn: null,
              updatedAt: "2026-10-21T04:30:00.000Z",
            },
          ],
          nextCursor: null,
          facets: FILTERED_FACETS,
        },
      });
      return;
    }
    await fulfillDirectory(
      route,
      {
        error: {
          code: "INTERNAL",
          message:
            "Please retry in a moment. If it keeps happening, email support.",
          requestId: "req-7Hq2KtPz",
        },
      },
      500,
    );
  });
  await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
  await page.getByText("Rohan Mehta").waitFor({ state: "visible", timeout: 20_000 });
  // Keep the same React tree so facets from the success load stay visible.
  clientsMode = "error";
  await page.getByRole("button", { name: "Renewal" }).click();
  await page.getByRole("menuitemcheckbox", { name: /Due/ }).click();
  await page.getByTestId("error-state").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator('[data-testid="error-state"] details summary').click();
  await capture(page, "139-trainer-web-clients-error-web");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
