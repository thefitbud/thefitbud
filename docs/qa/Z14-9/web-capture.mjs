/**
 * Z14-9 Expo-web check: Progress (TR-13a), Log weight sheet (TR-13c), Profile
 * (TR-20b) and sign-in with selected text (TR-01a) at 393×852 and 360×800,
 * light and dark, on the local seeded API. Expo web proves layout widths,
 * copy and colours; it has no native keyboard, calendar dialog or Android
 * selection handles, so those are covered by unit tests and the device run.
 *
 * Usage (API and `expo start --web` already running, repo root):
 *   EXPO_WEB_URL=http://127.0.0.1:8084 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   node docs/qa/Z14-9/web-capture.mjs
 *
 * Writes `<screen ID>-<WxH>-<theme>-web.png` next to this file.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8084";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "aarav.ontrack@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const SIZES = [
  { width: 393, height: 852 },
  { width: 360, height: 800 },
];

async function shot(page, id, size, theme) {
  await page.waitForTimeout(800);
  const file = join(OUT, `${id}-${size.width}x${size.height}-${theme}-web.png`);
  await page.screenshot({ path: file });
  console.log("wrote", file);
}

async function run(size, theme) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const email = page.getByLabel(/mobile number or email/i).first();
  await email.waitFor({ timeout: 90_000 });
  await email.fill(EMAIL);
  await page.getByLabel(/^password$/i).first().fill(PASSWORD);
  // TR-01a: the typed text selected.
  await email.click();
  await page.keyboard.press("Control+A");
  await shot(page, "TR-01a-selected", size, theme);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByText(/kcal (left|over)/).first().waitFor({ timeout: 60_000 });

  await page.getByText("Progress", { exact: true }).last().click();
  await page.getByText("Log weight").first().waitFor({ timeout: 30_000 });
  await shot(page, "TR-13a", size, theme);

  await page.getByText("Log weight").first().click();
  await page.getByText("Save weight").first().waitFor({ timeout: 20_000 });
  await shot(page, "TR-13c", size, theme);
  await page.getByText("Cancel").last().click();
  await page.waitForTimeout(500);

  try {
    await page.getByText("More", { exact: true }).last().click();
    await page.getByText("Profile", { exact: false }).first().click();
    await page.getByTestId("profile-dob").waitFor({ timeout: 15_000 });
    await shot(page, "TR-20b", size, theme);
  } catch (err) {
    console.log("TR-20b not reached:", err.name);
  }
  await browser.close();
}

for (const size of SIZES) {
  for (const theme of ["light", "dark"]) {
    await run(size, theme);
  }
}
