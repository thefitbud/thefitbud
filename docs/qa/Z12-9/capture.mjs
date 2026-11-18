/**
 * Z12-9 visual captures: 165 history + 190 search at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-9/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page
    .getByTestId("screen-TW-01")
    .waitFor({ state: "visible", timeout: 30_000 });
  await page
    .getByRole("textbox", { name: /mobile number or email/i })
    .fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function capture(page, name, viewport) {
  const file = join(OUT, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(
    join(OUT, `${name}-${viewport.width}x${viewport.height}.txt`),
    text.slice(0, 4000),
  );
  console.log("wrote", file);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await signIn(page);

  // 165 History
  await page.goto(`${BASE}/clients/${ROHAN}/history`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-21").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.locator(".history-timeline-item").first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  await capture(page, "165-trainer-web-history-web", {
    width: 1440,
    height: 900,
  });

  // 190 Search palette on Home with "ro"
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-03").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Search clients/i }).click();
  await page.getByTestId("shell-search-palette").waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await page.getByPlaceholder(/Search clients, templates, pages/i).fill("ro");
  await page.waitForTimeout(1200);
  await page
    .locator(".shell-palette-group-label")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(400);
  await capture(page, "190-trainer-web-search-web", {
    width: 1440,
    height: 900,
  });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
