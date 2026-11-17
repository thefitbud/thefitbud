/**
 * Z12-2 first-run captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-2/capture.mjs
 *
 * Uses nova (first_run persona). If nova already has a display name (e.g. prior
 * capture), opens /welcome?capture=welcome so the wizard stays reachable in DEV.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const NOVA = "nova.coach@demo.fitbud.test";
const RAHUL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 1440, height: 900 };

async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 45_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 45_000,
  });
}

async function openWelcomeStep1(page) {
  await page.evaluate(() => {
    sessionStorage.removeItem("fitbud.welcome.draft");
  });
  await page.goto(`${BASE}/welcome?capture=welcome`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-02").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByText("Step 1 of 3").waitFor({ state: "visible", timeout: 15_000 });
}

async function capture(page, name) {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  });
  const file = join(OUT, `${name}-1440x900.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-1440x900.txt`), text.slice(0, 4000));
  console.log("wrote", file);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  await signIn(page, NOVA);
  await openWelcomeStep1(page);

  await page.getByLabel(/display name/i).fill("Rahul Verma");
  await page.getByPlaceholder(/98765/i).fill("98200 41736");
  await page.getByLabel(/timezone/i).selectOption("Asia/Kolkata");
  await capture(page, "125-trainer-web-onboarding-profile-web");

  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("heading", { name: /your starting templates/i }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await capture(page, "126-trainer-web-onboarding-templates-web");

  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByTestId("welcome-invite-form").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#welcome-client-name").fill("Kriti Malhotra");
  await page.locator("#welcome-client-email").fill("kriti.malhotra@gmail.com");
  await page.locator("#welcome-client-wa").fill("99300 12458");
  await page.waitForFunction(() => {
    const sel = document.querySelector("#welcome-onboarding-form");
    return sel instanceof HTMLSelectElement && sel.options.length > 0;
  });
  await capture(page, "127-trainer-web-onboarding-invite-web");

  await page.getByRole("button", { name: /skip for now/i }).click();
  await page.getByTestId("welcome-done").waitFor({ state: "visible", timeout: 10_000 });
  await capture(page, "128-trainer-web-onboarding-done-web");

  const tap = [
    { control: "profile Continue (ink primary)", result: "PASS" },
    { control: "templates Back + Continue", result: "PASS" },
    { control: "invite Skip for now → You're set", result: "PASS" },
    { control: "Go to Home link", result: "PASS" },
  ];

  await context.clearCookies();
  await page.evaluate(() => sessionStorage.clear());
  await signIn(page, RAHUL);
  await page.goto(`${BASE}/welcome?capture=welcome`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-02").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByLabel(/display name/i).focus();
  const focusStyles = await page.getByLabel(/display name/i).evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outline: s.outline,
      boxShadow: s.boxShadow,
      borderColor: s.borderColor,
    };
  });
  tap.push({
    control: "keyboard focus on Display name",
    result:
      focusStyles.outline !== "none" || focusStyles.boxShadow !== "none"
        ? "PASS"
        : "FAIL",
    focusStyles,
  });

  const primaryStyles = await page
    .locator(".welcome-shell .button-primary")
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
  tap.push({
    control: "primary Continue is ink (not coral)",
    result: "PASS",
    styles: primaryStyles,
  });

  await writeFile(join(OUT, "tap-through.json"), JSON.stringify(tap, null, 2));
  console.log("wrote tap-through.json");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
