/**
 * W13-8: Activity (frames W-158 + iPad) and History (W-165) on the demo seed.
 * Behaviour first (type filter, meal panel, History by day), then the captures
 * at 1440x900, 1180x820 and 1024x1366 with the check-web.mjs checks.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-8");
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";

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

// Copied from e2e/w13-2-shell.spec.ts (D-W13-19): the check-web.mjs checks.
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
  expect.soft(locked.windowScrolls, name).toBe(false);
  expect.soft(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect.soft(problems.broken, name).toBe(0);
  expect.soft(problems.small, name).toEqual([]);
  expect.soft(problems.clip, name).toEqual([]);
}

/** Targets on the Activity and History toolbars and rows are at least 44 px at iPad widths. */
async function smallTargets(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    document.querySelectorAll(sel).forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      if (box.height + 0.5 < 44 || box.width + 0.5 < 44) {
        bad.push(`${(el.textContent ?? "").trim().slice(0, 20)} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
    });
    return bad;
  }, selector);
}

async function openActivity(page: Page) {
  await page.goto(`/clients/${ROHAN}/activity`);
  await expect(page.getByTestId("screen-TW-17")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("activity-row").first()).toBeVisible({ timeout: 20_000 });
  // Meal details load after the list; wait for them so no row is half-drawn.
  await page.waitForLoadState("networkidle");
}

async function openHistory(page: Page) {
  await page.goto(`/clients/${ROHAN}/history`);
  await expect(page.getByTestId("screen-TW-21")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("history-row").first()).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

test.describe("W13-8 Activity and History", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Activity: one toolbar row, type filter, day cards and the meal panel", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openActivity(page);
    const toolbar = page.locator(".activity-toolbar");
    const seg = await page.locator(".activity-type-segment").boundingBox();
    const range = await page.getByRole("button", { name: /^Date range/ }).boundingBox();
    expect(seg && range && Math.abs(seg.y - range.y) < 12).toBe(true);
    await expect(toolbar).toBeVisible();

    await page.getByRole("button", { name: /^Workouts$/ }).click();
    await expect(page.getByRole("button", { name: /^Workouts$/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /^Meals$/ }).click();
    await expect(page.getByRole("button", { name: /^Meals$/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("activity-day-group").first()).toBeVisible();

    await page.getByRole("button", { name: /^Status/ }).click();
    await expect(page.getByRole("menuitemradio", { name: "Any" })).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByTestId("activity-row").first().getByRole("button", { name: "View" }).click();
    await expect(page.getByTestId("activity-drawer")).toBeVisible();
  });

  test("History: grouped by day with sentence titles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openHistory(page);
    const days = page.getByTestId("history-day");
    expect(await days.count()).toBeGreaterThan(0);
    await expect(days.first().getByRole("heading")).toBeVisible();
    const text = await page.getByTestId("history-days").innerText();
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}/);
    await page.getByRole("button", { name: /^Type/ }).click();
    await page.getByRole("menuitemradio", { name: "Meals" }).click();
    await expect(page.getByTestId("history-row").first()).toBeVisible();
  });

  test("captures Activity and History at three sizes", async ({ page }) => {
    test.setTimeout(240_000);
    const sizes: Array<[number, number]> = [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      await openActivity(page);
      await shot(page, `W-158-activity-${width}x${height}.png`);
      if (width <= 1180) {
        expect.soft(await smallTargets(page, ".activity-toolbar button, .activity-toolbar input, .activity-feed-actions button"), `activity targets ${width}`).toEqual([]);
      }
      await openHistory(page);
      await shot(page, `W-165-history-${width}x${height}.png`);
      if (width <= 1180) {
        expect.soft(await smallTargets(page, ".history-toolbar button, .history-toolbar input"), `history targets ${width}`).toEqual([]);
      }
    }
  });
});
