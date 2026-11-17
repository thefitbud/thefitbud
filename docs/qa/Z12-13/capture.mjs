/**
 * Z12-13 visual captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-13/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 1440, height: 900 };

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

async function waitTable(page) {
  await page.getByTestId("screen-TW-23").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("columnheader", { name: "Template" }).waitFor({
    state: "visible",
    timeout: 30_000,
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

  // --- 168 Templates hub ---
  await page.goto(`${BASE}/templates`, { waitUntil: "domcontentloaded" });
  await waitTable(page);
  await page.getByText("FitBud base").first().waitFor({ state: "visible", timeout: 30_000 });
  // Allow plan detail summaries to fill (days · exercises).
  await page.waitForTimeout(2500);
  await capture(page, "168-trainer-web-templates-web");

  // --- 169 Mine empty (nutrition) — stub trainer nutrition to empty ---
  await page.route("**/templates?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("templateType") === "nutrition") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { items: [], nextCursor: null } }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`${BASE}/templates/diets?scope=mine`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("templates-mine-empty").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await capture(page, "169-trainer-web-templates-mine-empty-web");
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // --- 174 Use modal (FitBud base row; wait for client directory) ---
  await page.goto(`${BASE}/templates/workouts`, { waitUntil: "domcontentloaded" });
  await waitTable(page);
  await page.getByText("FitBud base").first().waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const baseRow = page.locator("tr").filter({ hasText: "FitBud base" }).first();
  await baseRow.getByRole("button", { name: /^Use$/ }).click();
  const useModal = page.getByTestId("use-template-modal");
  await useModal.waitFor({ state: "visible", timeout: 15_000 });
  await useModal.locator("select[aria-label='Client']").waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await page.waitForFunction(() => {
    const select = document.querySelector(
      '[data-testid="use-template-modal"] select',
    );
    return Boolean(select && select.options.length > 0);
  }, null, { timeout: 15_000 });
  await capture(page, "174-trainer-web-template-use-web");
  await useModal.getByLabel("Close").click();

  // --- 175 Fork modal ---
  await page.goto(`${BASE}/templates/workouts`, { waitUntil: "domcontentloaded" });
  await waitTable(page);
  await page.getByText("FitBud base").first().waitFor({ state: "visible", timeout: 20_000 });
  await page
    .locator("tr")
    .filter({ hasText: "FitBud base" })
    .first()
    .getByRole("button", { name: /More actions for/i })
    .click();
  await page.getByRole("menuitem", { name: /Make your own copy/i }).click();
  await page.getByTestId("fork-template-modal").waitFor({ state: "visible", timeout: 15_000 });
  await capture(page, "175-trainer-web-template-fork-web");

  await browser.close();
  console.log("Z12-13 captures done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
