/**
 * W13-10: the v3 client header and tabs, and the client Settings tab
 * (frames W-209 + iPad, W-IP07, W-181, W-146) on the demo seed.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-10");
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";

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

async function openSection(page: Page, client: string, hash: string, testId: string) {
  await page.goto(`/clients/${client}/settings#${hash}`);
  await expect(page.getByTestId("client-settings-page")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
}

test.describe("W13-10 client header, tabs and Settings tab", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test("header: seven tabs ending in Settings, Remind and Note, ⋯ keeps End coaching only", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/overview`);
    const header = page.getByTestId("screen-TW-09a");
    await expect(header).toBeVisible({ timeout: 30_000 });
    const tabs = header.getByRole("navigation", { name: "Client sections" }).getByRole("link");
    await expect(tabs).toHaveText([
      "Overview",
      "Plan",
      "Activity",
      "Progress",
      /^Check-ins/,
      "History",
      "Settings",
    ]);
    await expect(header.getByRole("link", { name: "Message on WhatsApp" })).toBeVisible();
    await expect(header.getByTestId("wsh-remind")).toHaveText("Remind");
    await expect(header.getByTestId("wsh-note")).toBeVisible();
    await expect(header).not.toContainText(/nudg/i);
    await header.getByRole("button", { name: /More actions|Open menu/i }).click();
    await expect(page.getByRole("menuitem")).toHaveText([/End coaching/]);
    await page.keyboard.press("Escape");

    await header.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${ROHAN}/settings`));
    await expect(page.getByTestId("cs-section-basic")).toBeVisible({ timeout: 30_000 });
  });

  test("each Settings section loads from the sub-nav and by hash", async ({ page }) => {
    await openSection(page, ROHAN, "basic", "cs-section-basic");
    const nav = page.getByTestId("cs-subnav");
    const sections: Array<[string, string]> = [
      ["subscription", "cs-section-subscription"],
      ["coaching", "cs-section-coaching"],
      ["checkins", "cs-section-checkins"],
      ["reminders", "cs-section-reminders"],
      ["onboarding", "screen-TW-10"],
      ["danger", "cs-section-danger"],
      ["basic", "cs-section-basic"],
    ];
    for (const [hash, testId] of sections) {
      await nav.getByTestId(`cs-nav-${hash}`).click();
      await expect(page).toHaveURL(new RegExp(`#${hash}$`));
      await expect(page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
    }
    // The old id of the Coaching relationship section lands on the Danger zone.
    await openSection(page, ROHAN, "relationship", "cs-section-danger");
    await expect(page.getByTestId("cs-nav-danger")).toHaveAttribute("aria-current", "true");
  });

  test("old /configure and /onboarding URLs land on their sections", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/configure`);
    await expect(page).toHaveURL(new RegExp(`/clients/${ROHAN}/settings#coaching$`));
    await expect(page.getByTestId("cs-section-coaching")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("configure-footer")).toBeVisible();

    await page.goto(`/clients/${ROHAN}/onboarding`);
    await expect(page).toHaveURL(new RegExp(`/clients/${ROHAN}/settings#onboarding$`));
    await expect(page.getByTestId("screen-TW-10")).toBeVisible({ timeout: 30_000 });
  });

  test("Plan keeps a Coaching setup link into Settings", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/plan`);
    const link = page.getByRole("navigation", { name: "Plan sections" }).getByRole("link", {
      name: "Coaching setup",
    });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/settings#coaching$`));
    await expect(page.getByTestId("cs-section-coaching")).toBeVisible({ timeout: 30_000 });
  });

  test("editing client details saves", async ({ page }) => {
    await openSection(page, ROHAN, "basic", "cs-section-basic");
    const basic = page.getByTestId("cs-section-basic");
    const before = (await basic.getByTestId("cs-basic-name").locator("dd").textContent())?.trim() ?? "";
    await basic.getByRole("button", { name: "Edit basic details" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit basic details" });
    await dialog.getByLabel("Name").fill(`${before} (Tue)`);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(basic.getByTestId("cs-basic-name")).toContainText(`${before} (Tue)`);
    // Put the seed back.
    await basic.getByRole("button", { name: "Edit basic details" }).click();
    await dialog.getByLabel("Name").fill(before);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(basic.getByTestId("cs-basic-name")).toContainText(before);
  });

  test("Reminders still opens from the Overview as a drawer", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/overview`);
    await expect(page.getByTestId("screen-TW-09a")).toBeVisible({ timeout: 30_000 });
    await page
      .locator("section", { has: page.getByRole("heading", { name: "Reminders", exact: true }) })
      .getByRole("button", { name: "Details", exact: true })
      .click();
    const drawer = page.getByTestId("screen-TW-31");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(/Switch categories on or off in Settings › Reminders/);
    await expect(drawer).toContainText("Opened from Overview › Reminders › Details");
  });

  test("an ended client's sections are read-only", async ({ page }) => {
    await openSection(page, KAVYA, "basic", "cs-section-basic");
    await expect(page.getByTestId("cs-readonly-banner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit basic details" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End coaching…" })).toHaveCount(0);
    await page.getByTestId("cs-nav-coaching").click();
    await expect(page.getByTestId("configure-readonly")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("configure-footer")).toHaveCount(0);
    await page.getByTestId("cs-nav-reminders").click();
    await expect(page.getByTestId("cs-section-reminders")).toContainText(
      "Reminders are off while coaching is ended.",
    );
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("captures the Settings frames at 1440, 1180 and 1024", async ({ page }) => {
    test.setTimeout(300_000);
    const sizes: Array<[number, number]> = [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ];
    const frames: Array<[string, string, string]> = [
      ["W-209", "basic", "cs-section-basic"],
      ["W-IP07", "coaching", "cs-section-coaching"],
      ["W-181", "reminders", "cs-reminders-summary"],
      ["W-146", "onboarding", "screen-TW-10"],
    ];
    for (const [id, hash, testId] of frames) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await openSection(page, ROHAN, hash, testId);
        await page.waitForTimeout(800);
        await page.evaluate(() => document.querySelector("main.main")?.scrollTo(0, 0));
        const name =
          id === "W-209" && width === 1024 ? "W-209-ipad" : id;
        await shot(page, `${name}-${width}x${height}.png`);
      }
    }
  });
});
