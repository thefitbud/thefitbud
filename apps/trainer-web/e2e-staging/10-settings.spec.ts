import { test, expect } from "./support/fixtures";
import { shot } from "./support/screenshots";

// Read-only: opens More (Settings) and looks at Profile and Notifications. It changes
// nothing, and in particular never touches the password.
test("More opens Settings: profile and notifications", async ({ trainerPage: page, qa }) => {
  await page
    .locator('aside[aria-label="Primary"]')
    .getByRole("link", { name: /^More/ })
    .click();
  await expect(page).toHaveURL(/\/settings(\/profile)?$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await sections.getByRole("link", { name: /^Profile/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(qa.trainerEmail);
  await shot(page, "web-settings__profile");

  await sections.getByRole("link", { name: /^Notifications/ }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Notifications" })).toBeVisible();
  await shot(page, "web-settings__notifications");
});
