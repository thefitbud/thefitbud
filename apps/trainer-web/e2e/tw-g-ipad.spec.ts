/**
 * TW-G tablet smoke — WebKit iPad viewports (shell nav, clients, overflow, tap targets).
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

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

async function assertTapTargets(root: Locator, label: string) {
  const undersized = await root.evaluate((node) => {
    const selectors = [
      "button",
      "a[href]",
      "[role='button']",
      "[role='tab']",
      "input[type='checkbox']",
      "input[type='radio']",
      "input[type='search']",
      "input[type='text']",
      ".overflow-menu-trigger",
      ".filter-pill",
      ".segment-tab",
      ".segment-btn",
      ".button-sm",
      ".link",
      ".text-link",
      ".wsh-tab",
      ".wsh-crumb a",
      ".filter-search",
    ].join(",");
    const seen = new Set<Element>();
    const bad: Array<{ tag: string; text: string; w: number; h: number }> = [];
    for (const el of Array.from(node.querySelectorAll(selectors))) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.classList.contains("skip-link")) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      // Off-screen / visually clipped controls are not tablet hit targets.
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (rect.width + 0.5 < 44 || rect.height + 0.5 < 44) {
        bad.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        });
      }
    }
    return bad;
  });
  expect(undersized, `${label}: ${JSON.stringify(undersized.slice(0, 12))}`).toEqual(
    [],
  );
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
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
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

  test("interactive controls meet 44×44 tap targets on Home and Roster", async ({
    page,
  }) => {
    await expect(page.getByTestId("screen-TW-04")).toBeVisible({
      timeout: 20_000,
    });
    await assertTapTargets(page.locator("body"), "Home");

    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: /^Clients$/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertTapTargets(page.locator("body"), "Roster");

    await page.goto("/clients?status=ended");
    await expect(page.getByText("Kavya")).toBeVisible({ timeout: 20_000 });
    await assertTapTargets(page.locator("body"), "Ended roster");
  });

  test("workspace and inbox controls meet 44×44 tap targets", async ({
    page,
  }) => {
    // Resolve Aarav's workspace via directory so the ID stays seed-stable.
    const token = await page.evaluate(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          identifier: "rahul.coach@demo.fitbud.test",
          password: "FitBud-demo-2026",
        }),
      });
      const json = (await res.json()) as { data?: { token?: string } };
      return json.data?.token ?? null;
    });
    expect(token).toBeTruthy();
    const directory = await page.evaluate(async (authToken) => {
      const res = await fetch("/api/clients?limit=50", {
        headers: { authorization: `Bearer ${authToken}` },
      });
      return (await res.json()) as {
        data?: { items?: Array<{ traineeDisplayName?: string; relationshipId?: string }> };
      };
    }, token);
    const aarav = directory.data?.items?.find((item) =>
      (item.traineeDisplayName ?? "").toLowerCase().includes("aarav"),
    );
    expect(aarav?.relationshipId).toBeTruthy();
    await page.goto(`/clients/${aarav!.relationshipId}/overview`);
    await expect(page.getByRole("heading", { name: /Aarav/i })).toBeVisible({
      timeout: 25_000,
    });
    await assertTapTargets(page.locator("body"), "Workspace overview");

    await page.goto("/checkins");
    await expect(page.getByRole("heading", { name: /Check-ins/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertTapTargets(page.locator("body"), "Inbox");
  });
});
