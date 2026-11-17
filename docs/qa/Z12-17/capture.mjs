/**
 * Z12-17 visual captures at 1440×900.
 * Usage: TRAINER_WEB_URL=http://127.0.0.1:5173 node docs/qa/Z12-17/capture.mjs
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

async function signIn(page, email = EMAIL) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

async function firstClientId(page) {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    if (!token) throw new Error("No access token");
    const res = await fetch("/api/clients?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items = json.data?.items ?? json.items ?? [];
    const rohan = items.find((c) =>
      (c.traineeDisplayName ?? "").toLowerCase().includes("rohan"),
    );
    return (rohan ?? items[0])?.relationshipId ?? null;
  });
}

async function capture(page, name) {
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

  // --- 184 error (stub workspace 500) ---
  await signIn(page);
  const rid = await firstClientId(page);
  if (!rid) throw new Error("No client relationship for error capture");
  await page.route(`**/workspaces/relationships/${rid}`, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INTERNAL",
          message: "Please retry in a moment. If it keeps happening, email support.",
          requestId: "req-z12-17-error",
        },
      }),
    });
  });
  await page.goto(`${BASE}/clients/${rid}/overview`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("error-state").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "184-trainer-web-error-web");
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // --- 185 not-found (unknown route, in-shell) ---
  await page.goto(`${BASE}/this-page-does-not-exist-z12-17`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("not-found-state").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "185-trainer-web-not-found-web");

  // Also unknown client id
  await page.goto(
    `${BASE}/clients/00000000-0000-4000-8000-000000000099/overview`,
    { waitUntil: "domcontentloaded" },
  );
  await page.getByTestId("not-found-state").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "185-trainer-web-not-found-web--client");

  // --- 187 forbidden (stub 403) ---
  // Live API returns 404 for another coach's client; stub 403 to match frame wiring.
  const forbidRid = rid;
  await page.route(`**/workspaces/relationships/${forbidRid}`, async (route) => {
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "FORBIDDEN",
          message: "Forbidden.",
          requestId: "req-z12-17-forbidden",
        },
      }),
    });
  });
  await page.goto(`${BASE}/clients/${forbidRid}/overview`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("forbidden-state").waitFor({ state: "visible", timeout: 20_000 });
  await capture(page, "187-trainer-web-forbidden-web");
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // --- 186 offline ---
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-04").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByRole("heading", { name: /^today$/i }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  // Freeze loaded-at by going offline after content is on screen.
  await page.context().setOffline(true);
  await page.getByTestId("offline-banner").waitFor({ state: "visible", timeout: 10_000 });
  await capture(page, "186-trainer-web-offline-web");
  await page.context().setOffline(false);

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
