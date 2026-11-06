/**
 * TW-G tablet smoke — WebKit iPad viewports (shell nav, clients, overflow, tap targets).
 */
import { test, expect, type Locator } from "@playwright/test";
import { signIn } from "./support/session";
import { CLIENT_WORKSPACE_TABS } from "../src/components/workspace/workspaceTabs";


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
    const tabs = page.getByRole("navigation", { name: /Client sections/i });
    const tabLinks = tabs.getByRole("link");
    await expect(tabLinks).toHaveCount(CLIENT_WORKSPACE_TABS.length);
    for (const [index, tab] of CLIENT_WORKSPACE_TABS.entries()) {
      await expect(tabLinks.nth(index)).toContainText(tab.label);
    }
    for (const forbidden of ["Sessions", "Packages", "Configure"] as const) {
      await expect(
        tabs.getByRole("link", { name: forbidden, exact: true }),
      ).toHaveCount(0);
    }
    await assertTapTargets(page.locator("body"), "Workspace overview");

    await page.goto("/checkins");
    await expect(page.getByRole("heading", { name: /Check-ins/i })).toBeVisible({
      timeout: 20_000,
    });
    await assertTapTargets(page.locator("body"), "Inbox");
  });
});

/**
 * IP1a — reminders Close and ⋯ overflow rows, measured in CSS pixels.
 * Fixture only: no API. Stylesheets load in the same order as main.tsx.
 */
test.describe("IP1a iPad hit targets", () => {
  test("reminders Close is ≥44×44 and overflow items are ≥44px tall", async ({
    page,
  }) => {
    const origin = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
    await page.setContent(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="${origin}/" />
          <link rel="stylesheet" href="/src/styles.css" />
          <link rel="stylesheet" href="/src/styles/shell.css" />
          <link rel="stylesheet" href="/src/styles/home.css" />
          <link rel="stylesheet" href="/src/styles/clients.css" />
          <link rel="stylesheet" href="/src/styles/workspace.css" />
          <link rel="stylesheet" href="/src/styles/templates.css" />
          <link rel="stylesheet" href="/src/styles/tap-targets.css" />
        </head>
        <body>
          <aside class="drawer-panel" data-testid="screen-TW-31">
            <header class="drawer-head">
              <h2>Reminders</h2>
              <button type="button" class="icon-btn reminders-close" aria-label="Close">×</button>
            </header>
          </aside>
          <div class="overflow-menu">
            <ul class="overflow-menu-list" role="menu">
              <li role="none">
                <button type="button" role="menuitem" class="overflow-menu-item">Edit note</button>
              </li>
              <li role="none">
                <button type="button" role="menuitem" class="overflow-menu-item overflow-menu-item-destructive">End coaching</button>
              </li>
            </ul>
          </div>
        </body>
      </html>`,
      { waitUntil: "load" },
    );

    const size = await page.locator(".reminders-close").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    expect(
      size.w + 0.5,
      `reminders Close width ${size.w}`,
    ).toBeGreaterThanOrEqual(44);
    expect(
      size.h + 0.5,
      `reminders Close height ${size.h}`,
    ).toBeGreaterThanOrEqual(44);

    const items = page.locator(".overflow-menu-item");
    expect(await items.count()).toBe(2);
    const heights = await items.evaluateAll((nodes) =>
      nodes.map((el) => el.getBoundingClientRect().height),
    );
    for (const height of heights) {
      expect(height + 0.5, `overflow item height ${height}`).toBeGreaterThanOrEqual(
        44,
      );
    }
  });
});

/**
 * IP1b — Plan Versions/Show, Progress check-in links, Settings "Forgot it?".
 * Fixture only: no API. Stylesheets load in the same order as the app
 * (page CSS, then tap-targets.css). Landscape project viewport is 1024×768.
 */
test.describe("IP1b iPad hit targets", () => {
  test("versions toggle, check-in links, and Forgot it? are at least 44px", async ({
    page,
  }) => {
    const origin = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
    await page.setContent(
      `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <base href="${origin}/" />
          <link rel="stylesheet" href="/src/styles.css" />
          <link rel="stylesheet" href="/src/styles/workspace.css" />
          <link rel="stylesheet" href="/src/styles/plan.css" />
          <link rel="stylesheet" href="/src/styles/tap-targets.css" />
        </head>
        <body>
          <button type="button" class="plan-versions-toggle" aria-expanded="false">
            <h2 id="plan-versions-heading">Versions</h2>
            <span>Show</span>
          </button>
          <table class="progress-data-table">
            <tbody>
              <tr><td><a class="progress-checkin-link" href="/clients/1/check-ins/a">From check-in · 12 Oct</a></td></tr>
              <tr><td><a class="progress-checkin-link" href="/clients/1/check-ins/b">From check-in · 5 Oct</a></td></tr>
              <tr><td><a class="progress-checkin-link" href="/clients/1/check-ins/c">From check-in · 28 Sep</a></td></tr>
              <tr><td><a class="progress-checkin-link" href="/clients/1/check-ins/d">From check-in · 21 Sep</a></td></tr>
            </tbody>
          </table>
          <p class="muted">
            <a class="profile-forgot-link" href="/forgot-password">Forgot it?</a>
            Use the email code flow to set a new password.
          </p>
        </body>
      </html>`,
      { waitUntil: "load" },
    );

    const viewport = page.viewportSize();
    expect(viewport?.width, "tablet query is max-width 1024px").toBeLessThanOrEqual(
      1024,
    );

    const toggle = await page.locator(".plan-versions-toggle").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const heading = el.querySelector("h2");
      const show = el.querySelector("span");
      return {
        w: rect.width,
        h: rect.height,
        headingFont: heading ? getComputedStyle(heading).fontSize : "",
        showFont: show ? getComputedStyle(show).fontSize : "",
      };
    });
    expect(toggle.w + 0.5, `versions toggle width ${toggle.w}`).toBeGreaterThanOrEqual(
      44,
    );
    expect(toggle.h + 0.5, `versions toggle height ${toggle.h}`).toBeGreaterThanOrEqual(
      44,
    );
    expect(toggle.headingFont, "Versions heading type stays 1rem").toBe("16px");
    expect(toggle.showFont, "Show label type stays 1rem").toBe("16px");

    const links = page.locator(".progress-checkin-link");
    expect(await links.count()).toBe(4);
    const linkBoxes = await links.evaluateAll((nodes) =>
      nodes.map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          w: rect.width,
          h: rect.height,
          font: getComputedStyle(el).fontSize,
        };
      }),
    );
    for (const box of linkBoxes) {
      expect(box.w + 0.5, `check-in link width ${box.w}`).toBeGreaterThanOrEqual(44);
      expect(box.h + 0.5, `check-in link height ${box.h}`).toBeGreaterThanOrEqual(44);
      expect(box.font, "check-in link type stays 1rem").toBe("16px");
    }

    const forgot = await page.locator(".profile-forgot-link").evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        w: rect.width,
        h: rect.height,
        font: getComputedStyle(el).fontSize,
      };
    });
    expect(forgot.w + 0.5, `Forgot it? width ${forgot.w}`).toBeGreaterThanOrEqual(44);
    expect(forgot.h + 0.5, `Forgot it? height ${forgot.h}`).toBeGreaterThanOrEqual(44);
    expect(forgot.font, "Forgot it? type stays 1rem").toBe("16px");
  });
});
