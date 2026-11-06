/**
 * TW-E behavioural proofs: activity, progress, check-ins, review, inbox.
 */
import { test, expect } from "@playwright/test";
import { signIn } from "./support/session";

const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const AARAV = "30e514e1-e3f4-4dac-ae4b-5f45e72c3df6";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const HARPREET = "519b5b84-c1bf-4bf3-ab4f-3cbb71e12f84";
const CHECKIN = "744e2975-255c-4469-9f9a-6da0a853c8f2";

test.describe("TW-E activity, progress, check-ins", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("TW-17 activity: segments, no generate button", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/activity`);
    await expect(page.getByTestId("screen-TW-17")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Workouts$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Meals$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate assignments/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /This week/i })).toBeVisible();
  });

  test("TW-18 progress: metric tabs and trend controls", async ({ page }) => {
    await page.goto(`/clients/${AARAV}/progress`);
    await expect(page.getByTestId("screen-TW-18")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progress", level: 1 })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Weight" })).toBeVisible();
    await expect(page.getByRole("button", { name: "12 w" })).toBeVisible();
  });

  test("TW-18 progress: empty weigh-ins copy", async ({ page }) => {
    // Rohan has an 8-week weigh-in series in the demo seed; Harpreet
    // (coaching ready) has none yet.
    await page.goto(`/clients/${HARPREET}/progress`);
    await expect(page.getByTestId("screen-TW-18")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "No weigh-ins yet. Weight is collected in check-ins.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Open check-in settings/i }),
    ).toBeVisible();
  });

  test("TW-19 client check-ins: schedule control", async ({ page }) => {
    await page.goto(`/clients/${DEEPAK}/check-ins`);
    await expect(page.getByTestId("screen-TW-19")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Check-ins", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Schedule check-in/i })).toBeVisible();
  });

  test("TW-20 review: sticky action bar at 1440", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Prefer an unreviewed inbox item so Save review is shown; fall back to known seed id.
    await page.goto("/checkins");
    await expect(page.getByTestId("screen-TW-22")).toBeVisible();
    const reviewLink = page.locator('a.button-primary', { hasText: "Review" }).first();
    if (await reviewLink.isVisible().catch(() => false)) {
      await reviewLink.click();
    } else {
      await page.goto(`/clients/${ROHAN}/check-ins/${CHECKIN}`);
    }
    await expect(page.getByTestId("screen-TW-20")).toBeVisible();
    const bar = page.getByTestId("review-action-bar");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(900);
    }
    await expect(
      page.getByRole("button", { name: /Save review|Edit review/i }),
    ).toBeVisible();
  });

  test("TW-22 inbox: tabs and default to review", async ({ page }) => {
    await page.goto("/checkins");
    await expect(page.getByTestId("screen-TW-22")).toBeVisible();
    await expect(page.locator('[data-filter="submitted"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator('[data-filter="due"]')).toBeVisible();
    await expect(page.locator('[data-filter="overdue"]')).toBeVisible();
    await expect(page.locator('[data-filter="reviewed"]')).toBeVisible();
  });

  test("TW-22 inbox: Review reachable at 768", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/checkins");
    await expect(page.getByTestId("screen-TW-22")).toBeVisible();
    await expect(page.locator(".inbox-card-list a.button-primary").first()).toBeVisible();
    const scroll = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(scroll).toBe(false);
  });
});

