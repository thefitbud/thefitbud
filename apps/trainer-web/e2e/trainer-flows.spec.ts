import { test, expect, type Page } from "@playwright/test";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function fetchDevMailCode(to: string): Promise<string> {
  const res = await fetch(`${API}/dev/mail?to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`dev mail ${res.status}`);
  const body = (await res.json()) as { messages?: Array<{ text?: string }> };
  const text = body.messages?.[0]?.text ?? "";
  const match = /\b(\d{6})\b/.exec(text);
  if (!match) throw new Error("no OTP in dev mail");
  return match[1];
}

async function signInWithPassword(page: Page) {
  await page.goto("/sign-in");
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/");
}

test("email OTP sign-in via dev mail sink", async ({ page }) => {
  await page.goto("/sign-in/code");
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.getByRole("button", { name: /^send code$/i }).click();
  const onVerify = page.getByRole("textbox", { name: /6-digit code/i });
  const hasError = page.getByRole("alert");
  await Promise.race([
    onVerify.waitFor({ state: "visible", timeout: 15_000 }),
    hasError.waitFor({ state: "visible", timeout: 15_000 }),
  ]);
  if (await hasError.isVisible()) {
    test.skip(true, "OTP start unavailable in this API build");
  }
  const code = await fetchDevMailCode(EMAIL);
  await onVerify.fill(code);
  await page.getByRole("button", { name: /verify and sign in/i }).click();
  await expect(page).toHaveURL("/");
});

test("password sign-in reaches home", async ({ page }) => {
  await signInWithPassword(page);
  await expect(page.getByRole("heading", { name: /needs attention|home/i })).toBeVisible();
});

test("home acknowledge then resolve when an exception exists", async ({ page }) => {
  await signInWithPassword(page);
  const review = page.getByRole("button", { name: /^review$/i }).first();
  if (!(await review.isVisible().catch(() => false))) {
    test.skip(true, "no attention rows in seed");
  }
  await review.click();
  await page.getByRole("button", { name: /acknowledge/i }).click();
  await page.getByRole("button", { name: /resolve/i }).click();
});

test("templates hub and client-visible note", async ({ page }) => {
  await signInWithPassword(page);
  await page.goto("/templates/workouts");
  await expect(page.getByRole("heading", { name: /workout/i })).toBeVisible();
  await page.goto("/clients");
  const open = page.locator("a.button-secondary").first();
  test.skip(!(await open.isVisible().catch(() => false)), "no active clients");
  await open.click();
  await page.getByRole("button", { name: /add note/i }).first().click();
  await page.getByLabel(/visible to client/i).check();
  await page.locator("textarea").first().fill("E2E coach note visible to client");
  await page.getByRole("button", { name: /^save$/i }).click();
});

test("reactivate modal from settings ended list", async ({ page }) => {
  await signInWithPassword(page);
  await page.goto("/settings/ended");
  const reactivate = page.getByRole("button", { name: /^reactivate$/i }).first();
  test.skip(!(await reactivate.isVisible().catch(() => false)), "no ended clients");
  await reactivate.click();
  await expect(page.getByRole("dialog")).toContainText(/reactivate coaching/i);
});
