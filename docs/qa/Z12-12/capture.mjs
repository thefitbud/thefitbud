/**
 * Z12-12 iPad builder captures: 194 (1024×768), 195 (768×1024).
 * Requires seeded API + trainer-web on TRAINER_WEB_URL (default :5174).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = __dirname;
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 60_000 });
}

async function findClient(page, needle) {
  return page.evaluate(async (name) => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    if (!token) throw new Error("No access token");
    const res = await fetch("/api/clients?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items = json.data?.items ?? json.items ?? [];
    const found = items.find((c) =>
      String(c.traineeDisplayName ?? "")
        .toLowerCase()
        .includes(name),
    );
    return found?.relationshipId ?? null;
  }, needle);
}

async function shot(page, name, viewport) {
  const suffix = `${viewport.width}x${viewport.height}`;
  const path = join(OUT, `${name}-${suffix}.png`);
  await page.screenshot({ path, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-${suffix}.txt`), text.slice(0, 8000), "utf8");
  console.log("saved", path);
}

async function openDraft(page, relationshipId) {
  await page.goto(`${BASE}/clients/${relationshipId}/plan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const adjust = page.getByRole("button", { name: /Adjust plan|Start blank|Edit draft/i }).first();
  await adjust.waitFor({ state: "visible", timeout: 30_000 });
  await adjust.click();
  await page.waitForURL(/\/edit/, { timeout: 30_000 });
  await page.getByTestId("screen-TW-13").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 1,
  });
  await signIn(page);

  const rohanId = await findClient(page, "rohan");
  if (!rohanId) throw new Error("Rohan not found in clients list");

  // 194 — iPad landscape builder (narrow: day tabs + properties, library toggle)
  await page.setViewportSize({ width: 1024, height: 768 });
  await openDraft(page, rohanId);
  const dayTab = page.locator(".builder-day-tab").filter({ hasNotText: /Rest/i }).first();
  if (await dayTab.count()) {
    await dayTab.click();
    await page.waitForTimeout(300);
  }
  const exercise = page.locator(".exercise-card").first();
  if (await exercise.count()) {
    await exercise.click();
    await page.waitForTimeout(200);
  }
  await shot(page, "194-ipad-builder-ipad", { width: 1024, height: 768 });

  // 195 — iPad portrait read-only
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForTimeout(500);
  await page.getByTestId("builder-small-screen").waitFor({ state: "visible", timeout: 10_000 });
  await shot(page, "195-ipad-builder-readonly-ipad-portrait", { width: 768, height: 1024 });

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
