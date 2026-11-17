/**
 * Z12-6 visual captures: 03, 03-full, 03b at 1440×900; 192 at 1024×768.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-6/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";

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

async function capture(page, name, { fullPage = false } = {}) {
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  const file = join(OUT, `${name}-${vp.width}x${vp.height}.png`);
  await page.screenshot({ path: file, fullPage });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-${vp.width}x${vp.height}.txt`), text.slice(0, 5000));
  console.log("wrote", file);
}

async function waitOverview(page) {
  await page.getByTestId("screen-TW-09").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("heading", { name: /This week|Week \d+/i }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  // Week strip + side cards settle.
  await page.waitForTimeout(1500);
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

  // --- 03 current week ---
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "domcontentloaded",
  });
  await waitOverview(page);
  await capture(page, "03-trainer-web-client-rohan");

  // --- 03-full ---
  await capture(page, "03-trainer-web-client-rohan-full", { fullPage: true });

  // --- 03b previous week ---
  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByRole("heading", { name: /^Week \d+$/ }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "This week" }).waitFor({
    state: "visible",
    timeout: 10_000,
  });
  await page.waitForTimeout(1200);
  // Select a mid-week day when present (frame 03b selects Wed).
  const wed = page.getByRole("button", { name: /^Wed / });
  if ((await wed.count()) > 0) {
    await wed.first().click();
    await page.waitForTimeout(400);
  }
  await capture(page, "03b-trainer-web-client-overview-prev-week");

  // --- 192 iPad ---
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByRole("button", { name: "This week" }).click();
  await page.getByRole("heading", { name: "This week" }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.waitForTimeout(1200);
  await capture(page, "192-ipad-client-ipad");

  await browser.close();
  console.log("Z12-6 captures done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
