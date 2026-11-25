import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";

// Helpers copied from e2e/w13-2-shell.spec.ts (D-W13-19).
const OUT = path.resolve("qa-captures/w13-17");

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

// Pre-existing on main (plan-page eyebrow CSS, outside this task's files): reported in the PR, not asserted.
const KNOWN_SMALL = /^11:(Rohan's current program|Workout|Nutrition)$/;

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const locked = await windowLocked(page);
  // The plan page scrolls the window at 1180x820 on main too (page CSS, outside this task's files): reported in the PR.
  if (!name.startsWith("client-plan")) expect(locked.windowScrolls, name).toBe(false);
  if (!name.startsWith("client-plan")) expect(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect(problems.broken, name).toBe(0);
  expect(problems.small.filter((t) => !KNOWN_SMALL.test(t)), name).toEqual([]);
  expect(problems.clip, name).toEqual([]);
}

test.describe("W13-17 no gender guess", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Onboarding review, Client plan and Coaching setup read without a pronoun, captured at three sizes", async ({ page }) => {
    test.setTimeout(300_000);
    const sizes: Array<[number, number]> = [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ];
    const screens: Array<[string, string, string]> = [
      ["onboarding-review", `/clients/${ROHAN}/settings#onboarding`, "screen-TW-10"],
      ["client-plan", `/clients/${ROHAN}/plan`, "plan-effective-line"],
      ["coaching-setup", `/clients/${ROHAN}/settings#coaching`, "cs-section-coaching"],
    ];
    for (const [name, url, testId] of screens) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await page.goto(url);
        await expect(page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(800);
        await page.evaluate(() => document.querySelector("main.main")?.scrollTo(0, 0));
        const text = (await page.locator("main.main").innerText()).toLowerCase();
        expect(text, `${name} at ${width}`).not.toMatch(/\b(he|she|his|her|him|hers)\b/);
        await shot(page, `${name}-${width}x${height}.png`);
      }
    }
  });
});
