#!/usr/bin/env node
/**
 * Capture FitBud mobile (Expo web) screenshots at 390×844 into docs/implementation/screens/mobile/.
 *
 * Prereqs:
 *   pnpm db:reset && pnpm api
 *   cd apps/mobile && EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8787 pnpm exec expo start --web --port 8081
 *   pnpm add -D playwright -w && pnpm exec playwright install chromium
 *
 * Usage: node scripts/capture-mobile-screens.mjs [baseUrl]
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "docs/implementation/screens/mobile");
const baseUrl = process.argv[2] ?? "http://127.0.0.1:8081";
const password = "FitBud-demo-2026";

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
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  async function shot(id) {
    const file = path.join(outDir, `${id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log("Saved", file);
  }

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(8000);
  await shot("TR-01");

  async function signIn(email) {
    await page.waitForSelector("input", { timeout: 90_000 });
    const inputs = page.locator("input");
    await inputs.nth(0).fill(email);
    await inputs.nth(1).fill(password);
    await page.getByText("Sign in", { exact: true }).click();
    await page.waitForTimeout(4000);
  }

  await signIn("aarav.ontrack@demo.fitbud.test");
  await shot("TR-06-today");
  await page.getByRole("tab", { name: "Diet" }).click();
  await page.waitForTimeout(1500);
  await shot("TR-07-diet");
  await page.getByRole("tab", { name: "Workout" }).click();
  await page.waitForTimeout(1500);
  await shot("TR-10-workout-tab");
  await page.getByRole("tab", { name: "Progress" }).click();
  await page.waitForTimeout(1000);
  await shot("TR-13-progress");
  await page.getByRole("tab", { name: "More" }).click();
  await page.waitForTimeout(1000);
  await shot("TR-20-more");

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForTimeout(1500);
  await signIn("rahul.coach@demo.fitbud.test");
  await shot("TM-01-attention");
  await page.getByRole("tab", { name: "Clients" }).click();
  await page.waitForTimeout(1500);
  await shot("TM-02-clients");
  await page.getByRole("tab", { name: "Check-ins" }).click();
  await page.waitForTimeout(1000);
  await shot("TM-05-checkins");
  await page.getByRole("tab", { name: "More" }).click();
  await page.waitForTimeout(1000);
  await shot("TM-07-more");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
