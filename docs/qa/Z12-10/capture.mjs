/**
 * Z12-10 visual captures at 1440×900.
 * Requires a seeded API + trainer-web on TRAINER_WEB_URL (default :5174).
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

async function clientsByName(page) {
  return page.evaluate(async () => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    if (!token) throw new Error("No access token");
    const res = await fetch("/api/clients?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items = json.data?.items ?? json.items ?? [];
    const find = (needle) =>
      items.find((c) => c.traineeDisplayName?.toLowerCase().includes(needle));
    return {
      harpreet: find("harpreet")?.relationshipId ?? null,
      rohan: find("rohan")?.relationshipId ?? null,
    };
  });
}

async function shot(page, name) {
  const path = join(OUT, `${name}-1440x900.png`);
  await page.screenshot({ path, fullPage: false });
  const text = await page.locator("body").innerText();
  await writeFile(join(OUT, `${name}-1440x900.txt`), text.slice(0, 8000), "utf8");
  console.log("saved", path);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await signIn(page);
  const ids = await clientsByName(page);
  if (!ids.harpreet || !ids.rohan) {
    throw new Error(`Missing clients: ${JSON.stringify(ids)}`);
  }

  // 151 — empty plan (Harpreet)
  await page.goto(`${BASE}/clients/${ids.harpreet}/plan`, { waitUntil: "networkidle" });
  await page.getByTestId("empty-state").waitFor({ state: "visible", timeout: 30_000 });
  await shot(page, "151-trainer-web-plan-empty-web");

  // 200 — plan filtered (Rohan): Workout + Status Superseded
  await page.goto(`${BASE}/clients/${ids.rohan}/plan`, { waitUntil: "networkidle" });
  await page.getByRole("table").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("button", { name: "Workout" }).click();
  await page.getByRole("combobox", { name: "Status" }).selectOption("superseded");
  await page.waitForTimeout(500);
  await shot(page, "200-trainer-web-plan-filtered-web");

  // 155 — assign modal: create a draft, then open ?assign=1
  await page.locator(".pp-toolbar").getByRole("button", { name: "Adjust plan" }).click();
  await page.waitForURL(/\/edit/, { timeout: 30_000 });
  await page.goto(`${BASE}/clients/${ids.rohan}/plan?assign=1`, {
    waitUntil: "networkidle",
  });
  const dialog = page.getByTestId("screen-TW-16");
  await dialog.waitFor({ state: "visible", timeout: 20_000 });
  await shot(page, "155-trainer-web-assign-plan-web");
  await page.keyboard.press("Escape");

  // 156 — diet scope demo
  await page.goto(`${BASE}/clients/${ids.rohan}/plan?dietScope=1`, {
    waitUntil: "networkidle",
  });
  await page.getByRole("heading", { name: "Apply this change to…" }).waitFor({
    state: "visible",
    timeout: 15_000,
  });
  await shot(page, "156-trainer-web-diet-scope-web");
  await page.keyboard.press("Escape");

  // 157 — partial failure demo
  await page.goto(`${BASE}/clients/${ids.rohan}/plan?assignPartial=1`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-16-partial").waitFor({ state: "visible", timeout: 15_000 });
  await shot(page, "157-trainer-web-assign-partial-failure-web");

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
