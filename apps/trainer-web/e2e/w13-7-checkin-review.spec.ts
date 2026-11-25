/**
 * W13-7: check-in review in two columns (frames W-163 and the iPad frame)
 * on the demo seed: layout, never clipped, one scroller, bottom bar on iPad.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-15");
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const CHECKIN = "27c1bdac-36fc-46b0-b563-bc086f9ffa5f";

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      dbg: `${doc.scrollHeight}/${doc.clientHeight}`,
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

async function checks(page: Page, name: string) {
  const locked = await windowLocked(page);
  expect.soft(locked.windowScrolls, `${name} ${locked.dbg}`).toBe(false);
  expect.soft(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect.soft(problems.broken, name).toBe(0);
  expect.soft(problems.small, name).toEqual([]);
  expect.soft(problems.clip, name).toEqual([]);
}

async function shot(page: Page, name: string) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  await checks(page, name);
}

/** Open the seeded check-in for review and wait for its real data. */
async function openReview(page: Page) {
  await page.goto(`/clients/${DEEPAK}/check-ins/${CHECKIN}?from=inbox`);
  await expect(page.getByTestId("screen-TW-20")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Loading review…")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
}

test.describe("W13-7 check-in review", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("captures the review at three sizes", async ({ page }) => {
    test.setTimeout(180_000);
    const sizes: Array<[string, number, number]> = [
      ["W-163-checkin-review", 1440, 900],
      ["W-163-checkin-review", 1180, 820],
      ["W-163-checkin-review", 1024, 1366],
    ];
    for (const [id, w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await openReview(page);
      await shot(page, `${id}-${w}x${h}.png`);
    }
  });

  test("the client's Check-ins tab still lists check-ins and links to the review", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    for (const [w, h] of [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/clients/${DEEPAK}/check-ins`);
      await expect(page.getByTestId("screen-TW-19")).toBeVisible();
      const open = page.locator(`a[href*="/check-ins/${CHECKIN}"]`).first();
      await expect(open).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/Loading/)).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await shot(page, `client-checkins-tab-${w}x${h}.png`);
    }
    await page.locator(`a[href*="/check-ins/${CHECKIN}"]`).first().click();
    await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();
  });

  test("two columns at 1440, card fully visible, window never scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page);
    const answers = await page.getByTestId("checkin-answers-col").boundingBox();
    const card = await page.getByTestId("review-action-bar").boundingBox();
    expect(answers && card).toBeTruthy();
    expect(card!.x).toBeGreaterThan(answers!.x + answers!.width - 1);
    expect(card!.y).toBeGreaterThanOrEqual(0);
    expect(card!.y + card!.height).toBeLessThanOrEqual(900);
    await expect(
      page.getByRole("button", { name: /Save review|Edit review/ }),
    ).toBeVisible();
    await checks(page, "1440");
  });

  test("iPad widths stack and the actions sit in a bottom bar", async ({ page }) => {
    for (const [w, h] of [
      [1180, 820],
      [1024, 1366],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await openReview(page);
      const save = page.getByRole("button", { name: /Save review/ });
      if ((await save.count()) === 0) continue; // already reviewed: no bar
      const bar = page.getByTestId("checkin-review-bar");
      await expect(bar).toBeVisible();
      const barBox = (await bar.boundingBox())!;
      expect(barBox.y + barBox.height).toBeLessThanOrEqual(h + 1);
      const saveBox = (await save.boundingBox())!;
      expect(saveBox.height).toBeGreaterThanOrEqual(44);
      expect(saveBox.y).toBeGreaterThanOrEqual(barBox.y);
      // Scrolled to the end, the last content ends above the bar's top edge.
      await page.evaluate(() => {
        const m = document.querySelector("main.main");
        if (m) m.scrollTop = m.scrollHeight;
      });
      const last = await page.locator(".checkin-review-grid").boundingBox();
      expect(last!.y + last!.height).toBeLessThanOrEqual(barBox.y + 1);
      await checks(page, `${w}`);
    }
  });

  test("the note-visibility checkbox is a 44 px row with a small box at every width", async ({
    page,
  }) => {
    const boxes: number[] = [];
    for (const [w, h] of [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await openReview(page);
      const cbx = page.getByRole("checkbox", { name: /can see this note$/ });
      if ((await cbx.count()) === 0) continue; // already reviewed: no note control
      const row = (await cbx.boundingBox())!;
      expect(row.height).toBeGreaterThanOrEqual(44);
      const glyph = (await cbx.locator("i").boundingBox())!;
      expect(glyph.width).toBeLessThanOrEqual(24);
      expect(glyph.height).toBeLessThanOrEqual(24);
      boxes.push(Math.round(glyph.width));
      await cbx.focus();
      await page.keyboard.press("Space");
      await expect(cbx).toHaveAttribute("aria-checked", "true");
    }
    expect(new Set(boxes).size).toBeLessThanOrEqual(1);
  });

  test("save a review: window stays put and the reviewed card is visible", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openReview(page);
    const save = page.getByRole("button", { name: "Save review" });
    if ((await save.count()) === 0) {
      await expect(page.getByText(/Reviewed by you/)).toBeVisible();
      return;
    }
    await page.getByLabel(/Note to/).fill("Good honest week. Keep step-ups.");
    await save.click();
    await expect(page.getByText(/Reviewed by you/)).toBeVisible({ timeout: 20_000 });
    const card = (await page.getByTestId("review-action-bar").boundingBox())!;
    expect(card.y + card.height).toBeLessThanOrEqual(900);
    await checks(page, "saved");
  });
});
