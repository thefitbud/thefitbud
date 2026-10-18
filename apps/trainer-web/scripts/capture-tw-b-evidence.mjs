/**
 * Capture TW-B evidence screenshots into docs/spec/evidence/TW-B/
 * Viewport 1440×900 (and 390×844 / 768 where required).
 */
import { mkdir, readFile, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = join(ROOT, "docs/spec/evidence/TW-B");
const MOCKUP = join(ROOT, "docs/spec/mockups/png");
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const NOVA = "nova.coach@demo.fitbud.test";
const ANITA = "06b54e81-016c-4220-a9a8-31195324669b";

async function signIn(page, email = EMAIL, password = PASSWORD) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 45_000,
  });
}

async function shot(page, name, { fullPage = false } = {}) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage });
  console.log("wrote", path);
  return path;
}

async function sideBySide(browser, leftPath, rightPath, outName) {
  const out = join(OUT, outName);
  const leftB64 = (await readFile(leftPath)).toString("base64");
  const rightB64 = (await readFile(rightPath)).toString("base64");
  const html = `<!doctype html><html><body style="margin:0;background:#e8e6ef;display:flex;gap:24px;align-items:flex-start;padding:12px">
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Implemented</div><img id="l" src="data:image/png;base64,${leftB64}" style="display:block;max-width:1440px;height:auto"/></div>
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Mockup</div><img id="r" src="data:image/png;base64,${rightB64}" style="display:block;max-width:1440px;height:auto"/></div>
</body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 3000, height: 2000 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.waitForFunction(() => {
    const l = document.getElementById("l");
    const r = document.getElementById("r");
    return l?.complete && r?.complete && l.naturalHeight > 0 && r.naturalHeight > 0;
  });
  const box = await p.evaluate(() => ({
    width: document.body.scrollWidth + 24,
    height: document.body.scrollHeight + 24,
  }));
  await p.setViewportSize({
    width: Math.min(box.width, 4000),
    height: Math.min(Math.max(box.height, 900), 8000),
  });
  await p.screenshot({ path: out, fullPage: true });
  await ctx.close();
  console.log("wrote", out);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const signInPath = await shot(page, "TW-01");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "TW-01-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${BASE}/sign-in/code`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "TW-01--code");

  await page.goto(`${BASE}/forgot-password`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await shot(page, "TW-01--forgot");

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(800);
  await shot(page, "TW-01--error");

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await shot(page, "TW-01--offline");
  await context.setOffline(false);
  await page.waitForTimeout(300);

  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(
    "sneha.review@demo.fitbud.test",
  );
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, "TW-01--trainee-gate");

  // next= redirect chrome (signed-out destination)
  await context.clearCookies();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await page.goto(`${BASE}/clients?q=rohan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "TW-01--next");

  // Sign in as rahul for API-down + app screens
  await signIn(page);
  await page.route("**/me", (route) => route.abort("failed"));
  await page.route("**/api/me", (route) => route.abort("failed"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await shot(page, "TW-01--api-down");
  await page.unroute("**/me");
  await page.unroute("**/api/me");

  await context.clearCookies();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  await signIn(page);

  // TW-02 via capture (nova may already be completed in e2e)
  await page.goto(`${BASE}/welcome?capture=welcome`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "TW-02");
  await page.getByRole("button", { name: /^continue$/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, "TW-02--step2");
  await page.getByRole("button", { name: /^continue$/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, "TW-02--step3");

  // TW-06
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-06").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-06");

  await page.setViewportSize({ width: 768, height: 900 });
  await page.waitForTimeout(400);
  await shot(page, "TW-06-768");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-06-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${BASE}/clients?status=ended`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-06--ended");

  await page.goto(`${BASE}/clients?q=zzzz-no-match`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-06--empty-filter");

  // TW-07 form + duplicate + reactivate + share
  await page.goto(`${BASE}/clients/add`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-07").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(400);
  await shot(page, "TW-07");

  await page.getByLabel(/client name/i).fill("Anita Desai");
  await page.getByLabel(/^email$/i).fill("anita.invite@demo.fitbud.test");
  await page.getByRole("button", { name: /create invite/i }).click();
  await page.waitForTimeout(800);
  await shot(page, "TW-07--duplicate");

  await page.getByLabel(/client name/i).fill("Kavya Menon");
  await page.getByLabel(/^email$/i).fill("kavya.ended@demo.fitbud.test");
  await page.getByRole("button", { name: /create invite/i }).click();
  await page.waitForTimeout(800);
  await shot(page, "TW-07--reactivate");

  const stamp = Date.now();
  await page.getByLabel(/client name/i).fill(`Capture ${stamp}`);
  await page.getByLabel(/^email$/i).fill(`capture.${stamp}@demo.fitbud.test`);
  await page.getByPlaceholder(/98765/i).fill("9876500123");
  await page.getByRole("button", { name: /create invite/i }).click();
  await page.getByTestId("invite-share-card").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: /^qr code$/i }).click();
  await page.waitForTimeout(400);
  await shot(page, "TW-07--share");

  // TW-08 — use Anita if still pending; otherwise first invited row
  await page.goto(`${BASE}/invitations/${ANITA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  if (await page.getByTestId("screen-TW-08").count()) {
    await shot(page, "TW-08");
    if (await page.getByRole("button", { name: /copy new link/i }).count()) {
      await page.getByRole("button", { name: /copy new link/i }).click();
      await page.waitForTimeout(300);
      await shot(page, "TW-08--reissue-confirm");
      await page.getByRole("button", { name: /cancel/i }).click().catch(() => {});
    }
    if (await page.getByRole("button", { name: /more actions/i }).count()) {
      await page.getByRole("button", { name: /more actions/i }).click();
      await page.getByRole("menuitem", { name: /revoke invite/i }).click();
      await page.waitForTimeout(300);
      await shot(page, "TW-08--revoke-confirm");
    }
  }

  // Natural first-run (nova) if still empty-profile
  await context.clearCookies();
  await page.evaluate(() => {
    sessionStorage.clear();
    localStorage.clear();
  });
  try {
    await signIn(page, NOVA, PASSWORD);
    if (page.url().includes("/welcome")) {
      await shot(page, "TW-02--first-run");
      await page.getByLabel(/display name/i).fill("Nova Coach");
      await page.getByPlaceholder(/98765/i).fill("9876500999");
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: /^continue$/i }).click();
      await page.waitForTimeout(400);
      await page.getByRole("button", { name: /skip for now/i }).click();
      await page.waitForTimeout(400);
      await shot(page, "TW-02--finish");
    }
  } catch (err) {
    console.warn("nova first-run capture skipped", err);
  }

  try {
    await copyFile(
      join(MOCKUP, "01-trainer-web-signin.png"),
      join(OUT, "mockup-01-trainer-web-signin.png"),
    );
    await sideBySide(
      browser,
      signInPath,
      join(OUT, "mockup-01-trainer-web-signin.png"),
      "TW-01-side-by-side.png",
    );
  } catch (err) {
    console.warn("side-by-side failed", err);
  }

  await browser.close();
  console.log("TW-B evidence capture complete");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
