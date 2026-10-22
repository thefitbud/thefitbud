#!/usr/bin/env node
/**
 * Capture MA evidence screenshots (TR-01..09, TR-26) from Expo web.
 *
 * Prereqs: API :8787, Expo web :8081 with EXPO_PUBLIC_SCREEN_CAPTURE=1
 * Usage: node scripts/capture-ma.mjs [baseUrl]
 */
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/spec/evidence/MA");
const artifactsDir = "/opt/cursor/artifacts/screenshots";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";
const password = "FitBud-demo-2026";

const VIEWPORTS = [
  { name: "ios", width: 393, height: 852 },
  { name: "pixel", width: 412, height: 915 },
  { name: "small", width: 360, height: 800 },
];

async function main() {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  await mkdir(artifactsDir, { recursive: true }).catch(() => {});

  const browser = await chromium.launch();

  async function withPage(viewport, fn) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    try {
      await fn(page);
    } finally {
      await page.close();
    }
  }

  async function shot(page, id) {
    const file = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log("Saved", file);
    try {
      await copyFile(file, path.join(artifactsDir, `${id}.png`));
    } catch {
      /* optional */
    }
  }

  async function gotoApp(page) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(6000);
  }

  async function signIn(page, email) {
    await page.waitForSelector("input", { timeout: 90_000 });
    const inputs = page.locator("input");
    await inputs.nth(0).fill(email);
    await inputs.nth(1).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForTimeout(4500);
  }

  async function signOut(page) {
    const btn = page.getByRole("button", { name: "Sign out" });
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForTimeout(2000);
    } else if (typeof page.evaluate === "function") {
      await page.evaluate(async () => {
        if (window.__fitbudCapture?.signOut) await window.__fitbudCapture.signOut();
      }).catch(() => {});
      await page.waitForTimeout(1500);
    }
  }

  async function captureNav(page, id) {
    await page.evaluate(async (screenId) => {
      const nav = window.__fitbudCapture?.navigate;
      if (nav) await nav(screenId);
    }, id).catch(() => {});
    await page.waitForTimeout(2800);
  }

  // Primary iPhone 15 viewport captures
  await withPage(VIEWPORTS[0], async (page) => {
    await gotoApp(page);
    await shot(page, "TR-01");

    // Code sign-in
    await page.getByText("Sign in with a code instead").click();
    await page.waitForTimeout(800);
    await shot(page, "TR-01--code");

    await page.getByText(/password/i).first().click().catch(() => {});
    await page.waitForTimeout(500);
    await gotoApp(page);

    // Invite via capture bridge
    await captureNav(page, "TR-02");
    await shot(page, "TR-02");

    await captureNav(page, "TR-03");
    await shot(page, "TR-03");

    await captureNav(page, "TR-04");
    await shot(page, "TR-04");

    await captureNav(page, "TR-05");
    await shot(page, "TR-05");

    await captureNav(page, "TR-06");
    await shot(page, "TR-06");

    await captureNav(page, "TR-07");
    await shot(page, "TR-07");

    await captureNav(page, "TR-08");
    await shot(page, "TR-08");

    await captureNav(page, "TR-09");
    await shot(page, "TR-09");

    await captureNav(page, "TR-26");
    await shot(page, "TR-26");
  });

  // Extra viewports for Today + Sign-in
  for (const vp of VIEWPORTS) {
    await withPage(vp, async (page) => {
      await gotoApp(page);
      await shot(page, `TR-01-${vp.name}`);
      await signIn(page, "aarav.ontrack@demo.fitbud.test");
      await shot(page, `TR-06-${vp.name}`);
      await page.getByText("Diet", { exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, `TR-07-${vp.name}`);
    });
  }

  // Side-by-side composites vs mockups (simple stacked via playwright is enough;
  // copy mockups next to captures for the report).
  const mock04 = path.join(root, "docs/spec/mockups/png/04-trainee-today-ios.png");
  const mock06 = path.join(root, "docs/spec/mockups/png/06-trainee-signin-ios.png");
  try {
    await copyFile(mock04, path.join(outDir, "mockup-04-today-ios.png"));
    await copyFile(mock06, path.join(outDir, "mockup-06-signin-ios.png"));
  } catch (err) {
    console.warn("Could not copy mockups", err);
  }

  await browser.close();
  console.log("MA capture complete →", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
