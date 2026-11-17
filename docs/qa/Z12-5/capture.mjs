/**
 * Z12-5 visual captures: 144–145 at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-5/capture.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ANITA_INVITE = "06b54e81-016c-4220-a9a8-31195324669b";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page
    .getByTestId("screen-TW-01")
    .waitFor({ state: "visible", timeout: 30_000 });
  await page
    .getByRole("textbox", { name: /mobile number or email/i })
    .fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function capture(page, name, viewport) {
  const file = join(OUT, `${name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(
    join(OUT, `${name}-${viewport.width}x${viewport.height}.txt`),
    text.slice(0, 4000),
  );
  console.log("wrote", file);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await signIn(page);

  await page.goto(`${BASE}/invitations/${ANITA_INVITE}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-08").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByText("What happens next").waitFor({ state: "visible" });
  await page.waitForTimeout(400);
  await capture(page, "144-trainer-web-invite-detail-web", {
    width: 1440,
    height: 900,
  });

  await page.getByRole("button", { name: /More actions/i }).click();
  await page.getByRole("menuitem", { name: /Revoke invite/i }).click();
  await page
    .getByRole("dialog", { name: /Revoke .+ invite\?/i })
    .waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await capture(page, "145-trainer-web-invite-revoke-web", {
    width: 1440,
    height: 900,
  });

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
