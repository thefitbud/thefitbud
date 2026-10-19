/**
 * TW-G tablet smoke — WebKit iPad viewports (shell nav, clients, overflow).
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/", { timeout: 45_000 });
}

test.describe("TW-G iPad shell smoke", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("sign-in, shell nav, clients list, overflow menu", async ({ page }) => {
    // Icon rail at 768–1279 hides nav labels — navigate by href / role.
    const clientsNav = page.locator('a.shell-nav-link[href="/clients"]');
    if (await clientsNav.count()) {
      await clientsNav.first().click();
    } else {
      await page.goto("/clients");
    }
    await expect(page).toHaveURL(/\/clients/);
    await expect(page.getByRole("heading", { name: /Clients/i })).toBeVisible({
      timeout: 20_000,
    });

    // Sidebar should be present as icon rail (not bottom nav) at tablet widths.
    await expect(page.locator(".shell-side")).toBeVisible();

    const overflow = page.getByRole("button", { name: /More actions|Open menu/i }).first();
    if (await overflow.isVisible()) {
      await overflow.click();
      await expect(page.getByRole("menu")).toBeVisible();
    }
  });
});
