/**
 * Z12-15 visual captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-15/capture.mjs
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

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await signIn(page);

  await page.goto(`${BASE}/settings/profile`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-28").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("button", { name: "Save changes" }).waitFor({ state: "visible" });
  await capture(page, "176-trainer-web-settings-profile-web");

  await page.goto(`${BASE}/settings/notifications`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-29").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByText("Quiet hours").waitFor({ state: "visible" });
  await capture(page, "177-trainer-web-settings-notifications-web");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
