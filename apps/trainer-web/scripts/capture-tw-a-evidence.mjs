/**
 * Capture TW-A evidence screenshots into docs/spec/evidence/TW-A/
 * Viewport 1440×900 (and 390×844 where required).
 */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = join(ROOT, "docs/spec/evidence/TW-A");
const MOCKUP = join(ROOT, "docs/spec/mockups/png");
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

const ROHAN_ACTIVE = "95af751f-156c-44ac-a945-ec30870134ae";
const MEERA_ACK = "f588b76a-62a3-42bb-bf85-0570ea52c9eb";
const RESOLVED = "fa80cb4f-f852-403e-9c91-318a9944f238";
const ASK_ISHITA = "b532e1ca-7fea-4563-8d50-4468bc66f586";
const PRIYA_CLIENT = "66bb4846-308b-4bb1-9e3f-c41f234cbbdf";
const MISSING_CLIENT = "00000000-0000-4000-8000-000000000000";

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
  const leftUrl = `data:image/png;base64,${leftB64}`;
  const rightUrl = `data:image/png;base64,${rightB64}`;
  const html = `<!doctype html><html><body style="margin:0;background:#e8e6ef;display:flex;gap:24px;align-items:flex-start;padding:12px">
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Implemented</div><img id="l" src="${leftUrl}" style="display:block;max-width:1440px;height:auto"/></div>
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Mockup</div><img id="r" src="${rightUrl}" style="display:block;max-width:1440px;height:auto"/></div>
</body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 3000, height: 2000 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.waitForFunction(() => {
    const l = document.getElementById("l");
    const r = document.getElementById("r");
    return l?.complete && r?.complete && l.naturalHeight > 0 && r.naturalHeight > 0;
  });
  const box = await p.evaluate(() => {
    const body = document.body;
    return { width: body.scrollWidth + 24, height: body.scrollHeight + 24 };
  });
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

  await signIn(page);

  // TW-03 shell on /checkins
  await page.goto(`${BASE}/checkins`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-03").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-03");

  // TW-03 long page sidebar fill
  await page.goto(`${BASE}/templates/libraries`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-03--long-page", { fullPage: true });

  // TW-03 command palette
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(400);
  const search = page.getByPlaceholder(/search|client|command/i).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill("roh");
    await page.waitForTimeout(500);
  }
  await shot(page, "TW-03--command-palette");
  await page.keyboard.press("Escape");

  // TW-03 bell
  const bell = page.getByRole("button", { name: /notification|bell/i }).first();
  if (await bell.isVisible().catch(() => false)) {
    await bell.click();
    await page.waitForTimeout(400);
    await shot(page, "TW-03--bell");
    await page.keyboard.press("Escape");
  }

  // TW-03 offline
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await shot(page, "TW-03--offline");
  await context.setOffline(false);
  await page.waitForTimeout(300);

  // TW-03 390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-03-390");

  // TW-03 icon rail ~1100
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`${BASE}/checkins`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "TW-03--icon-rail");

  // Restore desktop
  await page.setViewportSize({ width: 1440, height: 900 });

  // TW-04 Home
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-04").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(800);
  await shot(page, "TW-04");
  await shot(page, "TW-04-full", { fullPage: true });

  // Side-by-side with mockup
  try {
    await copyFile(
      join(MOCKUP, "02-trainer-web-home.png"),
      join(OUT, "mockup-02-trainer-web-home.png"),
    );
    await copyFile(
      join(MOCKUP, "02-trainer-web-home-full.png"),
      join(OUT, "mockup-02-trainer-web-home-full.png"),
    );
    await sideBySide(
      browser,
      join(OUT, "TW-04.png"),
      join(OUT, "mockup-02-trainer-web-home.png"),
      "TW-04-side-by-side.png",
    );
    await sideBySide(
      browser,
      join(OUT, "TW-04-full.png"),
      join(OUT, "mockup-02-trainer-web-home-full.png"),
      "TW-04-full-side-by-side.png",
    );
  } catch (err) {
    console.warn("side-by-side failed", err);
  }

  // TW-04 390
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await shot(page, "TW-04-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  // TW-04 offline
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await shot(page, "TW-04--offline");
  await context.setOffline(false);

  // TW-05 Rohan active
  await page.goto(`${BASE}/?exception=${ROHAN_ACTIVE}`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-05").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-05");

  // TW-05 Meera acknowledged
  await page.goto(`${BASE}/?exception=${MEERA_ACK}`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-05").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-05--meera-resolve");

  // TW-05 resolved read-only
  await page.goto(`${BASE}/?exception=${RESOLVED}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "TW-05--resolved");

  // TW-05 fallback route
  await page.goto(`${BASE}/exceptions/${ROHAN_ACTIVE}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "TW-05--fallback-route");

  // TW-32 ask drawer
  await page.goto(`${BASE}/?ask=${ASK_ISHITA}`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-32").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  await shot(page, "TW-32");

  // TW-33 404
  await page.goto(`${BASE}/not-a-real-route`, { waitUntil: "networkidle" });
  await page.getByTestId("screen-TW-33").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(400);
  await shot(page, "TW-33");
  await shot(page, "TW-33--404");

  // TW-33 client not found
  await page.goto(`${BASE}/clients/${MISSING_CLIENT}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "TW-33--client-not-found");

  // TW-33 forbidden / other trainer
  await page.goto(`${BASE}/clients/${PRIYA_CLIENT}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(800);
  await shot(page, "TW-33--forbidden");

  // TW-33 offline
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await shot(page, "TW-33--offline");
  await context.setOffline(false);

  await browser.close();
  console.log("TW-A evidence capture complete →", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
