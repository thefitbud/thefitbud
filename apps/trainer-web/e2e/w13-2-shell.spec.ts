import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-2");

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainOverflow: mainStyle?.overflowY ?? "missing",
    };
  });
}

async function textProblems(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    const clip: string[] = [];
    let broken = 0;
    document.querySelectorAll("img").forEach((img) => {
      if (!img.complete || img.naturalWidth === 0) broken += 1;
    });
    document.querySelectorAll("body *").forEach((el) => {
      const text = [...el.childNodes]
        .filter((node) => node.nodeType === 3 && node.textContent?.trim())
        .map((node) => node.textContent?.trim() ?? "")
        .join(" ");
      if (!text) return;
      const cs = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      if (el.closest(".sr-only")) return;
      const size = Number.parseFloat(cs.fontSize);
      if (size < 12 && !el.closest(".shell-kbd, .ui-kbd, kbd")) {
        small.push(`${size}:${text.slice(0, 24)}`);
      }
      if (el.matches("main.main, .shell-bell-popover, .shell-palette-results")) return;
      if (
        el.scrollWidth > el.clientWidth + 2 &&
        cs.overflow !== "visible" &&
        cs.overflowX !== "visible"
      ) {
        clip.push(text.slice(0, 40));
      }
    });
    return { small, clip, broken };
  });
}

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const locked = await windowLocked(page);
  expect(locked.windowScrolls, name).toBe(false);
  expect(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect(problems.broken, name).toBe(0);
  expect(problems.small, name).toEqual([]);
  expect(problems.clip, name).toEqual([]);
}

test.describe("W13-2 shell, nav and settings", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("nav reaches every item and the account menu signs out", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const items: Array<[string, RegExp]> = [
      ["nav-home", /\/$/],
      ["nav-clients", /\/clients$/],
      ["nav-checkins", /\/checkins$/],
      ["nav-templates", /\/templates$/],
      ["nav-library", /\/templates\/libraries/],
      ["nav-help", /\/settings\/help$/],
      ["nav-settings", /\/settings\/profile$/],
    ];
    for (const [testId, url] of items) {
      await page.getByTestId(testId).click();
      await expect(page).toHaveURL(url);
    }
    await expect(page.getByRole("link", { name: "More" })).toHaveCount(0);

    await page.getByTestId("account-menu-button").click();
    await expect(page.getByTestId("account-menu")).toBeVisible();
    await page.getByTestId("account-sign-out").click();
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
  });

  test("each settings sub-page loads", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const pages: Array<[string, string]> = [
      ["settings-nav-profile", "screen-TW-28"],
      ["settings-nav-notifications", "screen-TW-29"],
      ["settings-nav-business", "screen-settings-business"],
      ["settings-nav-units", "screen-settings-units"],
      ["settings-nav-ended", "screen-TW-30"],
      ["settings-nav-privacy", "privacy-data-page"],
    ];
    await page.goto("/settings");
    for (const [navId, screenId] of pages) {
      await page.getByTestId(navId).click();
      await expect(page.getByTestId(screenId)).toBeVisible({ timeout: 20_000 });
    }
    await page.goto("/settings/help");
    await expect(page.getByTestId("screen-settings-help")).toBeVisible();
  });

  test("captures settings, the account menu, and long pages", async ({ page }) => {
    test.setTimeout(180_000);
    const frames: Array<[string, string, number, number, () => Promise<void>]> = [
      [
        "W-176-settings-profile",
        "/settings/profile",
        1440,
        900,
        async () => undefined,
      ],
      [
        "W-176-settings-profile",
        "/settings/profile",
        1180,
        820,
        async () => undefined,
      ],
      [
        "W-176-settings-profile",
        "/settings/profile",
        1024,
        1366,
        async () => undefined,
      ],
      [
        "W-177-settings-notifications-menu",
        "/settings/notifications",
        1440,
        900,
        async () => {
          await page.getByTestId("account-menu-button").click();
          await expect(page.getByTestId("account-menu")).toBeVisible();
        },
      ],
      [
        "W-177-settings-notifications-menu",
        "/settings/notifications",
        1180,
        820,
        async () => {
          await page.getByTestId("account-menu-button").click();
          await expect(page.getByTestId("account-menu")).toBeVisible();
        },
      ],
      [
        "W-177-settings-notifications-menu",
        "/settings/notifications",
        1024,
        1366,
        async () => {
          await page.getByTestId("account-menu-button").click();
          await expect(page.getByTestId("account-menu")).toBeVisible();
        },
      ],
    ];

    for (const [name, url, width, height, prepare] of frames) {
      await page.setViewportSize({ width, height });
      await page.goto(url);
      await expect(page.getByTestId("screen-settings")).toBeVisible({ timeout: 20_000 });
      if (url.includes("profile")) {
        await expect(page.getByTestId("screen-TW-28")).toBeVisible();
        const phone = page.getByLabel("WhatsApp number");
        await expect(phone).not.toHaveValue("");
        const phoneBox = await phone.boundingBox();
        const codeBox = await page.locator(".settings-phone-code").boundingBox();
        expect(codeBox?.width ?? 0).toBeGreaterThan(80);
        expect(codeBox?.width ?? 999).toBeLessThan(120);
        expect(phoneBox?.width ?? 0).toBeGreaterThan(120);
      }
      if (url.includes("notifications")) {
        await expect(page.getByTestId("screen-TW-29")).toBeVisible({ timeout: 20_000 });
      }
      const reachedBottom = await page.locator("main.main").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
        return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
      });
      expect(reachedBottom).toBe(true);
      await page.locator("main.main").evaluate((el) => {
        el.scrollTop = 0;
      });
      await prepare();
      await shot(page, `${name}-${width}x${height}.png`);
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("screen-TW-04")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Loading your day…")).toHaveCount(0, { timeout: 20_000 });
    await page.locator("main.main").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await shot(page, "home-bottom-1440x900.png");

    await page.goto("/templates");
    await expect(page.getByTestId("screen-TW-23-hub")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Loading templates…")).toHaveCount(0, { timeout: 20_000 });
    await page.locator("main.main").evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await shot(page, "templates-bottom-1440x900.png");
  });
});
