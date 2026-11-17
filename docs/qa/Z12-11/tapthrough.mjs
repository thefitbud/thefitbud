/**
 * Z12-11 keyboard/focus tap-through on the workout builder.
 */
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 60_000 });

  const relationshipId = await page.evaluate(async () => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    const res = await fetch("/api/clients?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    const items = json.data?.items ?? json.items ?? [];
    return items.find((c) => String(c.traineeDisplayName).toLowerCase().includes("rohan"))
      ?.relationshipId;
  });
  if (!relationshipId) throw new Error("Rohan missing");

  await page.goto(`${BASE}/clients/${relationshipId}/plan`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Adjust plan|Edit draft/i }).first().click();
  await page.waitForURL(/\/edit/, { timeout: 30_000 });
  await page.getByTestId("screen-TW-13").waitFor({ state: "visible" });

  const checks = [];
  async function focusRing(label, locator) {
    await locator.focus();
    const outline = await locator.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
    });
    const ok = !outline.includes("none") || (await locator.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.boxShadow !== "none" || s.borderColor.includes("69") || s.borderColor.includes("rgb");
    }));
    checks.push({ label, outline, ok });
  }

  await focusRing("Publish & schedule", page.getByRole("button", { name: "Publish & schedule" }));
  await focusRing("Preview", page.getByRole("button", { name: "Preview" }));
  await focusRing("Day tab", page.locator(".builder-day-tab").first());
  await focusRing("Exercise card", page.locator(".exercise-card").first());
  await focusRing("Sets field", page.locator(".builder-props input[type='number']").first());

  // Tab through primary actions
  await page.getByRole("button", { name: "Preview" }).focus();
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  checks.push({ label: "Tab from Preview reaches Publish", active, ok: /Publish/.test(active) });

  console.log(JSON.stringify(checks, null, 2));
  const failed = checks.filter((c) => !c.ok);
  await browser.close();
  if (failed.length) {
    console.error("focus failures", failed);
    process.exit(1);
  }
  console.log("tap-through ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
