/**
 * Z12-30 visual captures: BP1-delete-account-web + BP1-reactivate-account-web at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-30/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const PURGE_AFTER = "2027-05-03T04:12:09.000Z";
const VIEWPORT = { width: 1440, height: 900 };

async function capture(page, name) {
  const suffix = `${VIEWPORT.width}x${VIEWPORT.height}`;
  const file = join(OUT, `${name}-${suffix}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-${suffix}.txt`), text.slice(0, 5000));
  console.log("wrote", file);
}

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

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();

  // --- Delete account modal (BP1-delete-account-web) ---
  {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto(`${BASE}/settings/privacy`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("privacy-data-page").waitFor({ state: "visible", timeout: 20_000 });
    await page.getByTestId("delete-account-open").click();
    await page.getByTestId("delete-account-modal").waitFor({ state: "visible", timeout: 10_000 });
    await page.getByTestId("delete-account-confirm").fill("DELETE");
    await page.waitForTimeout(300);
    await capture(page, "BP1-delete-account-web");
    await context.close();
  }

  // --- Reactivate (BP1-reactivate-account-web): force /me archived after login ---
  {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.route("**/me", async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "ACCOUNT_ARCHIVED",
            message:
              "This account is deleted. Sign in again and bring it back to continue.",
            requestId: "capture-archived",
            details: { accountState: "archived", purgeAfter: PURGE_AFTER },
          },
        }),
      });
    });
    await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.getByTestId("reactivate-account").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(400);
    await capture(page, "BP1-reactivate-account-web");
    await context.close();
  }

  await browser.close();
  console.log("Z12-30 captures done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
