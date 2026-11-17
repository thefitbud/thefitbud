/**
 * Z12-4 visual captures: 141–143 at 1440×900, 196 at 768×1024.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-4/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

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

  // --- Desktop 1440×900: form / success / reactivate ---
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page);

    // 141 form
    await page.goto(`${BASE}/clients/add`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("add-client-form").waitFor({ state: "visible" });
    await page.getByLabel(/^Client name$/i).fill("Kriti Malhotra");
    await page.getByLabel(/^Email$/i).fill("kriti.malhotra@gmail.com");
    await page.getByPlaceholder(/98765/i).fill("9930012458");
    await page.waitForTimeout(400);
    await capture(page, "141-trainer-web-add-client-web", {
      width: 1440,
      height: 900,
    });

    // 142 success — create a fresh invite
    const stamp = Date.now();
    await page.getByLabel(/^Client name$/i).fill(`Kriti Capture ${stamp}`);
    await page
      .getByLabel(/^Email$/i)
      .fill(`kriti.capture.${stamp}@demo.fitbud.test`);
    await page.getByPlaceholder(/98765/i).fill("9930012459");
    await page.getByRole("button", { name: /^Create invite$/i }).click();
    await page.getByTestId("invite-share-card").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.waitForTimeout(300);
    await capture(page, "142-trainer-web-add-client-success-web", {
      width: 1440,
      height: 900,
    });

    // 143 reactivate — Kavya ended
    await page.getByRole("button", { name: /Invite another client/i }).click();
    await page.getByTestId("add-client-form").waitFor({ state: "visible" });
    await page.getByLabel(/^Client name$/i).fill("Kavya Nair");
    await page.getByLabel(/^Email$/i).fill("kavya.ended@demo.fitbud.test");
    await page.getByRole("button", { name: /^Create invite$/i }).click();
    await page.getByTestId("reactivate-client-link").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.waitForTimeout(300);
    await capture(page, "143-trainer-web-add-client-reactivate-web", {
      width: 1440,
      height: 900,
    });

    await context.close();
  }

  // --- iPad portrait 768×1024: clients shell ---
  {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto(`${BASE}/clients`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("screen-TW-06").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.getByTestId("shell-menu-btn").waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    await capture(page, "196-ipad-clients-ipad-portrait", {
      width: 768,
      height: 1024,
    });
    await context.close();
  }

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
