import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve(`qa-captures/${process.env.W13_CAPTURE_DIR ?? "w13-5"}`);

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainOverflow: mainStyle?.overflowY ?? "missing",
      sideways: doc.scrollWidth > doc.clientWidth + 1,
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

/** Controls inside the page (not the shell) that are under 44 px tall. */
async function smallTargets(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const scope = document.querySelectorAll("main.main button, main.main input, [role=dialog] button, [role=dialog] input");
    scope.forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;
      if (el.closest(".sr-only")) return;
      if (box.height < 43.5) {
        out.push(`${Math.round(box.height)}:${(el.textContent ?? "").trim().slice(0, 24) || el.tagName}`);
      }
    });
    return out;
  });
}

async function shot(page: Page, name: string, ipad: boolean) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const locked = await windowLocked(page);
  expect(locked.windowScrolls, name).toBe(false);
  expect(locked.sideways, name).toBe(false);
  expect(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect(problems.broken, name).toBe(0);
  expect(problems.small, name).toEqual([]);
  expect(problems.clip, name).toEqual([]);
  if (ipad) expect(await smallTargets(page), name).toEqual([]);
}

const SIZES: Array<[number, number]> = [
  [1440, 900],
  [1180, 820],
  [1024, 1366],
];

test.describe("W13-5 templates and library", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Make a copy from a base template opens the editor", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates/workouts");
    const baseRow = page.locator("tr", { hasText: "FitBud base" }).first();
    await expect(baseRow).toBeVisible({ timeout: 30_000 });
    await baseRow.getByRole("button", { name: /More actions for/i }).click();
    await page.getByRole("menuitem", { name: "Make a copy" }).click();
    await expect(page.getByTestId("fork-template-modal")).toBeVisible();
    await page.getByRole("button", { name: "Make a copy" }).click();
    await expect(page).toHaveURL(/\/templates\/workouts\/[0-9a-f-]+/, { timeout: 30_000 });
  });

  test("Library foods and exercises load", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates/libraries/foods");
    await expect(page.getByRole("columnheader", { name: "Food" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Exercises" }).click();
    await expect(page.getByRole("columnheader", { name: "Exercise" })).toBeVisible({ timeout: 30_000 });
  });

  test("captures every target frame at three sizes", async ({ page }) => {
    test.setTimeout(240_000);
    for (const [width, height] of SIZES) {
      const ipad = width < 1280;
      await page.setViewportSize({ width, height });

      await page.goto("/templates");
      await expect(page.locator(".templates-hub-table tbody tr").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Loading templates…")).toHaveCount(0, { timeout: 20_000 });
      await expect(
        page.locator("[data-testid=used-by], [data-testid=used-by-empty]").first(),
      ).toBeVisible({ timeout: 20_000 });
      if (ipad) {
        await expect(page.getByRole("columnheader", { name: "Edited" })).toBeHidden();
      } else {
        await expect(page.getByRole("columnheader", { name: "Edited" })).toBeVisible();
      }
      await expect(page.getByRole("button", { name: "Use for client" }).first()).toHaveClass(/ui-btn-quiet/);
      await shot(page, `W-168-templates-${width}x${height}.png`, ipad);

      // W-174 Use template for a client, client list open.
      await page.getByRole("button", { name: "Use for client" }).first().click();
      const useModal = page.getByTestId("use-template-modal");
      await expect(useModal).toBeVisible();
      await useModal.getByRole("combobox", { name: "Client" }).click();
      await expect(page.getByPlaceholder("Search clients")).toBeVisible();
      await shot(page, `W-174-use-for-client-modal-${width}x${height}.png`, ipad);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(useModal).toBeHidden();

      // W-175 Make a copy, from a FitBud base row.
      await page.goto("/templates/workouts");
      await expect(page.locator("tr", { hasText: "FitBud base" }).first()).toBeVisible({ timeout: 30_000 });
      await page
        .locator("tr", { hasText: "FitBud base" })
        .first()
        .getByRole("button", { name: /More actions for/i })
        .click();
      await page.getByRole("menuitem", { name: "Make a copy" }).click();
      await expect(page.getByTestId("fork-template-modal")).toBeVisible();
      await shot(page, `W-175-fork-modal-${width}x${height}.png`, ipad);
      await page.keyboard.press("Escape");

      // W-172 and W-173.
      await page.goto("/templates/libraries/foods");
      await expect(page.locator(".libraries-table tbody tr").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, `W-172-library-foods-${width}x${height}.png`, ipad);
      await page.goto("/templates/libraries/exercises");
      await expect(page.locator(".libraries-table tbody tr").first()).toBeVisible({ timeout: 30_000 });
      await shot(page, `W-173-library-exercises-${width}x${height}.png`, ipad);
    }
  });
});
