/**
 * Capture TW-F evidence screenshots into docs/spec/evidence/TW-F/
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../../docs/spec/evidence/TW-F");
const ART = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ONBOARDING = "10111111-1111-4111-8111-111111111111";
const CHECKIN = "c1000001-0000-4000-8000-000000000001";
const BASE = "http://127.0.0.1:5173";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForFunction(() => window.location.pathname === "/", null, {
    timeout: 45_000,
  });
}

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(ART, name));
  console.log("saved", name);
}

async function hasSideScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
}

const layoutNotes = [];

async function captureViewport(page, url, name, size) {
  await page.setViewportSize(size);
  await page.goto(`${BASE}${url}`);
  await page.waitForTimeout(1200);
  const scroll = await hasSideScroll(page);
  layoutNotes.push({ name, ...size, sidewaysScroll: scroll });
  await shot(page, name);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await signIn(page);

// TW-23
await page.goto(`${BASE}/templates/workouts`);
await page.getByTestId("screen-TW-23").waitFor();
await page.getByText("FitBud base").first().waitFor({ timeout: 20_000 });
await shot(page, "TW-23--loading.png"); // brief; may already be loaded
await shot(page, "TW-23.png");

await page.getByRole("button", { name: /Mine/i }).click();
await page.waitForTimeout(500);
await shot(page, "TW-23--empty.png");

await page.getByRole("button", { name: /^All/i }).click();
await page.getByPlaceholder("Search templates").fill("pcod");
await page.waitForTimeout(600);
await shot(page, "TW-23--empty-search.png");
await page.getByPlaceholder("Search templates").fill("");

await captureViewport(page, "/templates/workouts", "TW-23-1280.png", {
  width: 1280,
  height: 800,
});
await captureViewport(page, "/templates/workouts", "TW-23-768.png", {
  width: 768,
  height: 900,
});
await captureViewport(page, "/templates/workouts", "TW-23-390.png", {
  width: 390,
  height: 844,
});

await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/templates/workouts`);
await page.route("**/api/templates**", (route) => route.abort());
await page.reload();
await page.waitForTimeout(800);
await shot(page, "TW-23--offline.png");
await page.unroute("**/api/templates**");

// TW-27 Use / Fork
await page.goto(`${BASE}/templates/workouts`);
await page.getByText("FitBud base").first().waitFor({ timeout: 20_000 });
await page.getByRole("button", { name: /^Use$/ }).first().click();
await page.getByTestId("use-template-modal").waitFor();
await shot(page, "TW-27.png");
await page.getByRole("button", { name: /^Close$/ }).click();

await page.getByRole("button", { name: /Fork to edit/i }).first().click();
await page.getByTestId("fork-template-modal").waitFor();
await shot(page, "TW-27--fork.png");
await page.getByRole("button", { name: /^Fork$/ }).click();
await page.waitForURL(/\/templates\/workouts\/[0-9a-f-]+/, { timeout: 30_000 });
await shot(page, "TW-27--after-fork.png");

// TW-24
await page.goto(`${BASE}/templates/onboarding/${ONBOARDING}`);
await page.getByTestId("screen-TW-24").waitFor();
await shot(page, "TW-24.png");
await page.getByRole("button", { name: /Fork to edit/i }).click();
await page.getByTestId("fork-template-modal").waitFor();
await page.getByRole("button", { name: /^Fork$/ }).click();
await page.waitForURL(/\/templates\/onboarding\/[0-9a-f-]+/, { timeout: 30_000 });
await page.getByTestId("screen-TW-24").waitFor();
await shot(page, "TW-24--mine.png");

// TW-25
await page.goto(`${BASE}/templates/checkins/${CHECKIN}`);
await page.getByTestId("screen-TW-25").waitFor();
await page.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
await page.getByText(/Loading form/i).waitFor({ state: "hidden", timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(800);
await shot(page, "TW-25.png");
await shot(page, "TW-25--loading.png"); // retained name; page may already be loaded

// TW-26
await page.goto(`${BASE}/templates/libraries/exercises`);
await page.getByTestId("screen-TW-26").waitFor();
await page.getByRole("columnheader", { name: "Name" }).waitFor({ timeout: 20_000 });
await shot(page, "TW-26.png");
await page.getByRole("link", { name: /^Foods$/ }).click();
await page.waitForTimeout(800);
await shot(page, "TW-26--foods.png");

await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/templates/libraries/exercises`);
await page.waitForTimeout(800);
await shot(page, "TW-26-390.png");

fs.writeFileSync(
  path.join(OUT, "layout-notes.json"),
  JSON.stringify(layoutNotes, null, 2),
);
console.log("layout", layoutNotes);
await browser.close();
