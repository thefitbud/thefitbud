import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-11");

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

type Size = { w: number; h: number };
const SIZES: Size[] = [
  { w: 1440, h: 900 },
  { w: 1180, h: 820 },
  { w: 1024, h: 1366 },
];

async function shot(page: Page, name: string, size: Size) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}-${size.w}x${size.h}.png`),
    fullPage: false,
  });
  const locked = await windowLocked(page);
  expect.soft(locked.windowScrolls, name).toBe(false);
  expect.soft(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect.soft(problems.broken, name).toBe(0);
  expect.soft(problems.small, `${name} ${size.w}`).toEqual([]);
  expect.soft(problems.clip, `${name} ${size.w}`).toEqual([]);
}

/** The deep-linked panel is loaded: real client name, meta line, no placeholder, Home behind it ready. */
async function panelLoaded(page: Page) {
  const panel = page.getByTestId("screen-TW-05");
  await expect(panel.locator(".sp-name")).not.toHaveText(/^(Client|)$/, { timeout: 20_000 });
  await expect(panel.locator(".sp-meta")).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText("Loading")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText("Loading your day…")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".home-skel")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function openClient(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByTestId("screen-TW-04")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading your day…")).toHaveCount(0, { timeout: 20_000 });
  const who = page
    .locator(".home-rows [role=row]")
    .filter({ hasText: name })
    .first()
    .locator(".home-who");
  await expect(who).toBeVisible({ timeout: 30_000 });
  await who.click({ timeout: 30_000 });
  await expect(page.getByTestId("screen-TW-05")).toBeVisible();
  await expect(page.getByTestId("screen-TW-05").getByText("Loading")).toHaveCount(0);
}

/**
 * Step with the pager (the only item navigation, W13-13) to the item matching
 * `text` when the client has one; other specs in the same run may have
 * resolved it, so stop at the last item instead of waiting forever.
 */
async function stepToItem(page: Page, text: RegExp) {
  const panel = page.getByTestId("screen-TW-05");
  await expect(panel.locator(".sp-title")).toBeVisible({ timeout: 20_000 });
  for (let k = 0; k < 10; k += 1) {
    if (await panel.locator(".sp-title").filter({ hasText: text }).count()) return;
    const next = panel.getByRole("button", { name: "Next item" });
    if (!(await next.count()) || !(await next.isEnabled())) return;
    await next.click();
    await expect(panel.locator(".sp-title")).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("W13-11 Home, side panel, Check-ins inbox", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("home row click opens list mode, noted, resolve and undo", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openClient(page, "Neha");
    const panel = page.getByTestId("screen-TW-05");
    await expect(panel.getByText(/^1 of \d+$/)).toBeVisible();
    await panel.getByRole("button", { name: /^noted, keep open$/i }).click();
    await expect(panel.getByTestId("panel-noted-state")).toBeVisible({ timeout: 15_000 });
    await panel.getByRole("button", { name: /^resolve…?$/i }).click();
    await panel.getByRole("button", { name: /^resolve item$/i }).click();
    const banner = page.getByTestId("exception-resolve-banner");
    await expect(banner).toBeVisible();
    await banner.getByRole("button", { name: /^undo$/i }).click();
    await expect(banner).toBeHidden({ timeout: 15_000 });
  });

  test("check-ins inbox tabs and remind", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/checkins");
    await expect(page.getByRole("tab", { name: /to review/i })).toBeVisible({ timeout: 30_000 });
    for (const name of [/^due/i, /^overdue/i, /^reviewed/i, /^to review/i]) {
      await page.getByRole("tab", { name }).click();
      await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
    }
    await page.getByRole("tab", { name: /^due/i }).click();
    const remind = page.getByRole("button", { name: "Remind" }).first();
    if (await remind.isVisible().catch(() => false)) {
      await remind.click();
      await expect(page.getByTestId("inbox-remind-notice")).toBeVisible();
    }
  });

  test("captures every frame at three widths", async ({ page }) => {
    test.setTimeout(420_000);
    const token = await apiToken();
    const h = { Authorization: `Bearer ${token}` };
    const clients = (
      (await (await fetch(`${API}/clients?limit=100`, { headers: h })).json()) as {
        data: { items: Array<{ relationshipId: string | null; traineeDisplayName: string }> };
      }
    ).data.items;
    const resolvedOf = async (name: string) => {
      const c = clients.find((x) => x.traineeDisplayName.startsWith(name));
      const r = (await (
        await fetch(`${API}/exceptions/relationships/${c!.relationshipId}?status=resolved`, {
          headers: h,
        })
      ).json()) as { data: { items: Array<{ id: string }> } };
      return r.data.items[0]!.id;
    };
    const rohanResolved = await resolvedOf("Rohan");
    const kavyaResolved = await resolvedOf("Kavya");

    const passes = [
      { nudge: "Ishita", resolve: "Rohan" },
      { nudge: "Farhan", resolve: "Rohan" },
      { nudge: "Rohan", resolve: "Rohan" },
    ];

    for (const [i, size] of SIZES.entries()) {
      const pass = passes[i]!;
      await page.setViewportSize({ width: size.w, height: size.h });

      console.log("STEP W-02 list mode");
      await openClient(page, "Rohan");
      const panel = page.getByTestId("screen-TW-05");
      await shot(page, "W-02-home-side-panel", size);

      console.log("STEP W-02b remind states");
      await openClient(page, pass.nudge);
      if (pass.nudge === "Rohan") await stepToItem(page, /Missed workout/i);
      const remind = panel.getByRole("button", { name: /^remind/i });
      if (await remind.isEnabled()) {
        await remind.click();
        await page.waitForTimeout(1200);
        await shot(page, "W-02b-panel-nudge-states", size);
        if (await remind.isEnabled()) {
          await remind.click();
          await page.waitForTimeout(1200);
        }
        await shot(page, "W-02b-panel-nudge-states-second", size);
      } else {
        await shot(page, "W-02b-panel-nudge-states", size);
      }

      console.log("STEP W-02c resolve form, W-02d resolved + undo");
      await openClient(page, pass.resolve);
      await stepToItem(page, /Missed workout/i);
      await panel.getByRole("button", { name: /^resolve…?$/i }).click();
      await expect(panel.getByRole("button", { name: /^resolve item$/i })).toBeVisible();
      await shot(page, "W-02c-panel-resolve-form", size);
      await panel.getByRole("button", { name: /^talked to /i }).click();
      await panel.getByRole("button", { name: /^resolve item$/i }).click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeVisible();
      await shot(page, "W-02d-panel-resolved-undo", size);
      await page
        .getByTestId("exception-resolve-banner")
        .getByRole("button", { name: /^undo$/i })
        .click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeHidden({ timeout: 15_000 });

      console.log("STEP W-02e resolved read-only");
      await page.goto(`/?exception=${rohanResolved}`);
      await expect(page.getByTestId("panel-readonly-line")).toBeVisible({ timeout: 20_000 });
      await panelLoaded(page);
      await shot(page, "W-02e-panel-resolved-readonly", size);

      console.log("STEP W-02f / g / h resolve several");
      await openClient(page, "Farhan");
      await page.getByTestId("screen-TW-05").getByRole("button", { name: /resolve several/i }).click();
      await expect(page.getByTestId("bulk-select-list")).toBeVisible();
      await shot(page, "W-02f-panel-resolve-several", size);
      const boxes = page.getByTestId("bulk-select-list").getByRole("checkbox");
      for (let k = 0; k < 5; k += 1) await boxes.nth(k).check();
      await page.getByRole("button", { name: /^resolve 5 items…$/i }).click();
      const confirm = page.getByTestId("bulk-confirm");
      await expect(confirm).toBeVisible();
      await shot(page, "W-02g-panel-resolve-several-confirm", size);
      await confirm.getByRole("button", { name: /^talked to /i }).click();
      await confirm.getByRole("button", { name: /^resolve 5 items$/i }).click();
      await expect(page.getByTestId("bulk-undo-toast")).toBeVisible({ timeout: 15_000 });
      await shot(page, "W-02h-panel-resolve-several-undo", size);
      await page.getByTestId("bulk-undo-toast").getByRole("button", { name: /undo/i }).click();
      await page.waitForTimeout(1500);

      console.log("STEP W-02i ended client");
      await page.goto(`/?exception=${kavyaResolved}`);
      await expect(page.getByTestId("panel-readonly-foot")).toBeVisible({ timeout: 20_000 });
      await panelLoaded(page);
      await expect(page.getByTestId("panel-readonly-foot")).not.toContainText("with Client");
      await shot(page, "W-02i-panel-ended-readonly", size);

      console.log("STEP W-166 inbox");
      await page.goto("/checkins");
      await expect(page.getByRole("tab", { name: /to review/i })).toBeVisible({ timeout: 30_000 });
      await page.waitForTimeout(1500);
      await shot(page, "W-166-checkins-inbox", size);
    }
  });
});
