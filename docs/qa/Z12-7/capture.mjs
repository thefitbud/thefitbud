/**
 * Z12-7 visual captures: 146, 147, 188, 189 at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-7/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const SNEHA = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const VIKRAM = "2fe7a6d8-4c61-443d-9614-18b4210186ee";
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

async function capture(page, name) {
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  const file = join(OUT, `${name}-${vp.width}x${vp.height}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-${vp.width}x${vp.height}.txt`), text.slice(0, 5000));
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

  // --- 146 intake submitted (Sneha) ---
  await page.goto(`${BASE}/clients/${SNEHA}/onboarding`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-10").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("button", { name: /Mark ready & configure/i }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(1200);
  await capture(page, "146-trainer-web-intake-review-web");

  // --- 147 intake not submitted (Vikram) ---
  await page.goto(`${BASE}/clients/${VIKRAM}/onboarding`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-10").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText(/hasn't submitted/i).waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);
  await capture(page, "147-trainer-web-intake-not-submitted-web");

  // --- 188 note composer ---
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-09").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("button", { name: /^Add note$/i }).click();
  await page.getByTestId("screen-TW-34").waitFor({ state: "visible", timeout: 20_000 });
  const composer = page.getByTestId("screen-TW-34");
  await composer.locator("textarea").fill(
    "Move Tuesday's session to 6:30 am for the next 4 weeks. Late meetings Tue—Fri.",
  );
  await composer.getByText(/About · optional/i).waitFor({ state: "visible" });
  await page.waitForTimeout(1000);
  await capture(page, "188-trainer-web-note-composer-web");

  // --- 189 note delete confirm ---
  const deleteBtn = composer.getByRole("button", { name: /^Delete$/i }).first();
  if ((await deleteBtn.count()) > 0) {
    await deleteBtn.click();
    await page.getByText("Delete this note?").waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(600);
    await capture(page, "189-trainer-web-note-delete-web");
  } else {
    console.warn("no earlier note Delete button — skipping 189");
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
