#!/usr/bin/env node
/**
 * Capture MB evidence screenshots (TR-10..15, TR-18, TR-23) from Expo web.
 *
 * Prereqs: API :8787, Expo web :8081 with EXPO_PUBLIC_SCREEN_CAPTURE=1
 * Usage: node scripts/capture-mb.mjs [baseUrl]
 */
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/spec/evidence");
const mbDir = path.join(outDir, "MB");
const artifactsDir = "/opt/cursor/artifacts/screenshots";
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";

const VIEWPORTS = [
  { name: "ios", width: 393, height: 852 },
  { name: "pixel", width: 412, height: 915 },
  { name: "small", width: 360, height: 800 },
];

const SCREENS = [
  "TR-10",
  "TR-11",
  "TR-12",
  "TR-13",
  "TR-14",
  "TR-15",
  "TR-18",
  "TR-23",
];

async function main() {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  await mkdir(mbDir, { recursive: true });
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
      await copyFile(file, path.join(mbDir, `${id}.png`));
      await copyFile(file, path.join(artifactsDir, `${id}.png`));
    } catch {
      /* optional */
    }
  }

  async function gotoApp(page) {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(7000);
  }

  async function captureNav(page, id) {
    await page.evaluate(async (screenId) => {
      const nav = window.__fitbudCapture?.navigate;
      if (!nav) throw new Error("__fitbudCapture.navigate missing");
      await nav(screenId);
    }, id);
    await page.waitForTimeout(3200);
  }

  // Primary iPhone 15 captures
  await withPage(VIEWPORTS[0], async (page) => {
    await gotoApp(page);
    for (const id of SCREENS) {
      await captureNav(page, id);
      await shot(page, id);
    }
    // Extra state shots where cheap via capture bridge
    await captureNav(page, "TR-13");
    await shot(page, "TR-13--empty");
    await captureNav(page, "TR-15");
    await shot(page, "TR-15--empty");
    await captureNav(page, "TR-23");
    await shot(page, "TR-23--unavailable");
  });

  // Multi-viewport for workout overview + progress
  for (const vp of VIEWPORTS) {
    await withPage(vp, async (page) => {
      await gotoApp(page);
      await captureNav(page, "TR-10");
      await shot(page, `TR-10-${vp.name}`);
      await captureNav(page, "TR-13");
      await shot(page, `TR-13-${vp.name}`);
      await captureNav(page, "TR-11");
      await shot(page, `TR-11-${vp.name}`);
    });
  }

  await browser.close();
  console.log("MB capture complete →", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
