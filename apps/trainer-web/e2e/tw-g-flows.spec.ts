/**
 * TW-G behavioural proofs: history, settings, notifications, ended/reactivate, responsiveness.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";
const NIKHIL = "8919b5c0-73fa-495a-958e-e9333a41f4e7";
const FARHAN = "778a793a-d04e-44bc-b7aa-187f70573275";
const ISHITA = "0a72ab36-f042-46dc-bceb-67725d78b46a";
const AARAV = "30e514e1-e3f4-4dac-ae4b-5f45e72c3df6";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/", { timeout: 45_000 });
}

test.describe("TW-G history, settings, ended, reminders", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("TW-21 history: week groups, kind pills, empty copy", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/history`);
    await expect(page.getByTestId("screen-TW-21")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Week of /i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("button", { name: /^All$/i })).toBeVisible();
    await expect(page.locator(".history-kind-pill").first()).toBeVisible();
    await expect(page.getByText("clinical intervention")).toHaveCount(0);
  });

  test("TW-28 settings: sub-nav, help mailto, profile", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings\/profile/);
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: /Settings sections/i });
    await expect(nav.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Notifications" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Ended clients" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Units & language" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Help" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Privacy & data" })).toBeVisible();
    await expect(page.getByTestId("screen-TW-28")).toBeVisible();

    await page.goto("/settings/help");
    const mail = page.getByRole("link", { name: /Email FitBud support/i });
    await expect(mail).toBeVisible();
    const href = await mail.getAttribute("href");
    expect(href).toMatch(/^mailto:tech@thefitbud\.com/);
    expect(href).toContain("subject=");
    expect(decodeURIComponent(href!)).toContain("TW-28");
    await expect(page.getByText(/We'll get back to you within a day/i)).toBeVisible();
    await expect(page.getByText("Help & Support")).toHaveCount(0);
  });

  test("TW-29 notification toggles persist after reload", async ({ page }) => {
    await page.goto("/settings/notifications");
    await expect(page.getByTestId("screen-TW-29")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Client asked you on WhatsApp")).toBeVisible();
    await expect(page.getByText(/at most one summary per hour/i)).toBeVisible();
    await expect(page.getByText(/10:00 pm|10:00\s*pm/i).or(page.getByText(/Quiet hours/i))).toBeVisible();

    const morning = page.getByRole("checkbox", { name: /Morning summary/i });
    await expect(morning).toBeVisible();
    const wasChecked = await morning.isChecked();
    await morning.click();
    await page.waitForTimeout(800);
    await page.reload();
    await expect(page.getByTestId("screen-TW-29")).toBeVisible({ timeout: 20_000 });
    const morningAgain = page.getByRole("checkbox", { name: /Morning summary/i });
    await expect(morningAgain).toBeChecked({ checked: !wasChecked });
    // restore
    await morningAgain.click();
    await page.waitForTimeout(600);
  });

  test("TW-30 ended roster and Kavya read-only workspace", async ({ page }) => {
    await page.goto("/clients?status=ended");
    await expect(page.getByText("Kavya")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Nikhil")).toBeVisible();
    await expect(page.getByText(/Ended /i).first()).toBeVisible();

    await page.goto(`/clients/${KAVYA}/overview`);
    await expect(page.getByTestId("screen-TW-30")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/read-only/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Reactivate coaching/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Add note$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Progress" })).toBeVisible();
  });

  test("TW-30 Nikhil pending reactivation UI", async ({ page }) => {
    await page.goto(`/clients/${NIKHIL}/overview`);
    await expect(page.getByTestId("screen-TW-30")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Waiting for .* to confirm/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Remind on WhatsApp/i })).toBeVisible();
    const remind = page.getByRole("link", { name: /Remind on WhatsApp/i });
    const href = await remind.getAttribute("href");
    expect(href).toMatch(/wa\.me/);
    await expect(page.getByRole("button", { name: /Cancel request/i })).toBeVisible();
  });

  test("TW-30 end coaching modal type-to-confirm (cancel)", async ({ page }) => {
    await page.goto(`/clients/${AARAV}/overview`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /More actions|Open menu/i }).click();
    await page.getByRole("menuitem", { name: /End coaching/i }).click();
    await expect(page.getByRole("heading", { name: /End coaching with/i })).toBeVisible();
    await expect(page.getByText(/keeps .* account and history/i)).toBeVisible();
    await expect(page.getByText(/Plans, reminders and nudges stop today/i)).toBeVisible();
    const endBtn = page.getByRole("button", { name: /^End coaching$/i });
    await expect(endBtn).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(page.getByRole("heading", { name: /End coaching with/i })).toHaveCount(0);
  });

  test("TW-31 responsiveness labels for Farhan, Ishita, Rohan", async ({ page }) => {
    await page.goto(`/clients/${FARHAN}/overview`);
    await expect(page.getByText(/Reminders paused/i).first()).toBeVisible({ timeout: 20_000 });

    await page.goto(`/clients/${ISHITA}/overview`);
    await expect(page.getByText(/Notifications off/i).first()).toBeVisible({ timeout: 20_000 });

    await page.goto(`/clients/${ROHAN}/overview`);
    await expect(page.getByText(/Not enough data/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Details$/i }).click();
    await expect(page.getByTestId("screen-TW-31")).toBeVisible();
    await expect(page.getByText(/WhatsApp reminders · Coming soon/i)).toBeVisible();
    await expect(page.getByText(/You can switch categories on or off in Configure/i)).toBeVisible();
  });

  test("TW-30 reactivate modal from settings ended list", async ({ page }) => {
    await page.goto("/settings/ended");
    await expect(page.getByTestId("screen-TW-30")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Kavya")).toBeVisible();
    await page.getByRole("button", { name: /^Reactivate$/i }).first().click();
    await expect(page.getByRole("heading", { name: /Reactivate coaching with/i })).toBeVisible();
    await expect(page.getByText(/What comes back/i)).toBeVisible();
    await expect(page.getByText(/What doesn't/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Send reactivation request/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();
  });
});
