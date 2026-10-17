#!/usr/bin/env node
/**
 * Capture Expo web screenshots at 390×844 for mobile screen QA.
 * Requires: pnpm --filter @fitbud/mobile exec playwright install chromium
 * Usage: node scripts/capture-mobile-screens.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "artifacts", "mobile-screens");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";

const routes = [
  { name: "sign-in", path: "/" },
  { name: "trainee-today", path: "/" },
];

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error(
      "Playwright is not installed. Run: pnpm add -D playwright -w && pnpm exec playwright install chromium",
    );
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  for (const route of routes) {
    const url = `${baseUrl.replace(/\/$/, "")}${route.path}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    const file = path.join(outDir, `${route.name}-390x844.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("Saved", file);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
