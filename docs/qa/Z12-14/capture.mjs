/**
 * Z12-14 visual captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-14/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 1440, height: 900 };
const ONBOARDING_MINE = process.env.FITBUD_ONBOARDING_ID ?? "";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function capture(page, name) {
  const file = join(OUT, `${name}-1440x900.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-1440x900.txt`), text.slice(0, 4000));
  console.log("wrote", file);
}

async function resolveMineOnboarding(page) {
  if (ONBOARDING_MINE) return ONBOARDING_MINE;
  await page.goto(`${BASE}/templates/onboarding`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-23").waitFor({ state: "visible", timeout: 30_000 });
  // Prefer a Mine row if present; else open the first intake form.
  const mineRow = page.locator("tr").filter({ hasText: "Mine" }).first();
  if (await mineRow.count()) {
    await mineRow.getByRole("link").first().click();
  } else {
    await page.locator("tr a").first().click();
  }
  await page.waitForURL(/\/templates\/onboarding\/[0-9a-f-]+/, { timeout: 20_000 });
  return page.url().split("/").pop();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await signIn(page);

  // --- 170 Intake form builder ---
  const onboardingId = await resolveMineOnboarding(page);
  await page.goto(`${BASE}/templates/onboarding/${onboardingId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-24").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("complementary", { name: "Question" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
  // Select a mid question when available for the Question panel state.
  const questions = page.getByRole("list", { name: "Questions" }).getByRole("button");
  const count = await questions.count();
  if (count > 2) {
    await questions.nth(2).click();
  }
  await page.waitForTimeout(500);
  await capture(page, "170-trainer-web-intake-form-builder-web");

  // --- 172 Foods library + drawer ---
  await page.goto(`${BASE}/templates/libraries/foods`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-26").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("columnheader", { name: "Food" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(800);
  await page.locator(".libraries-table tbody tr").first().click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(400);
  await capture(page, "172-trainer-web-library-foods-web");

  // --- 173 Exercises library ---
  await page.goto(`${BASE}/templates/libraries/exercises`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-26").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("columnheader", { name: "Exercise" }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const logged = page.getByRole("heading", {
    name: /Logged by clients, not in library/i,
  });
  await logged.waitFor({ state: "attached", timeout: 10_000 });
  await logged.scrollIntoViewIfNeeded();
  // Nudge so the card sits in the lower viewport with filters still visible.
  await page.evaluate(() => {
    const card = document.querySelector(".libraries-logged-card");
    card?.scrollIntoView({ block: "end" });
  });
  await page.waitForTimeout(500);
  await capture(page, "173-trainer-web-library-exercises-web");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
