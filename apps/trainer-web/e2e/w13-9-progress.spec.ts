/**
 * W13-9: Progress with a grouped metric rail, KPI row and v3 chart
 * (frames W-160 and W-160 iPad) on the demo seed.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-9");
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

/** iPad widths: every control on the page is at least 44x44 by its own box (labels count for their inputs). */
async function undersizedTargets(page: Page) {
  return page.locator("main.main").evaluate((node) => {
    const selectors = [
      "button",
      "a[href]",
      "[role='button']",
      "[role='radio']",
      "[role='tab']",
      "input[type='checkbox']",
      "select",
    ].join(",");
    const bad: string[] = [];
    for (const el of Array.from(node.querySelectorAll(selectors))) {
      const target = el.matches("input[type='checkbox']")
        ? (el.closest("label") ?? el)
        : el;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (el.closest(".sr-only")) continue;
      if (rect.width + 0.5 < 44 || rect.height + 0.5 < 44) {
        bad.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        );
      }
    }
    return bad;
  });
}

async function openProgress(page: Page) {
  await page.goto(`/clients/${ROHAN}/progress`);
  await expect(page.getByTestId("screen-TW-18")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pg-kpis")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("pg-chart-svg").first()).toBeVisible();
  await expect(page.locator(".pg-skel")).toHaveCount(0);
}

test.describe("W13-9 progress", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("selecting a rail metric changes the chart; the range control and the KPI row work", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openProgress(page);
    const rail = page.getByRole("complementary", { name: "Metrics" });
    await expect(rail.getByText("Body", { exact: true })).toBeVisible();
    await expect(rail.getByRole("tab", { name: /Weight/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("heading", { name: "Weight", level: 2 })).toBeVisible();
    await expect(page.locator("main.main")).not.toContainText(/\d\s?%/);

    // Tooltip on hover: a value and a date like "Wed 21 Oct".
    const box = (await page.getByTestId("pg-chart-svg").boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.getByTestId("pg-tooltip")).toContainText(
      /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/,
    );

    // Another metric in the rail: the heading and the chart change.
    const other = rail.getByRole("tab").filter({ hasNotText: /Weight|No entries/ }).first();
    await other.click();
    await expect(other).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("heading", { level: 2 }).first()).not.toHaveText("Weight");
    await expect(page.getByTestId("pg-chart-svg").first()).toBeVisible();

    // Range control: 4 wk, 6 mo, All, 12 wk.
    for (const name of ["4 wk", "6 mo", "All", "12 wk"]) {
      await page.getByRole("radio", { name }).click();
      await expect(page.getByRole("radio", { name })).toHaveAttribute("aria-checked", "true");
      await expect(page.locator(".pg-skel")).toHaveCount(0, { timeout: 20_000 });
    }
  });

  test("iPad widths: targets are at least 44 px and nothing scrolls sideways", async ({
    page,
  }) => {
    for (const [w, h] of [
      [1180, 820],
      [1024, 1366],
    ] as Array<[number, number]>) {
      await page.setViewportSize({ width: w, height: h });
      await openProgress(page);
      expect(await undersizedTargets(page), `${w}x${h}`).toEqual([]);
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(sideways, `${w}x${h}`).toBe(false);
    }
  });

  test("captures W-160 at the three sizes", async ({ page }) => {
    test.setTimeout(180_000);
    const sizes: Array<[number, number]> = [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await openProgress(page);
      await shot(page, `W-160-progress-${w}x${h}.png`);
    }
  });
});
