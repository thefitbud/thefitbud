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
 *
 * Fix round 1: TR-07m3 is the real failure (the upload answers 500, crit
 * copy with Try again / Remove photo); `TR-07m3-offline` is a lost
 * connection, which is a neutral wait that sends itself (D-W14-9). TR-08a2
 * only appears when the phone has no copy of the meal (a Diet day opens
 * the sheet at once from its cache), so `ONLY=TR-08a2` takes just that frame,
 * run once with the cache lookup bypassed locally.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8083";
const ONLY = process.env.ONLY ?? null;
const OUT = dirname(fileURLToPath(import.meta.url));
// After midnight in India every meal of the new day is still ahead and the
// server refuses its log; CAPTURE_EMAIL / CAPTURE_TZ_OFFSET_H pick a trainee in
// another time zone (fix round 1 used fatima.london, offset 0).
const EMAIL = process.env.CAPTURE_EMAIL ?? "aarav.ontrack@demo.fitbud.test";
const TZ_OFFSET_MS = Number(process.env.CAPTURE_TZ_OFFSET_H ?? 5.5) * 3600_000;
const PASSWORD = "FitBud-demo-2026";
const SIZES = [
  { width: 393, height: 852 },
  { width: 360, height: 800 },
];
// A small real JPEG (a plate) for the file chooser (the resize runs on a canvas on web).
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCABgAGADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwBlFFFfPHvBShSaeiZqZY/ak2BCI6d5VWVip4i4qeYCn5VNMdXjFxTGio5gKJUikq00ftULpiqTAjooopgFSImaYoyasxrSbAciZqwkdEaVZjjrNsBixVIIqmRCxCqpYnsBmp1srllyIjj3IFSk3sgbS3KRiqNoq0TY3IBPldPQioHjZTh0Kn0IxQ1JboE09jPeOq7pitGSOq0iVSYGe6YqOrUi1WYYNaJgPjFW4lqtFVyIVMgLES1q2dgZAsknCHnHc/8A1qpWMQluEQ9CefpXQgAAADAHQCrpU1LVmNWbjohEjSNdqKFHtTqKK6zlCkZVddrAMD2IpaKAM2707gvAOAOV7/hWPKtdVWDqcIhuSFACsNwA7Vy1aaj7yOmlUb0ZkSrVSQVelFU5azibhFVyI1RjNW4mokBqafKIrqNj0zg5OMZ4roa5WJq2LLUBtWKXAA4DfyzV0ZqOjMasG9UaVFICCAQcg9CKWus5QooooAKw9WlD3RA/gAXIP+fWr13qKxApCQzY+92H+NYcrVzVpp+6jppQa95leU1TlqzK1VJDWUTcYpwasxtVWpEfFU0BoRvVmOSs5HxVhJKzaA0oriSL/VyFfbt+VWV1KcLghGPqRWUstSCWkpSjsxOMXujROpzkEbUHuAary3Usg+eQkenQVWMtRtLQ5Se7BRitkPkkqtI9DyVXd800hjZGqsxyae75qOtEgCiiimBIj4qZZPeqtKGIpNAXllp4l4qiJKd5tTygXDLxTGlqt5tNMlHKBM0nvULvmmFiaSqSAKKKKYH/2Q==",
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
    if (today !== new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10)) {
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
  const loadingShown = await page
    .getByTestId("meal-loading")
    .first()
    .waitFor({ timeout: 2_000 })
    .then(() => true, () => false);
  if (loadingShown) await shot(page, "TR-08a2", size, theme);
  if (ONLY === "TR-08a2") {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await browser.close();
    return;
  }
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

    // TR-07m3: the upload fails on the server; then the connection drops
    // (neutral wait); TR-07m2: it is slow.
    let mode = "fail";
    await page.route("**/files/*/content", async (route) => {
      if (mode === "fail") {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }),
        });
      }
      if (mode === "offline") return route.abort("internetdisconnected");
      await new Promise((r) => setTimeout(r, 8000));
      return route.continue();
    });
    const chooser = page.waitForEvent("filechooser", { timeout: 15_000 }).catch(() => null);
    await page.getByTestId("meal-photo-gallery").click();
    const fc = await chooser;
    if (fc) {
      await fc.setFiles({ name: "meal.jpg", mimeType: "image/jpeg", buffer: JPEG });
      await page.getByText(/Photo didn.t upload/).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
      await shot(page, "TR-07m3", size, theme);
      mode = "offline";
      await page.getByTestId("meal-photo-retry").click().catch(() => undefined);
      await page.getByText(/The photo is saved on your phone/).first().waitFor({ timeout: 15_000 }).catch(() => undefined);
      await shot(page, "TR-07m3-offline", size, theme);
      // Back online: the job sends itself (timer or reachability), slowly here.
      mode = "slow";
      await page.getByText(/Uploading photo/).first().waitFor({ timeout: 45_000 }).catch(() => undefined);
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
