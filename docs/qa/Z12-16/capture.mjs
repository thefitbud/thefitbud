/**
 * Z12-16 visual captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-16/capture.mjs
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

async function openAskRow(page, namePattern) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-32-section").waitFor({ state: "visible", timeout: 30_000 });
  const row = page
    .getByTestId("screen-TW-32-section")
    .locator(".home-li")
    .filter({ hasText: namePattern })
    .first();
  await row.waitFor({ state: "visible", timeout: 20_000 });
  await row.click();
  await page.getByTestId("screen-TW-32").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Mark done" }).waitFor({ state: "visible" });
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

  // Frame 182 — portion / Asked coach (Ishita's lunch ask).
  await openAskRow(page, /Ishita.*Lunch|Ishita Banerjee asked about Lunch/i);
  const drawer = page.getByTestId("screen-TW-32");
  await drawer.getByText("Portion size", { exact: true }).waitFor({ state: "visible" });
  await drawer.getByText(/From her meal log/).waitFor({ state: "visible" });
  await capture(page, "182-trainer-web-asked-drawer-web");

  // Frame 183 — pain topic (Rajesh's seeded workout ask).
  await page.keyboard.press("Escape");
  await page.getByTestId("screen-TW-32").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await openAskRow(page, /Rajesh|Strength A|Pain/i);
  const painDrawer = page.getByTestId("screen-TW-32");
  await painDrawer.locator(".cad-pain").waitFor({ state: "visible", timeout: 20_000 });
  await painDrawer.getByText(/From (his|her|their) workout log/).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await painDrawer.getByText(/Dumbbell Squat|Walking lunge| x /).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await capture(page, "183-trainer-web-asked-pain-web");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
