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

  test("TW-23 hub: type filters and templates table loads", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByRole("heading", { name: "Templates", level: 1 })).toBeVisible();
    const types = page.getByRole("tablist", { name: "Template types" });
    for (const label of ["All", "Workouts", "Nutrition", "Check-in forms", "Intake forms"]) {
      await expect(types.getByRole("tab", { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expect(page.getByTestId("screen-TW-23")).toBeVisible();
    await expect(page.getByText("Could not load this list")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Template" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("columnheader", { name: "Used by" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use for client" }).first()).toBeVisible();
  });

  test("TW-27 Use modal excludes ended clients", async ({ page }) => {
    await page.goto("/templates/workouts");
    await expect(page.getByTestId("screen-TW-23")).toBeVisible();
    await page.getByRole("button", { name: "Use for client" }).first().click();
    await expect(page.getByTestId("use-template-modal")).toBeVisible();
    await expect(page.getByText(/This opens a draft plan for/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Open draft/i })).toBeVisible();
    await expect(page.getByText("Kavya")).toHaveCount(0);
    await expect(page.getByText("Nikhil")).toHaveCount(0);
  });

  test("W13-5 Use for client opens a draft for the chosen client", async ({ page }) => {
    await page.goto("/templates/workouts");
    await expect(page.getByTestId("screen-TW-23")).toBeVisible();
    await page.getByRole("button", { name: "Use for client" }).first().click();
    const modal = page.getByTestId("use-template-modal");
    await expect(modal).toBeVisible();
    await modal.getByRole("combobox", { name: "Client" }).click();
    await page.getByPlaceholder("Search clients").fill("a");
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /Open draft/i }).click();
    await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+\/plan\/[0-9a-f-]+\/versions\/[0-9a-f-]+\/edit/, {
      timeout: 30_000,
    });
  });

  test("TW-27 Fork modal lands on Mine editor", async ({ page }) => {
    await page.goto("/templates/workouts");
    await expect(page.getByText("FitBud base").first()).toBeVisible({ timeout: 20_000 });
    await page
      .locator("tr", { hasText: "FitBud base" })
      .first()
      .getByRole("button", { name: /More actions for/i })
      .click();
    await page.getByRole("menuitem", { name: /Make a copy/i }).click();
    await expect(page.getByTestId("fork-template-modal")).toBeVisible();
    await expect(page.getByText(/The copy is yours to change/i)).toBeVisible();
    await page.getByRole("button", { name: "Make a copy" }).click();
    await expect(page).toHaveURL(/\/templates\/workouts\/[0-9a-f-]+/, {
      timeout: 30_000,
    });
  });

  test("TW-24 onboarding builder list and Question panel", async ({ page }) => {
    await page.goto(`/templates/onboarding/${ONBOARDING}`);
    await expect(page.getByTestId("screen-TW-24")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /Fork to edit/i })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Question" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Questions" })).toBeVisible();
    await page.getByRole("button", { name: /^Preview$/i }).click();
    await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
  });

  test("TW-25 check-in builder blocks", async ({ page }) => {
    await page.goto(`/templates/checkins/${CHECKIN}`);
    await expect(page.getByTestId("screen-TW-25")).toBeVisible();
    await expect(page.getByRole("button", { name: /Fork to edit/i })).toBeVisible();
    await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
  });

  test("TW-26 libraries table, source filter, and drawers", async ({ page }) => {
    await page.goto("/templates/libraries/exercises");
    await expect(page.getByTestId("screen-TW-26")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Exercise" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("columnheader", { name: "Equipment" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Source" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Logged by clients, not in library/i }),
    ).toBeVisible();
    await expect(page.getByText("defaultReps")).toHaveCount(0);
    await expect(page.getByText("defaultLoadLabel")).toHaveCount(0);
    await expect(
      page.getByRole("tablist", { name: "Library type" }).getByRole("tab", {
        name: "Exercises",
      }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Foods" }).click();
    await expect(page.getByRole("columnheader", { name: "Food" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("columnheader", { name: "Serving · kcal" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Source/i })).toBeVisible();
    const firstFood = page.locator(".libraries-table tbody tr").first();
    await firstFood.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: /Make my copy|Edit/i })).toBeVisible();
  });

  test("TW-25.1 configure has check-in form select", async ({ page }) => {
    const rohan = "c422296e-ed7b-4196-a2b4-647096af3002";
    await page.goto(`/clients/${rohan}/configure`);
    await expect(page.getByTestId("screen-TW-11")).toBeVisible({
      timeout: 30_000,
    });
    // W13-10: Settings › Check-ins is an always-open row in its own card.
    const checkins = page.getByTestId("cs-section-checkins");
    await expect(checkins).toBeVisible();
    await expect(checkins.getByLabel("Check-in form")).toBeVisible();
  });
});
