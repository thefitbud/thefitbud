/**
 * Z14-13b Expo-web check of the 24 h edit frames on the local seeded API:
 * TR-07m4 (just-logged card with Add photo / Edit), TR-07n (logged sheet),
 * TR-07n2 (Change this log), TR-07n3 (remove confirm), TR-07n4 (Edit portion),
 * TR-07n5 (Edit ate out), TR-07n6 (saved toast), TR-07n7 (locked after 24 h)
 * and TR-07n8 (edit while offline), at 393x852 and 360x800, light and dark.
 *
 * The seed's meal windows are clock-relative, so the script opens the unlogged
 * meal's window around now in the assignments response; every
 * log and edit then runs against the real local API (a removal is only taken
 * to its confirm and kept). TR-07n7 is the same screen with the server's
 * `editableUntil` set to null (what the API sends once 24 hours have passed).
 * Expo web has no native keyboard and no safe-area insets.
 *
 * Each size/theme run needs a freshly seeded API (`pnpm db:reseed` with the
 * API stopped), because it logs the same meals; SIZE and THEME pick one run.
 *
 * Usage (API on 8793 and `expo start --web` on 8083 already running):
 *   CAPTURE_EMAIL=fatima.london@demo.fitbud.test CAPTURE_TZ_OFFSET_H=0 \
 *   EXPO_WEB_URL=http://127.0.0.1:8083 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   node docs/qa/Z14-13b/web-capture.mjs
 *
 * Writes `<screen ID>-<WxH>-<theme>-web.png` next to this file.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8083";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = process.env.CAPTURE_EMAIL ?? "aarav.ontrack@demo.fitbud.test";
const TZ_OFFSET_MS = Number(process.env.CAPTURE_TZ_OFFSET_H ?? 5.5) * 3600_000;
const PASSWORD = "FitBud-demo-2026";
const SIZES = [
  { width: 393, height: 852 },
  { width: 360, height: 800 },
];

async function shot(page, id, size, theme) {
  await page.waitForTimeout(800);
  const file = join(OUT, `${id}-${size.width}x${size.height}-${theme}-web.png`);
  await page.screenshot({ path: file });
  console.log("wrote", file);
}

function installRewrite(page, state) {
  return page.route("**/meals/relationships/*/assignments*", async (route) => {
    const headers = { ...route.request().headers() };
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
    const response = await route.fetch({ headers });
    const body = await response.json();
    const today = new URL(route.request().url()).searchParams.get("fromDate");
    if (today !== new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10)) {
      return route.fulfill({ response, json: body });
    }
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const items = (body.data ?? body).items ?? [];
    // The first two meals the server still has unlogged open around now.
    items
      .filter((item) => !item.compliance)
      .slice(0, 2)
      .forEach((item, index) => {
        item.windowStartsAt = iso(now - (45 - index * 10) * 60_000);
        item.windowEndsAt = iso(now + (45 + index * 10) * 60_000);
        item.photoRequired = false;
      });
    for (const item of items) {
      if (!item.compliance) continue;
      // The seed's meal windows are long past on the server, so it sends
      // canRemove false; the capture shows the open-window state (the confirm
      // is kept, never sent).
      item.compliance.canRemove = !state.locked;
      if (state.locked) item.compliance.editableUntil = null;
    }
    await route.fulfill({ response, json: body });
  });
}

async function openDiet(page) {
  await page.getByText(/kcal (left|over)/).first().waitFor({ timeout: 60_000 });
  await page.getByText("Diet", { exact: true }).last().click();
  await page.getByText(/kcal eaten/).locator("visible=true").first().waitFor({ timeout: 30_000 });
}

async function run(size, theme) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  globalThis.__page = page;
  const state = { locked: false };
  await installRewrite(page, state);

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const email = page.getByLabel(/mobile number or email/i).first();
  await email.waitFor({ timeout: 90_000 });
  await email.fill(EMAIL);
  await page.getByLabel(/^password$/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await openDiet(page);

  // Log the first due meal as planned (meal A).
  const focus = page.getByTestId("diet-focus-meal").first();
  await focus.waitFor({ timeout: 30_000 });
  const nameA = (await focus.innerText())
    .split("\n")[0]
    .replace(/\s+\d{1,2}:\d{2}\s?[ap]m.*$/i, "")
    .trim();
  console.log("meal A:", nameA);
  await page.getByRole("button", { name: "Eaten as planned" }).first().click();
  await page.getByTestId("meal-edit-actions").first().waitFor({ timeout: 40_000 });
  await page.waitForTimeout(6000); // the saved toast leaves
  // TR-07m4
  await shot(page, "TR-07m4", size, theme);

  // TR-07n: the logged sheet.
  await page.getByRole("button", { name: `${nameA}, logged` }).first().click();
  await page.getByTestId("logged-meal-edit").waitFor({ timeout: 15_000 });
  await shot(page, "TR-07n", size, theme);

  // TR-07n2: Change this log.
  await page.getByTestId("logged-meal-edit").click();
  await page.getByRole("button", { name: "Changed the portion" }).waitFor({ timeout: 20_000 });
  await shot(page, "TR-07n2", size, theme);

  // TR-07n3: the remove confirm, kept.
  await page.getByTestId("meal-remove-log").click();
  await page.getByTestId("remove-log-confirm").waitFor({ timeout: 10_000 });
  await shot(page, "TR-07n3", size, theme);
  await page.getByTestId("remove-log-confirm-keep").click();
  await page.getByTestId("remove-log-confirm").waitFor({ state: "hidden", timeout: 10_000 });

  // Changed portion, saved as an edit: TR-07n6 (toast). Meal A's card then
  // opens Edit portion prefilled: TR-07n4.
  await page.getByRole("button", { name: "Changed the portion" }).click();
  await page.getByText("Edit portion").first().waitFor({ timeout: 10_000 });
  await page.getByRole("button", { name: /^More / }).first().click();
  await page.getByRole("button", { name: "Save changes" }).last().click();
  await page.getByText(/updated · .* sees the change/).first().waitFor({ timeout: 30_000 });
  await shot(page, "TR-07n6", size, theme);
  await page.getByTestId("meal-edited-tag").first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(6000);
  await page.getByTestId("meal-edit").first().click();
  await page.getByText("Edit portion").first().waitFor({ timeout: 15_000 });
  await shot(page, "TR-07n4", size, theme);
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.getByText("Edit portion").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);

  // The seed's first meal (changed, not a portion entry): Change this log, then
  // Ate out saved as an edit; its Edit then opens Edit ate out (TR-07n5), and
  // the same screen offline (TR-07n8).
  const openFirstLogged = async () => {
    await page.getByRole("button", { name: /, logged$/ }).first().click();
    await page.getByTestId("logged-meal-edit").waitFor({ timeout: 15_000 });
    await page.getByTestId("logged-meal-edit").click();
  };
  await openFirstLogged();
  await page.getByRole("button", { name: "Ate out" }).click();
  await page.getByTestId("ate-out-kcal").first().fill("640");
  await page.getByTestId("ate-out-save").click();
  await page.getByText(/updated · .* sees the change/).first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(6000);
  await openFirstLogged();
  await page.getByText("Edit ate out").first().waitFor({ timeout: 15_000 });
  await shot(page, "TR-07n5", size, theme);
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.getByText("Edit ate out").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await openFirstLogged();
  await page.getByText("Edit ate out").first().waitFor({ timeout: 15_000 });
  await page.getByText(/Your change saves on your phone/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await shot(page, "TR-07n8", size, theme);
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.getByText("Edit ate out").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  // TR-07n7: the same entry once the server says the 24 hours have passed.
  state.locked = true;
  // A day read less than 30 s ago is not read again; wait it out, then reload.
  await page.waitForTimeout(31_000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await openDiet(page);
  await page.getByRole("button", { name: `${nameA}, logged` }).first().click();
  await page.getByTestId("logged-meal-locked").waitFor({ timeout: 30_000 });
  await shot(page, "TR-07n7", size, theme);
  await browser.close();
}

// SIZE=393x852 THEME=light runs one combination (each needs a fresh seed).
for (const size of SIZES) {
  for (const theme of ["light", "dark"]) {
    if (process.env.SIZE && process.env.SIZE !== `${size.width}x${size.height}`) continue;
    if (process.env.THEME && process.env.THEME !== theme) continue;
    try {
      await run(size, theme);
    } catch (err) {
      await globalThis.__page?.screenshot({ path: join(OUT, "failed.png") }).catch(() => undefined);
      throw err;
    }
  }
}
