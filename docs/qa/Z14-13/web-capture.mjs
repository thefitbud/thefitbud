/**
 * Z14-13 Expo-web check of the Diet frames: meal actions (TR-07a2), photo
 * choice (TR-07m), uploading (TR-07m2), failed (TR-07m3), logged with Add
 * photo (TR-07m4), something different loading (TR-08a2), portion screen
 * (TR-08b2), portion offline (TR-08b3), ate out (TR-08c2) at 393x852 and
 * 360x800, light and dark, on the local seeded API.
 *
 * The seed's meal windows are clock-relative, so the script rewrites the
 * assignments response of the real API: it opens the first meal's window
 * around now and leaves it pending until the real confirm call goes out.
 * Expo web has no native keyboard (TR-08c3), no camera and no safe-area
 * insets; those are covered by unit tests and the device run.
 *
 * Usage (API and `expo start --web` already running, repo root):
 *   EXPO_WEB_URL=http://127.0.0.1:8083 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *   node docs/qa/Z14-13/web-capture.mjs
 *
 * Writes `<screen ID>-<WxH>-<theme>-web.png` next to this file.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8083";
const OUT = dirname(fileURLToPath(import.meta.url));
const EMAIL = "aarav.ontrack@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const SIZES = [
  { width: 393, height: 852 },
  { width: 360, height: 800 },
];
// A real 1x1 JPEG for the file chooser (the resize runs on a canvas on web).
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

async function shot(page, id, size, theme) {
  await page.waitForTimeout(700);
  const file = join(OUT, `${id}-${size.width}x${size.height}-${theme}-web.png`);
  await page.screenshot({ path: file });
  console.log("wrote", file);
}

/** Opens the first meal's window around now, pending until `state.phase` flips. */
function installAssignmentsRewrite(page, state) {
  return page.route("**/meals/relationships/*/assignments*", async (route) => {
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
    const headers = { ...route.request().headers() };
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
    const response = await route.fetch({ headers });
    const body = await response.json();
    const today = new URL(route.request().url()).searchParams.get("fromDate");
    if (today !== new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)) {
      return route.fulfill({ response, json: body });
    }
    const now = Date.now();
    const iso = (ms) => new Date(ms).toISOString();
    const first = (body.data ?? body).items?.[0];
    if (first) {
      first.windowStartsAt = iso(now - 30 * 60_000);
      first.windowEndsAt = iso(now + 30 * 60_000);
      first.photoRequired = state.photoRequired;
      if (state.phase === "pending") {
        first.status = "pending";
        first.compliance = null;
      }
    }
    await route.fulfill({ response, json: body });
  });
}

async function run(size, theme) {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, colorScheme: theme });
  const page = await context.newPage();
  globalThis.__page = page;
  const state = { phase: "pending", photoRequired: true, delayMs: 0 };
  await installAssignmentsRewrite(page, state);
  page.on("request", (req) => {
    if (req.method() === "POST" && /\/meals\/.*confirm|\/sync\/push/.test(req.url())) state.phase = "logged";
  });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const email = page.getByLabel(/mobile number or email/i).first();
  await email.waitFor({ timeout: 90_000 });
  await email.fill(EMAIL);
  await page.getByLabel(/^password$/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.getByText(/kcal (left|over)/).first().waitFor({ timeout: 60_000 });
  await page.getByText("Diet", { exact: true }).last().click();
  await page.getByText(/kcal eaten/).locator("visible=true").first().waitFor({ timeout: 30_000 });

  // TR-07a2: two stacked full-width buttons, full labels.
  await page.getByRole("button", { name: "Eaten as planned" }).first().waitFor({ timeout: 30_000 });
  await shot(page, "TR-07a2", size, theme);

  // TR-08a2 / TR-08b2 / TR-08b3 / TR-08c2 from Something different.
  state.delayMs = 2500;
  await page.getByTestId("diet-something-different").first().click();
  await page.getByTestId("meal-loading").first().waitFor({ timeout: 5_000 });
  await shot(page, "TR-08a2", size, theme);
  await page.getByRole("button", { name: "Changed the portion" }).waitFor({ timeout: 20_000 });
  state.delayMs = 0;
  await page.getByRole("button", { name: "Changed the portion" }).click();
  await page.getByText("Save portion").first().waitFor({ timeout: 10_000 });
  await shot(page, "TR-08b2", size, theme);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.getByTestId("offline-banner").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  await shot(page, "TR-08b3", size, theme);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByRole("button", { name: "Back" }).first().click();
  await page.getByRole("button", { name: "Ate out" }).first().click();
  await page.getByTestId("ate-out-kcal").first().fill("38");
  await shot(page, "TR-08c2", size, theme);
  await page.getByRole("button", { name: "Back" }).first().click();
  // Close the sheet.
  await page.getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: "Close" }).first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(800);

  // TR-07m: log as planned; the plan asks for a photo, so the sheet opens.
  const eaten = page.getByRole("button", { name: "Eaten as planned" }).first();
  if (await eaten.isVisible().catch(() => false)) {
    await eaten.click();
    await page.getByTestId("meal-photo-sheet").waitFor({ timeout: 40_000 });
    await shot(page, "TR-07m", size, theme);

    // TR-07m3: the upload fails; TR-07m2: it is slow.
    let mode = "fail";
    await page.route("**/files/*/content", async (route) => {
      if (mode === "fail") return route.abort("failed");
      await new Promise((r) => setTimeout(r, 5000));
      return route.continue();
    });
    const chooser = page.waitForEvent("filechooser", { timeout: 15_000 }).catch(() => null);
    await page.getByTestId("meal-photo-gallery").click();
    const fc = await chooser;
    if (fc) {
      await fc.setFiles({ name: "meal.jpg", mimeType: "image/jpeg", buffer: JPEG });
      await page.getByText(/Photo didn.t upload/).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
      await shot(page, "TR-07m3", size, theme);
      mode = "slow";
      await page.getByTestId("meal-photo-retry").click().catch(() => undefined);
      await page.getByText(/Uploading photo/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
      await shot(page, "TR-07m2", size, theme);
    }
  }

  // TR-07m4: a logged meal whose plan does not ask for a photo shows Add photo.
  state.photoRequired = false;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Diet", { exact: true }).last().click().catch(() => undefined);
  await page.getByTestId("meal-add-photo").first().waitFor({ timeout: 40_000 }).catch(() => undefined);
  await shot(page, "TR-07m4", size, theme);
  await browser.close();
}

for (const size of SIZES) {
  for (const theme of ["light", "dark"]) {
    try {
      await run(size, theme);
    } catch (err) {
      await globalThis.__page?.screenshot({ path: join(OUT, "failed.png") }).catch(() => undefined);
      throw err;
    }
  }
}
