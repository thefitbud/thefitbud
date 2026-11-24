/**
 * Z14-2 Expo-web screenshot check (D-W14-5): 393x852 at 2x, light and dark
 * (`colorScheme`), against the local demo-seeded API behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure, states and values,
 * not native layout (safe areas, native sheets: device-run evidence).
 *
 * Account: rohan.slipping@demo.fitbud.test (Asia/Kolkata; meals still to log,
 * so a log can be made offline). Every shot starts
 * from a fresh browser context (empty localStorage: no snapshot, no outbox).
 * Nothing is sent to the server: the offline shots log while offline and the
 * context is closed before it reconnects.
 *
 *   TR-06a  Today, online.
 *   TR-06f  Today while the day, plan and week have not answered (the one
 *           skeleton): the day reads are held.
 *   TR-06e  Today offline after one online visit; "Eaten as planned" on the
 *           next meal while offline (the queued log is applied to the day).
 *   TR-06g  Today reloaded from the phone's snapshot while the API answers
 *           500 to the day reads (crit, with Retry; API reachable).
 *   TR-07d  Diet offline after one online visit, a meal logged offline.
 *   TR-07i  Diet when the meal reads never get an answer and nothing is
 *           cached.
 *
 * Usage (repo root): EXPO_WEB_URL=http://127.0.0.1:8081 node docs/qa/Z14-2/capture.mjs [shot ...]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8081";
const EMAIL = process.env.CAPTURE_EMAIL ?? "rohan.slipping@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 393, height: 852 };
const only = new Set(process.argv.slice(2));

const DAY_READS = [
  "**/__fitbud_api/meals/relationships/*/assignments*",
  "**/__fitbud_api/workouts/relationships/*/assignments*",
  "**/__fitbud_api/me/day/*",
  "**/__fitbud_api/me/week*",
];

async function waitText(page, text, timeout = 45_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function signIn(page) {
  await page.goto(BASE, { timeout: 240_000 });
  await waitText(page, "Sign in with a code instead", 240_000);
  await page.getByLabel("Mobile number or email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("tab-today").waitFor({ timeout: 90_000 });
}

async function todayLoaded(page) {
  await page.getByTestId("today-summary").first().waitFor({ timeout: 60_000 });
  // Snapshot writes are coalesced (250 ms); give them time to land.
  await page.waitForTimeout(1_500);
}

/** A tab's pane: tabs left stay mounted and hidden (Z14-2), so scope to it. */
function pane(page, tab) {
  return page.getByTestId(`trainee-pane-${tab}`);
}

async function openDiet(page) {
  await page.getByTestId("tab-diet").click();
  await waitText(pane(page, "diet"), "kcal eaten", 60_000);
  await page.waitForTimeout(1_200);
}

/** "Eaten as planned" on the first meal of `tab` that offers it, if any does. */
async function eatFirstMeal(page, tab) {
  const button = pane(page, tab).getByRole("button", { name: "Eaten as planned" }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForTimeout(1_000);
    return true;
  }
  return false;
}

const SHOTS = {
  async "TR-06a"(page) {
    await signIn(page);
    await todayLoaded(page);
  },
  async "TR-06f"(page) {
    for (const pattern of DAY_READS) {
      await page.route(pattern, () => new Promise(() => undefined));
    }
    await signIn(page);
    await page.getByLabel("Loading today").first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(1_500);
  },
  async "TR-06e"(page, context) {
    await signIn(page);
    await todayLoaded(page);
    await context.setOffline(true);
    await waitText(page, "You're offline. Showing what was saved at");
    // Log the next meal while offline: from Today's hero when it offers it,
    // else from Diet's meal due now, then back to Today.
    if (!(await eatFirstMeal(page, "today"))) {
      await openDiet(page);
      await eatFirstMeal(page, "diet");
      await page.getByTestId("tab-today").click();
    }
    // Let the in-app banner (a foreground notice) leave the header.
    await page.waitForTimeout(7_000);
    await pane(page, "today").getByText("Meals", { exact: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
  },
  async "TR-06g"(page) {
    await signIn(page);
    await todayLoaded(page);
    for (const pattern of DAY_READS.slice(0, 2)) {
      await page.route(pattern, (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side." },
          }),
        }),
      );
    }
    // A cold start: the app paints Today from the snapshot on the phone and
    // its refresh fails while the API is reachable. The snapshot must be
    // older than the 30 s freshness window, or no refresh is made at all.
    await page.waitForTimeout(31_000);
    await page.reload();
    await waitText(page, "Couldn't refresh. Showing", 90_000);
    await page.waitForTimeout(1_000);
  },
  async "TR-07d"(page, context) {
    await signIn(page);
    await todayLoaded(page);
    await openDiet(page);
    await context.setOffline(true);
    await eatFirstMeal(page, "diet");
    await waitText(pane(page, "diet"), "Offline.");
    await page.waitForTimeout(1_000);
  },
  async "TR-07i"(page) {
    await page.route(DAY_READS[0], (route) => route.abort("internetdisconnected"));
    await signIn(page);
    await page.getByTestId("tab-diet").click();
    await waitText(page, "Couldn’t load your meals", 60_000);
    await page.waitForTimeout(800);
  },
};

// CHROMIUM_PATH: a locally installed Chromium when Playwright's own build is
// not downloaded (sessions without the browser CDN).
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
await mkdir(HERE, { recursive: true });
try {
  for (const [name, run] of Object.entries(SHOTS)) {
    if (only.size > 0 && !only.has(name)) continue;
    for (const scheme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        colorScheme: scheme,
        timezoneId: "Asia/Kolkata",
      });
      const page = await context.newPage();
      try {
        await run(page, context);
        const file = join(HERE, `${name}-${scheme}-web.png`);
        await page.screenshot({ path: file });
        console.log("saved", file);
      } catch (error) {
        console.error("FAILED", name, scheme, error instanceof Error ? error.message : error);
        await page
          .screenshot({ path: join(HERE, `_failed-${name}-${scheme}.png`) })
          .catch(() => undefined);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
