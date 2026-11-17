/**
 * Z12-8 visual captures (frames 158, 159, 163, 164, 198).
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-8/capture.mjs
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
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
/** Seed: Rohan reviewed check-in (frame 164). */
const ROHAN_REVIEWED = "744e2975-255c-4469-9f9a-6da0a853c8f2";
/** Seed: Deepak submitted, not yet reviewed (frames 163 / 198). */
const DEEPAK_UNREVIEWED = "c97267fc-a719-4daf-b7f5-1f91d8e8e80d";

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

async function capture(page, name, viewport) {
  const suffix = `${viewport.width}x${viewport.height}`;
  const file = join(OUT, `${name}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-${suffix}.txt`), text.slice(0, 5000));
  console.log("wrote", file);
}

async function openCheckin(page, relationshipId, checkinId) {
  await page.goto(`${BASE}/clients/${relationshipId}/check-ins/${checkinId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-20").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByRole("heading", { name: "Your review" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // 158 + 159 at 1440×900
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page);

    await page.goto(`${BASE}/clients/${ROHAN}/activity?type=meal&range=this_week`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("screen-TW-17").waitFor({ state: "visible", timeout: 20_000 });
    await page.getByRole("heading", { name: /Meals ·/i }).waitFor({
      state: "visible",
      timeout: 20_000,
    });
    await capture(page, "158-trainer-web-activity-web", { width: 1440, height: 900 });

    const viewBtn = page.getByRole("button", { name: /^View$/ }).nth(1);
    if (await viewBtn.isVisible().catch(() => false)) {
      await viewBtn.click();
      await page.getByTestId("activity-drawer").waitFor({ state: "visible", timeout: 15_000 });
      await page.getByTestId("meal-panel").waitFor({ state: "visible", timeout: 15_000 });
      await page.waitForTimeout(400);
      await capture(page, "159-trainer-web-activity-meal-panel-web", {
        width: 1440,
        height: 900,
      });
    } else {
      console.warn("159: no View button; skipped meal panel capture");
    }

    await openCheckin(page, DEEPAK, DEEPAK_UNREVIEWED);
    await capture(page, "163-trainer-web-checkin-review-web", {
      width: 1440,
      height: 900,
    });

    await openCheckin(page, ROHAN, ROHAN_REVIEWED);
    await capture(page, "164-trainer-web-checkin-reviewed-web", {
      width: 1440,
      height: 900,
    });

    await context.close();
  }

  // 198 iPad
  {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page);
    await openCheckin(page, DEEPAK, DEEPAK_UNREVIEWED);
    await capture(page, "198-ipad-checkin-review-ipad", { width: 1024, height: 768 });
    await context.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
