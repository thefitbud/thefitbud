import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-6");

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


type Client = { relationshipId: string | null; traineeDisplayName: string; endedAt?: string | null };

async function clientsList() {
  const token = await apiToken();
  const res = await fetch(`${API}/clients?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
  return ((await res.json()) as { data: { items: Client[] } }).data.items;
}

async function ridOf(name: string) {
  const c = (await clientsList()).find((x) => x.traineeDisplayName.startsWith(name));
  return c!.relationshipId!;
}

/** A client that has at least `min` unresolved exceptions right now (other specs may have resolved the seeded ones). */
async function clientWithOpen(min: number) {
  const token = await apiToken();
  for (const c of await clientsList()) {
    if (!c.relationshipId || c.endedAt) continue;
    const res = await fetch(`${API}/exceptions/relationships/${c.relationshipId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const items = ((await res.json()) as { data: { items: Array<{ id: string; status: string }> } }).data.items;
    const open = items.filter((i) => i.status !== "resolved");
    if (open.length >= min) {
      return { rid: c.relationshipId, first: c.traineeDisplayName.split(" ")[0]!, open };
    }
  }
  throw new Error("no client with enough open exceptions");
}

/** Overview fully loaded: header name, week strip and weight card all settled. */
async function overviewLoaded(page: Page) {
  await expect(page.locator(".ws-name, h1").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Loading/)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".ov-card").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[class*=skel]")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function modalLoaded(page: Page) {
  const panel = page.getByTestId("screen-TW-05");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".sp-name")).not.toHaveText(/^(Client|)$/, { timeout: 20_000 });
  await expect(panel.locator(".sp-title")).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText("Loading")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(500);
  return panel;
}

test.describe("W13-6 Client Overview and review modal", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Review opens the list-mode modal; Esc closes and focus returns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { rid, first } = await clientWithOpen(2);
    await page.goto(`/clients/${rid}`);
    await overviewLoaded(page);
    const review = page.locator(".ov-att").getByRole("button", { name: "Review" }).first();
    await review.click();
    const panel = await modalLoaded(page);
    await expect(panel).toHaveClass(/sp-panel-modal/);
    const box = await panel.boundingBox();
    expect(Math.round(box!.width)).toBe(720);
    await expect(panel.getByText(/^1 of \d+$/)).toBeVisible();
    await expect(panel.getByRole("heading", { name: new RegExp(`also open for ${first}`, "i") })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^noted, keep open$/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^remind$/i })).toBeVisible();
    await expect(panel.getByRole("button", { name: /^resolve…?$/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("screen-TW-05")).toHaveCount(0);
    await expect(review).toBeFocused();
  });

  test("?exception= opens the modal; scrim click and browser back close it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { rid, open: openItems } = await clientWithOpen(2);
    const open = openItems[0]!;
    await page.goto(`/clients/${rid}?exception=${open.id}`);
    const panel = await modalLoaded(page);
    await expect(panel).toHaveClass(/sp-panel-modal/);
    await expect(panel.getByText(/^\d+ of \d+$/)).toBeVisible();
    await page.mouse.click(10, 450);
    await expect(page.getByTestId("screen-TW-05")).toHaveCount(0);

    await page.goto(`/clients/${rid}`);
    await overviewLoaded(page);
    await page.locator(".ov-att").getByRole("button", { name: "Review" }).first().click();
    await modalLoaded(page);
    await page.goBack();
    await expect(page.getByTestId("screen-TW-05")).toHaveCount(0);
  });

  test("captures every frame at three widths", async ({ page }) => {
    test.setTimeout(420_000);
    const clients = await clientsList();
    const rohan = await ridOf("Rohan");
    const kavya = clients.find((c) => c.traineeDisplayName.startsWith("Kavya"))!.relationshipId!;

    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });

      console.log("STEP W-03 overview");
      await page.goto(`/clients/${rohan}`);
      await overviewLoaded(page);
      await shot(page, "W-03-client-overview", size);
      // Same page scrolled inside .main so the rail is in view (the window itself never scrolls).
      await page.evaluate(() => {
        const side = document.querySelector(".overview-side");
        const main = document.querySelector("main.main");
        if (!side || !main) return;
        const delta = side.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom;
        main.scrollTop += delta + 16;
      });
      await page.waitForTimeout(300);
      await shot(page, "W-03-client-overview-rail", size);
      await page.evaluate(() => document.querySelector("main.main")?.scrollTo(0, 0));
      if (size.w <= 1180) {
        // Targets are measured on the element's own box (iPad widths), not a pseudo-element.
        const small = await page.evaluate(() => {
          const out: string[] = [];
          document
            .querySelectorAll(".ov-range-btn, .ov-dnav-btn, .ov-food-link, .ov-weight-f a, .ov-weight-f button, .ov-att button")
            .forEach((el) => {
              const b = el.getBoundingClientRect();
              if (b.width === 0 || b.height === 0) return;
              if (b.height < 43.5 || b.width < 43.5) {
                out.push(`${el.className}:${Math.round(b.width)}x${Math.round(b.height)}`);
              }
            });
          return out;
        });
        expect.soft(small, `44 px targets at ${size.w}`).toEqual([]);
      }

      // Layout: the rail sits below the food card at iPad widths, beside the main column at 1440.
      const geo = await page.evaluate(() => {
        const main = document.querySelector(".overview-main")!.getBoundingClientRect();
        const side = document.querySelector(".overview-side")!.getBoundingClientRect();
        const kids = Array.from(document.querySelectorAll(".overview-side > *")).map((e) => e.getBoundingClientRect());
        return { main: { l: main.left, r: main.right, b: main.bottom, w: main.width }, side: { l: side.left, t: side.top, w: side.width }, w0: kids[0], k1: kids[1] };
      });
      if (size.w <= 1180) {
        expect(geo.side.t, `rail below main at ${size.w}`).toBeGreaterThanOrEqual(geo.main.b - 1);
        expect(geo.main.w, `main full width at ${size.w}`).toBeGreaterThan(size.w * 0.85);
        expect(geo.k1.left, `rail two columns at ${size.w}`).toBeGreaterThan(geo.w0.right - 1);
      } else {
        expect(geo.side.l, `rail beside main at ${size.w}`).toBeGreaterThanOrEqual(geo.main.r - 1);
      }

      console.log("STEP W-03x modal");
      await page.locator(".ov-att").getByRole("button", { name: "Review" }).first().click();
      const panel = await modalLoaded(page);
      await shot(page, "W-03x-exception-modal", size);

      console.log("STEP W-03xb more menu");
      await panel.getByRole("button", { name: /more actions/i }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, "W-03xb-modal-more-menu", size);
      await page.keyboard.press("Escape");

      console.log("STEP W-03xc resolve form");
      const missed = panel.locator(".sp-also-row").filter({ hasText: /Missed workout/i }).first();
      if (!(await panel.locator(".sp-title").filter({ hasText: /Missed workout/i }).count()) && (await missed.count())) {
        await missed.click();
      }
      await panel.getByRole("button", { name: /^resolve…?$/i }).click();
      await expect(panel.getByRole("button", { name: /^resolve item$/i })).toBeVisible();
      await shot(page, "W-03xc-modal-resolve-form", size);

      console.log("STEP W-03xd resolved, next item");
      await panel.getByRole("button", { name: /talked to client/i }).click();
      await panel.getByRole("button", { name: /^resolve item$/i }).click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeVisible();
      await shot(page, "W-03xd-modal-resolved-next", size);
      await page.getByTestId("exception-resolve-banner").getByRole("button", { name: /^undo$/i }).click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeHidden({ timeout: 15_000 });
      await page.keyboard.press("Escape");

      console.log("STEP ended client overview");
      await page.goto(`/clients/${kavya}`);
      await overviewLoaded(page);
      await shot(page, "W-03-ended-client-overview", size);
    }
  });
});
