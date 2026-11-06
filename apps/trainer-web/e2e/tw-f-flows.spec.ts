/**
 * TW-F behavioural proofs: templates hub, form builders, libraries, use/fork.
 */
import { test, expect } from "@playwright/test";
import { signIn } from "./support/session";

const ONBOARDING = "10111111-1111-4111-8111-111111111111";
const CHECKIN = "c1000001-0000-4000-8000-000000000001";

test.describe("TW-F templates, forms, libraries", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("TW-23 hub: six tabs and workouts list loads", async ({ page }) => {
    await page.goto("/templates");
    await expect(page).toHaveURL(/\/templates\/workouts/);
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Template types" });
    await expect(tabs.getByRole("link", { name: "Workouts" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Diets" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Full plans" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Check-ins" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Onboarding" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Libraries" })).toBeVisible();
    await expect(page.getByTestId("screen-TW-23")).toBeVisible();
    await expect(page.getByText("Could not load this list")).toHaveCount(0);
    await expect(page.getByText("FitBud base").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /^Use$/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Fork to edit/i }).first()).toBeVisible();
  });

  test("TW-27 Use modal excludes ended clients", async ({ page }) => {
    await page.goto("/templates/workouts");
    await expect(page.getByTestId("screen-TW-23")).toBeVisible();
    await page.getByRole("button", { name: /^Use$/ }).first().click();
    await expect(page.getByTestId("use-template-modal")).toBeVisible();
    await expect(page.getByText(/Creates a draft plan for/i)).toBeVisible();
    await expect(page.getByText("Kavya")).toHaveCount(0);
    await expect(page.getByText("Nikhil")).toHaveCount(0);
  });

  test("TW-27 Fork modal lands on Mine editor", async ({ page }) => {
    await page.goto("/templates/workouts");
    await page.getByRole("button", { name: /Fork to edit/i }).first().click();
    await expect(page.getByTestId("fork-template-modal")).toBeVisible();
    await expect(page.getByText(/Your copy is yours to edit/i)).toBeVisible();
    await page.getByRole("button", { name: /^Fork$/ }).click();
    await expect(page).toHaveURL(/\/templates\/workouts\/[0-9a-f-]+/, {
      timeout: 30_000,
    });
  });

  test("TW-24 onboarding builder two panes", async ({ page }) => {
    await page.goto(`/templates/onboarding/${ONBOARDING}`);
    await expect(page.getByTestId("screen-TW-24")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fork to edit/i })).toBeVisible();
    await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
  });

  test("TW-25 check-in builder blocks", async ({ page }) => {
    await page.goto(`/templates/checkins/${CHECKIN}`);
    await expect(page.getByTestId("screen-TW-25")).toBeVisible();
    await expect(page.getByRole("button", { name: /Fork to edit/i })).toBeVisible();
    await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
  });

  test("TW-26 libraries sticky table and selects", async ({ page }) => {
    await page.goto("/templates/libraries/exercises");
    await expect(page.getByTestId("screen-TW-26")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("columnheader", { name: "Primary muscles" })).toBeVisible();
    await expect(page.getByText("defaultReps")).toHaveCount(0);
    await expect(page.getByText("defaultLoadLabel")).toHaveCount(0);
    await expect(
      page.getByRole("group", { name: "Library type" }).getByRole("link", {
        name: "Exercises",
      }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Foods" }).click();
    await expect(page.getByRole("columnheader", { name: "Basis" })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("TW-25.1 configure has check-in form select", async ({ page }) => {
    const rohan = "c422296e-ed7b-4196-a2b4-647096af3002";
    await page.goto(`/clients/${rohan}/configure`);
    await expect(page.getByTestId("screen-TW-11")).toBeVisible({
      timeout: 30_000,
    });
    const checkins = page.locator("details").filter({
      has: page.locator(".configure-accordion-title", { hasText: "Check-ins" }),
    });
    await expect(checkins).toBeVisible();
    await checkins.locator("summary").click();
    await expect(checkins.getByLabel("Check-in form")).toBeVisible();
  });
});
