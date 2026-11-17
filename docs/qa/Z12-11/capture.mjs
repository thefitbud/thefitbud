/**
 * Z12-11 visual captures at 1440×900.
 * Requires seeded API + trainer-web on TRAINER_WEB_URL (default :5174).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const OUT = __dirname;
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 1440, height: 900 };

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 60_000 });
}

async function findClient(page, needle) {
  return page.evaluate(async (name) => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    if (!token) throw new Error("No access token");
    const res = await fetch("/api/clients?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items = json.data?.items ?? json.items ?? [];
    const found = items.find((c) =>
      String(c.traineeDisplayName ?? "")
        .toLowerCase()
        .includes(name),
    );
    return found?.relationshipId ?? null;
  }, needle);
}

async function shot(page, name) {
  const path = join(OUT, `${name}-1440x900.png`);
  await page.screenshot({ path, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-1440x900.txt`), text.slice(0, 8000), "utf8");
  console.log("saved", path);
}

async function openDraft(page, relationshipId) {
  await page.goto(`${BASE}/clients/${relationshipId}/plan`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const adjust = page.getByRole("button", { name: /Adjust plan|Start blank|Edit draft/i }).first();
  await adjust.waitFor({ state: "visible", timeout: 30_000 });
  await adjust.click();
  await page.waitForURL(/\/edit/, { timeout: 30_000 });
  await page.getByTestId("screen-TW-13").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await signIn(page);

  const rohanId = await findClient(page, "rohan");
  if (!rohanId) throw new Error("Rohan not found in clients list");

  await openDraft(page, rohanId);

  // Prefer a day that has exercises
  const dayTab = page.locator(".builder-day-tab").filter({ hasNotText: /Rest/i }).first();
  if (await dayTab.count()) {
    await dayTab.click();
    await page.waitForTimeout(300);
  }
  const exercise = page.locator(".exercise-card").first();
  if (await exercise.count()) {
    await exercise.click();
    await page.waitForTimeout(200);
  }

  await shot(page, "152-trainer-web-workout-builder-web");

  // 153 — conflict: stub the next draft PUT as 409, then edit
  await page.route("**/plans/**/versions/**", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "STALE_RECORD_VERSION",
            message: "This draft was changed elsewhere.",
            requestId: "qa-z12-11",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  const cue = page.getByPlaceholder(/Brace|coach cue|sit between/i).first();
  if (await cue.count()) {
    await cue.fill(`Conflict cue ${Date.now()}`);
  } else {
    await page.getByLabel("Plan title").fill(`Conflict title ${Date.now()}`);
  }
  await page.waitForTimeout(1600);
  await page.getByTestId("builder-conflict").waitFor({ state: "visible", timeout: 10_000 });
  await shot(page, "153-trainer-web-workout-builder-conflict-web");
  await page.unroute("**/plans/**/versions/**");

  // Clear conflict so 154 is a clean nutrition builder
  await page.getByRole("button", { name: "Keep mine" }).click();
  await page.getByTestId("builder-conflict").waitFor({ state: "hidden", timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);

  // 154 — nutrition tab (fresh draft if conflict left the page dirty)
  await page.getByRole("tab", { name: "Nutrition" }).click();
  await page.getByTestId("screen-TW-14").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForTimeout(500);
  // Ensure no leftover conflict chrome
  if (await page.getByTestId("builder-conflict").count()) {
    await page.getByRole("button", { name: "Keep mine" }).click();
    await page.waitForTimeout(800);
  }
  const meal = page.locator(".meal-summary-card").first();
  if (await meal.count()) await meal.click();
  await shot(page, "154-trainer-web-nutrition-builder-web");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
