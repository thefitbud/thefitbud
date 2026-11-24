/**
 * Z14-12 Expo-web screenshot check (D-W14-5): the workout summary after a
 * finish (W-17a2, W-17a4), "Save and share" (W-17b) and the read-only View
 * summary with its rating sheet (W-17c, W-17c2, W-17c3), at 393x852 and
 * 360x800 (2x), light and dark, on the local demo seed behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure, states and values,
 * not native layout.
 *
 * Usage (repo root): EXPO_WEB_URL=http://127.0.0.1:8081 node docs/qa/Z14-12/capture.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8081";
const EMAIL = process.env.CAPTURE_EMAIL ?? "rohan.slipping@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const SIZES = [
  { width: 393, height: 852 },
  { width: 360, height: 800 },
];

async function waitText(scope, text, timeout = 45_000) {
  await scope.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function signIn(page) {
  await page.goto(BASE, { timeout: 240_000 });
  await waitText(page, "Sign in with a code instead", 240_000);
  await page.getByLabel("Mobile number or email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("tab-today").waitFor({ timeout: 90_000 });
}

/** Opens the missed (or already open) workout's log and ends on it. */
async function openLog(page) {
  await page.getByTestId("tab-workout").click();
  const pane = page.getByTestId("trainee-pane-workout");
  const minimise = page.getByRole("button", { name: "Minimise workout" });
  const logIt = pane.getByRole("button", { name: /Log it/ }).first();
  const resume = page.getByRole("button", { name: "Resume workout" }).last();
  const cont = pane.getByRole("button", { name: /Continue workout/ }).first();
  const start = pane.getByRole("button", { name: "Start workout" }).first();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await minimise.isVisible().catch(() => false)) break;
    if (await resume.isVisible().catch(() => false)) await resume.click();
    else if (await logIt.isVisible().catch(() => false)) await logIt.click();
    else if (await cont.isVisible().catch(() => false)) await cont.click();
    else if (attempt > 5 && (await start.isVisible().catch(() => false))) await start.click();
    await page.waitForTimeout(1_000);
  }
  await minimise.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
}

/** Logs the next set as planned and skips the rest it starts. */
async function logOneSet(page) {
  await page.getByRole("button", { name: /^Log set [0-9]+/ }).first().click();
  const skip = page.getByRole("button", { name: "Skip rest" });
  await skip.waitFor({ timeout: 15_000 });
  await skip.click();
  await page.waitForTimeout(1_200);
}

/** Opens the first day in `days` (day-of-month labels) that has a View summary. */
async function openViewable(page, days) {
  for (const day of days) {
    const chip = page.getByTestId("trainee-pane-workout").getByText(String(day), { exact: true }).first();
    if (!(await chip.isVisible().catch(() => false))) continue;
    await chip.click();
    await page.waitForTimeout(1_200);
    const view = page.getByRole("button", { name: "View summary" }).first();
    if (await view.isVisible().catch(() => false)) {
      await view.click();
      await waitText(page, "YOUR RATING");
      await page.waitForTimeout(600);
      return true;
    }
  }
  return false;
}

/** Finish a workout (when one is left to log) and then view summaries. */
async function run(page, context, snap) {
  await signIn(page);
  let finished = false;
  try {
    await page.getByTestId("tab-workout").click();
    const logIt = page.getByTestId("trainee-pane-workout").getByRole("button", { name: /Log it|Start workout|Continue workout/ }).first();
    await logIt.waitFor({ timeout: 8_000 });
    await openLog(page);
    await logOneSet(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await waitText(page, "Finish");
    await page.getByRole("button", { name: /Finish anyway|Finish workout/ }).last().click();
    await waitText(page, "Workout done");
    await page.getByRole("radio", { name: "8 of 10" }).click();
    await page.waitForTimeout(2_000);
    await snap("W-17a2-summary-rpe");
    await page.getByRole("button", { name: /Save and share with/ }).click();
    await waitText(page, "Shared with");
    await page.waitForTimeout(800);
    await snap("W-17b-summary-shared");
    await page.getByRole("button", { name: "Done" }).click();
    finished = true;
  } catch (error) {
    console.log(`no workout left to finish here (${error instanceof Error ? error.message.split("\n")[0] : error})`);
    await page.reload();
    await page.getByTestId("tab-workout").click();
  }
  if (!finished) await page.getByTestId("tab-workout").click();
  await page.waitForTimeout(1_500);
  // The workouts finished this week are inside the 48 h window (W-17c).
  const recent = await openViewable(page, [24, 23, 25, 22]);
  if (recent) {
    await snap("W-17c-summary-readonly");
    const change = page.getByRole("button", { name: "Change your rating" });
    if (await change.isVisible().catch(() => false)) {
      await change.click();
      await waitText(page, "sees the change");
      await page.getByRole("radio", { name: "9 of 10" }).click();
      await page.waitForTimeout(600);
      await snap("W-17c2-summary-edit-rating");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.waitForTimeout(800);
      await snap("W-17c-summary-readonly-after-change");
    }
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForTimeout(1_000);
  }
  // W-17c3: an older workout, finished more than 48 h ago (the week before).
  await page.getByTestId("trainee-pane-workout").getByRole("button", { name: "Previous week" }).click();
  await page.waitForTimeout(1_500);
  const old = await openViewable(page, [16, 17, 18, 19, 20, 21, 15, 14, 13, 12, 11, 10]);
  if (old) await snap("W-17c3-summary-readonly-old");
}

async function main() {
  await mkdir(HERE, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  try {
    for (const size of SIZES) {
      for (const scheme of ["light", "dark"]) {
        const context = await browser.newContext({
          viewport: size,
          deviceScaleFactor: 2,
          colorScheme: scheme,
          timezoneId: "Asia/Kolkata",
        });
        const page = await context.newPage();
        const snap = async (name) => {
          const file = join(HERE, `${name}-${size.width}x${size.height}-${scheme}-web.png`);
          await page.screenshot({ path: file });
          console.log(`saved ${file}`);
        };
        try {
          await run(page, context, snap);
        } catch (error) {
          const file = join(HERE, `FAILED-${size.width}x${size.height}-${scheme}.png`);
          await page.screenshot({ path: file }).catch(() => undefined);
          console.error(`${size.width} ${scheme} failed: ${error instanceof Error ? error.message : error}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
