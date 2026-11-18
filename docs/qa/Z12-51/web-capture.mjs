/**
 * Z12-51 Expo-web check (D-W12-34): the trainer exception review and the
 * Needs you review sheet at 393×852, light and dark, on the local seeded API.
 *
 * Usage (from the repo root, API and `expo start --web` already running):
 *   EXPO_WEB_URL=http://127.0.0.1:8097 [CLIENT="Rohan Mehta"] [THEMES=light,dark] \
 *   PLAYWRIGHT_BROWSERS_PATH=<browsers> node docs/qa/Z12-51/web-capture.mjs [probe]
 *
 * Writes `<screen ID>-<theme>-web.png` next to this file. Offline (TM-04h) and
 * not-found (TM-04g) are produced with Playwright routes; everything else is
 * the real API. It marks reviewed and resolves seeded items (local DB only).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8097";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "web");
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function signIn(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const email = page.getByLabel(/mobile number or email/i).first();
  await email.waitFor({ timeout: 90_000 });
  await email.fill(EMAIL);
  await page.getByLabel(/^password$/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByText(/^Needs you/).first().waitFor({ timeout: 60_000 });
}

async function shot(page, name, theme) {
  await page.waitForTimeout(700);
  const file = join(OUT, `${name}-${theme}-web.png`);
  await page.screenshot({ path: file });
  await writeFile(join(OUT, `${name}-${theme}-web.txt`), (await page.locator("body").innerText()).slice(0, 3000));
  console.log("wrote", file);
}

/** Open the first exception of a client through Clients → row → Review. */
async function openException(page, client) {
  await page.getByText("Clients", { exact: true }).last().click();
  await page.getByText(client, { exact: false }).first().click();
  await page.getByRole("button", { name: /^Review/ }).first().click();
  await page.getByTestId("exception-review").waitFor({ timeout: 30_000 });
  await page.getByText("What happened").first().waitFor({ timeout: 30_000 });
}

async function run(theme, probe) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await context.newPage();
  await signIn(page);
  if (probe) {
    await shot(page, "probe-attention", theme);
    await browser.close();
    return;
  }
  // TM-04a open item, then the ⋯ menu (TM-04j) and the note composer (TM-04k).
  await openException(page, process.env.CLIENT ?? "Rohan Mehta");
  const footer = page.getByTestId("exception-markReviewed");
  if (await footer.count()) {
    await shot(page, "TM-04a", theme);
    await page.getByLabel("More actions").click();
    await page.getByText("Add note").waitFor();
    await shot(page, "TM-04j", theme);
    await page.getByText("Add note").click();
    await page.getByRole("heading", { name: /^Note for / }).waitFor();
    await page.getByLabel("Note", { exact: true }).fill("Let's do 2 shorter sessions this week while you travel.");
    await shot(page, "TM-04k", theme);
    await page.getByText("Cancel").click();
    await page.waitForTimeout(800);
    // TM-04h: the next Mark reviewed fails as a network failure.
    await page.route("**/exceptions/*/acknowledge", (route) => route.abort("internetdisconnected"));
    await footer.click();
    await page.getByText(/You're offline\. Reviewing and nudging need a connection\./).waitFor();
    await shot(page, "TM-04h", theme);
    await page.unroute("**/exceptions/*/acknowledge");
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByTestId("exception-markReviewed").waitFor();
    await page.getByTestId("exception-markReviewed").click();
  }
  // TM-04e reviewed, still open.
  await page.getByText(/^Reviewed by you/).waitFor({ timeout: 30_000 });
  await shot(page, "TM-04e", theme);
  // TM-04d resolve sheet with an outcome and a note, then TM-04f.
  await page.getByTestId("exception-resolve").click();
  await page.getByText("Note (only you)").waitFor();
  await page.getByText(/^Talked to /).click();
  await page.getByLabel("Note (only you)").fill("Travelling for work till Fri. Moving leg day to Sat.");
  await shot(page, "TM-04d", theme);
  await page.getByTestId("resolve-confirm").click();
  await page.getByText(/^Resolved by you/).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot(page, "TM-04f", theme);
  // TM-04g: the exception read answers 404 (resolved elsewhere / replaced).
  await page.getByTestId("exception-back").click();
  await page.route("**/exceptions/*", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "EXCEPTION_NOT_FOUND", message: "Exception not found.", requestId: "qa" } }),
    }),
  );
  await page.getByRole("button", { name: /^Review/ }).first().click();
  await page.getByTestId("exception-not-found").waitFor({ timeout: 30_000 });
  await shot(page, "TM-04g", theme);
  await page.unroute("**/exceptions/*");
  // TM-04i: the same client read back as ended (the workspace header is
  // stubbed with an end date; no seeded ended client has an open item).
  await page.getByTestId("exception-back").click();
  await page.route("**/workspaces/relationships/*", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    const data = json.data ?? json;
    data.header.endedAt = "2026-10-30T10:00:00.000Z";
    await route.fulfill({ response, json });
  });
  await page.getByRole("button", { name: /^Review/ }).first().click();
  await page.getByText(/This is read only\./).waitFor({ timeout: 30_000 });
  await shot(page, "TM-04i", theme);
  await page.unroute("**/workspaces/relationships/*");
  await browser.close();
}

await mkdir(OUT, { recursive: true });
const probe = process.argv[2] === "probe";
for (const theme of (process.env.THEMES ?? "light,dark").split(",")) {
  await run(theme, probe);
}
