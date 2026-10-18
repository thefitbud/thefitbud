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
const ANITA = "06b54e81-016c-4220-a9a8-31195324669b";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
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

  // TW-01 signed-out states
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  // Clear prefilled DEV fields for a cleaner mockup match optional — keep for realism
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

  // Wrong password
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(800);
  await shot(page, "TW-01--error");

  // Offline (navigate first, then cut network so the page stays mounted)
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await shot(page, "TW-01--offline");
  await context.setOffline(false);
  await page.waitForTimeout(300);

  // Trainee gate
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(
    "sneha.review@demo.fitbud.test",
  );
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, "TW-01--trainee-gate");

  // Sign in as rahul
  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
  await signIn(page);

  // TW-02
  await page.goto(`${BASE}/welcome?capture=welcome`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "TW-02");
  await page.getByRole("button", { name: /^continue$/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "TW-02--step2").catch(() => {});

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

  // TW-07
  await page.goto(`${BASE}/clients/add`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-07").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(page, "TW-07");

  // TW-08
  await page.goto(`${BASE}/invitations/${ANITA}`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-08").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-08");

  try {
    await copyFile(join(MOCKUP, "01-trainer-web-signin.png"), join(OUT, "mockup-01-trainer-web-signin.png"));
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
