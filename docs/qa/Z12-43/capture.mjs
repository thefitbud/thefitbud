/**
 * Z12-43 Expo-web screenshot check (D-W12-34 (2)): 393x852 at 2x, light and
 * dark (`colorScheme`), against the local demo-seeded API behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure and values, not native
 * layout (system keyboard, safe areas, native sheets and the tray's keyboard
 * avoidance are device-gate evidence, not this).
 *
 * Account: aarav.ontrack@demo.fitbud.test (Asia/Kolkata). The demo seed is
 * relative to the clock and the dinner window opens at 8:00 pm IST, so:
 *   - every shot except TR-26f installs a Playwright fake clock at 8:30 pm IST
 *     on the seeded day so the client shows Dinner as "Due now". Nothing is
 *     saved in those shots, so the server clock does not matter.
 *   - TR-26f really saves a meal. The API refuses a log stamped before the
 *     window opens or more than 5 minutes ahead of its own clock, so that shot
 *     runs on the real clock: it re-seeds the demo data, then moves Dinner's
 *     window start to 12:00 UTC the same day in the local D1 (the Dinner row
 *     therefore reads "5:30 pm" in that one shot).
 *
 * Usage:
 *   EXPO_WEB_URL=http://127.0.0.1:8098 node docs/qa/Z12-43/capture.mjs [shot ...]
 * Run from the repo root. TR-26f also needs the API's local D1 dir (default
 * apps/api, `.wrangler/state`) and runs `pnpm db:reseed` there; set
 * SKIP_RESEED=1 to skip the re-seed and the window tweak.
 */
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8098";
const OUT = join(HERE, "web");
const API_DIR = resolve(HERE, "../../../apps/api");
const EMAIL = "aarav.ontrack@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 393, height: 852 };
const FAKE_NOW = new Date("2026-11-18T15:00:00Z");
const only = new Set(process.argv.slice(2));

async function waitText(page, text, timeout = 45_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function signInToDiet(page, { fakeClock }) {
  if (fakeClock) await page.clock.install({ time: FAKE_NOW });
  await page.goto(BASE);
  await waitText(page, "Sign in with a code instead", 240_000);
  await page.getByLabel("Mobile number or email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByText("Diet", { exact: true }).last().waitFor({ timeout: 90_000 });
  await page.getByText("Diet", { exact: true }).last().click();
  await waitText(page, "kcal eaten", 60_000);
  await page.waitForTimeout(1_200);
}

async function openSomethingDifferent(page, opts) {
  await signInToDiet(page, opts);
  await page.getByText("Dinner").first().scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Something different" }).first().click();
  await waitText(page, "What did you have instead?");
  await waitText(page, "Log it myself");
}

async function openFoodSearch(page, opts = { fakeClock: true }) {
  await openSomethingDifferent(page, opts);
  await page.getByRole("button", { name: "Log it myself" }).click();
  await page.getByTestId("food-search-screen").waitFor({ timeout: 30_000 });
  await waitText(page, "Tap a food to set katori, piece, cup or grams.");
  await page.waitForTimeout(600);
}

async function searchFor(page, query) {
  await page.getByTestId("food-search-input").fill(query);
}

function rotiRow(page) {
  return page.locator('[data-testid^="food-row-"]', { hasText: "Chapati / roti" }).first();
}

async function addRoti(page, { times = 1 } = {}) {
  const add = rotiRow(page).locator('[data-testid^="food-add-"]');
  await add.waitFor({ timeout: 30_000 });
  for (let i = 0; i < times; i += 1) {
    await add.click();
    await page.waitForTimeout(900);
  }
}

function reseed() {
  if (process.env.SKIP_RESEED === "1") return;
  execFileSync("pnpm", ["db:reseed"], { cwd: API_DIR, stdio: "ignore" });
}

function reseedDinnerOpen() {
  if (process.env.SKIP_RESEED === "1") return;
  reseed();
  execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "fitbud",
      "--local",
      "--persist-to",
      ".wrangler/state",
      "--command",
      "UPDATE meal_assignments SET window_starts_at = '2026-11-18T12:00:00.000Z' " +
        "WHERE meal_name = 'Dinner' AND local_date = '2026-11-18' " +
        "AND coaching_relationship_id IN (SELECT id FROM coaching_relationships " +
        "WHERE trainee_user_id = (SELECT id FROM users WHERE firebase_uid = 'demo-aarav.ontrack@demo.fitbud.test'))",
    ],
    { cwd: API_DIR, stdio: "ignore" },
  );
}

/**
 * Expo-web harness workaround, not app behaviour. In the Something different
 * sheet the sub-screens (Changed the portion, Ate out) are given
 * `{ flex: 0, height }` so they keep a real height inside BottomSheet's
 * flexGrow:0 ScrollView (Z11b-5). React Native's Yoga reads `flex: 0` as "no
 * flex"; react-native-web writes CSS `flex: 0`, which is `0 1 0%`, and that
 * flex-basis wins over `height`, so the sub-screen collapses to 0 on web. The
 * "-raw" shots show the collapse; the main TR-08b and TR-08c shots add this
 * rule to show the layout the native engine gives (height as computed in the
 * component: min(520, max(320, 0.75 x window height)) = 520).
 */
const SHEET_HEIGHT_HARNESS =
  '[data-testid="something-different-subscreen"] { flex: 0 0 auto !important; height: 520px !important; }';

async function openPortion(page) {
  await openSomethingDifferent(page, { fakeClock: true });
  await page.getByRole("button", { name: "Changed the portion" }).click();
  await waitText(page, "Save portion");
}

async function openAteOut(page) {
  await openSomethingDifferent(page, { fakeClock: true });
  await page.getByRole("button", { name: "Ate out" }).click();
  await page.getByTestId("something-different-subscreen").waitFor({ state: "attached", timeout: 15_000 });
}

const SHOTS = {
  "TR-08a": async (page) => {
    await openSomethingDifferent(page, { fakeClock: true });
    await page.waitForTimeout(500);
  },
  "TR-08b": async (page) => {
    await openPortion(page);
    await page.addStyleTag({ content: SHEET_HEIGHT_HARNESS });
    await waitText(page, "Reset to plan");
    await page.getByRole("button", { name: /^More / }).first().click();
    await page.waitForTimeout(500);
  },
  "TR-08b-raw": async (page) => {
    await openPortion(page);
    await page.waitForTimeout(500);
  },
  "TR-08c": async (page) => {
    await openAteOut(page);
    await page.addStyleTag({ content: SHEET_HEIGHT_HARNESS });
    await waitText(page, "kcal");
    await page.getByTestId("ate-out-note").fill("Office party · biryani and gulab jamun");
    await page.getByTestId("ate-out-kcal").fill("1120");
    await page.waitForTimeout(600);
  },
  "TR-08c-raw": async (page) => {
    await openAteOut(page);
    await page.waitForTimeout(600);
  },
  "TR-26a": async (page) => {
    await openFoodSearch(page);
  },
  "TR-26b": async (page) => {
    await openFoodSearch(page);
    await searchFor(page, "roti");
    await waitText(page, "Results");
    await addRoti(page, { times: 2 });
    await waitText(page, "In this log · ");
  },
  "TR-26c": async (page) => {
    await openFoodSearch(page);
    await page.locator('[data-testid^="food-row-"]', { hasText: "Kala chana curry" }).getByText("Kala chana curry").first().click();
    await waitText(page, "Unit");
    await waitText(page, "Add to ");
    await page.waitForTimeout(800);
  },
  "TR-26d": async (page) => {
    await openFoodSearch(page);
    await page.context().setOffline(true);
    await searchFor(page, "ragi dosa");
    await waitText(page, "No foods match");
    await waitText(page, "Log as Ate out");
    await page.waitForTimeout(800);
  },
  "TR-26e": async (page) => {
    await openFoodSearch(page);
    await searchFor(page, "Ragi dosa");
    await waitText(page, "No foods match");
    await page.getByRole("button", { name: /^Create / }).click();
    await page.getByTestId("custom-food-screen").waitFor({ timeout: 15_000 });
    await waitText(page, "Save to my foods");
    await page.getByTestId("custom-protein").fill("3");
    await page.getByTestId("custom-carbs").fill("22");
    await page.getByTestId("custom-kcal").fill("120");
    await page.waitForTimeout(500);
  },
  "TR-26f": async (page) => {
    reseedDinnerOpen();
    await openFoodSearch(page, { fakeClock: false });
    await searchFor(page, "roti");
    await waitText(page, "Results");
    await addRoti(page);
    await waitText(page, "In this log · 1");
    await page.getByTestId("food-log-save").click();
    await waitText(page, " saved · ", 30_000);
    await waitText(page, "Logged myself");
    await page.getByText("Logged myself").first().scrollIntoViewIfNeeded();
  },
};

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const results = [];
for (const theme of ["light", "dark"]) {
  for (const [id, run] of Object.entries(SHOTS)) {
    if (only.size && !only.has(id)) continue;
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await context.newPage();
    try {
      await run(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${id}-${theme}-web.png`) });
      results.push(`${id} ${theme} ok`);
    } catch (err) {
      results.push(`${id} ${theme} FAILED: ${String(err).split("\n")[0]}`);
      await page.screenshot({ path: join(OUT, `failed-${id}-${theme}.png`) }).catch(() => {});
    }
    await context.close();
    if (id === "TR-26f") reseed();
  }
}
await browser.close();
console.log(results.join("\n"));
