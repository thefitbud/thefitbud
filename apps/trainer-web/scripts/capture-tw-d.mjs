/**
 * Capture TW-D evidence screenshots for docs/spec/evidence/TW-D/
 * Run: SKIP_E2E_API_BOOT=1 node scripts/capture-tw-d.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";
const AARAV = "3f3a0c5e-8d2a-4b1f-9c6e-1a2b3c4d5e6f"; // may need lookup

const OUT = path.resolve("/workspace/docs/spec/evidence/TW-D");
const ART = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(ART, name));
  console.log("saved", name);
}

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 45_000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await signIn(page);

  // Resolve Aarav id from roster if hardcoded UUID wrong
  let aaravId = AARAV;
  await page.goto(`${BASE}/clients`);
  await page.waitForTimeout(800);
  const aaravLink = page.getByRole("link", { name: /Aarav/i }).first();
  if (await aaravLink.count()) {
    const href = await aaravLink.getAttribute("href");
    const m = href?.match(/\/clients\/([0-9a-f-]{36})/i);
    if (m) aaravId = m[1];
  }
  console.log("aaravId", aaravId);

  // TW-C leftovers
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/clients/${ROHAN}/overview`);
  await page.getByTestId("screen-TW-09a").waitFor({ state: "visible", timeout: 20_000 });
  await shot(page, "TW-C-next-checkin-rohan.png");
  await shot(page, "TW-C-header-renewal-avatar.png");

  await page.goto(`${BASE}/clients/${aaravId}/overview`);
  await page.waitForTimeout(1200);
  await shot(page, "TW-C-aarav-nutrition.png");

  await page.goto(`${BASE}/clients/${KAVYA}/overview`);
  await page.waitForTimeout(1000);
  await shot(page, "TW-C-kavya-ended.png");

  // TW-12 plan
  await page.goto(`${BASE}/clients/${ROHAN}/plan`);
  await page.getByTestId("screen-TW-12").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-12.png");

  for (const [w, h, name] of [
    [1280, 900, "TW-12-1280.png"],
    [768, 1024, "TW-12-768.png"],
    [390, 844, "TW-12-390.png"],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(400);
    await shot(page, name);
  }

  // Offline state
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/clients/${ROHAN}/plan`);
  await page.getByTestId("screen-TW-12").waitFor({ state: "visible" });
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "TW-12--offline.png");
  await context.setOffline(false);

  // Prefer Continue editing when a draft banner exists
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/clients/${ROHAN}/plan`);
  await page.getByTestId("screen-TW-12").waitFor({ state: "visible" });
  const cont = page.getByRole("link", { name: /Continue editing/i }).first();
  const adjust = page.getByRole("button", { name: /Adjust plan/i }).first();
  if (await cont.count()) {
    await cont.click();
  } else {
    await adjust.click();
  }
  await page.waitForURL(/\/edit/, { timeout: 45_000 });
  await page.waitForTimeout(1200);
  await shot(page, "TW-13.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await shot(page, "TW-13-390.png");

  await page.setViewportSize({ width: 1440, height: 900 });
  const editUrl = page.url().split("?")[0];
  const nutritionUrl = `${editUrl}?tab=nutrition`;
  await page.goto(nutritionUrl);
  await page.waitForTimeout(1200);
  await shot(page, "TW-14.png");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await shot(page, "TW-14-390.png");

  // Publish modal TW-16 (+ TW-15 diet scope on nutrition tab)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(nutritionUrl);
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Publish/i }).first().click();
  await page.getByTestId("screen-TW-16").waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(800);
  await shot(page, "TW-16.png");
  await shot(page, "TW-15.png");

  // Deepak timezone badge on assign
  await page.keyboard.press("Escape").catch(() => {});
  await page.goto(`${BASE}/clients/${DEEPAK}/plan`);
  await page.getByTestId("screen-TW-12").waitFor({ state: "visible", timeout: 20_000 });
  const contD = page.getByRole("link", { name: /Continue editing/i }).first();
  const adjD = page.getByRole("button", { name: /Adjust plan/i }).first();
  if (await contD.count()) await contD.click();
  else if (await adjD.isVisible().catch(() => false)) await adjD.click();
  await page.waitForURL(/\/edit/, { timeout: 45_000 }).catch(() => {});
  const pub2 = page.getByRole("button", { name: /Publish/i }).first();
  if (await pub2.isVisible().catch(() => false)) {
    await pub2.click();
    await page.getByTestId("screen-TW-16").waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "TW-16--deepak-tz.png");
  }

  // Error state on plan tab
  await page.goto(`${BASE}/clients/${ROHAN}/plan`);
  await page.route("**/api/plans/**", (route) => route.abort());
  await page.route("**/plans/relationships/**", (route) => route.abort());
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  await shot(page, "TW-12--error.png");
  await page.unroute("**/api/plans/**");
  await page.unroute("**/plans/relationships/**");

  // Empty state: use query capture if page supports it, else mark via ended read-only
  await page.goto(`${BASE}/clients/${KAVYA}/plan`);
  await page.waitForTimeout(1000);
  await shot(page, "TW-12--ended-readonly.png");

  await browser.close();
  console.log("done", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
