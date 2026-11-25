import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

// W13-13 (D-W13-21): the review panel takes the trainer app's Z14-23 layout.
const OUT = path.resolve("qa-captures/w13-13");

type Size = { w: number; h: number };
const SIZES: Size[] = [
  { w: 1440, h: 900 },
  { w: 1180, h: 820 },
  { w: 1024, h: 1366 },
];

/* Same checks as e2e/w13-2-shell.spec.ts (check-web.mjs). */
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

/** Panel controls on iPad widths: every target at least 44 px high (and wide). */
async function smallTargets(panel: Locator) {
  return panel.evaluate((root) => {
    const out: string[] = [];
    root
      .querySelectorAll<HTMLElement>("button, a[href], [role=button], input, textarea")
      .forEach((el) => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return;
        if (el.closest(".sr-only")) return;
        if (el.tagName === "TEXTAREA") return;
        // A checkbox inside its row label: the whole row is the hit area.
        if (el.tagName === "INPUT" && el.closest("label")) {
          const row = el.closest("label")!.getBoundingClientRect();
          if (row.height >= 43.5) return;
        }
        // The note composer belongs to W13-16 / W13-22 (reported in the PR).
        if (el.closest(".note-composer, .note-earlier")) return;
        if (box.height < 43.5 || box.width < 43.5) {
          out.push(`${Math.round(box.width)}x${Math.round(box.height)}:${(el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 24)}`);
        }
      });
    return out;
  });
}

/** The footer never covers panel content: the body ends where the footer starts. */
async function footerCovers(panel: Locator) {
  return panel.evaluate((root) => {
    const body = root.querySelector<HTMLElement>(".drawer-body");
    const foot = root.querySelector<HTMLElement>(".drawer-foot");
    if (!body || !foot) return false;
    return body.getBoundingClientRect().bottom > foot.getBoundingClientRect().top + 1;
  });
}

async function shot(page: Page, name: string, size: Size) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({
    path: path.join(OUT, `${name}-${size.w}x${size.h}.png`),
    fullPage: false,
  });
  const locked = await windowLocked(page);
  expect.soft(locked.windowScrolls, `${name} ${size.w} window scroll`).toBe(false);
  expect.soft(locked.mainOverflow, name).toBe("auto");
  const problems = await textProblems(page);
  expect.soft(problems.broken, name).toBe(0);
  expect.soft(problems.small, `${name} ${size.w}`).toEqual([]);
  expect.soft(problems.clip, `${name} ${size.w}`).toEqual([]);
  const panel = page.getByTestId("screen-TW-05");
  if (await panel.count()) {
    expect.soft(await footerCovers(panel), `${name} ${size.w} footer covers body`).toBe(false);
    if (size.w <= 1180) {
      expect.soft(await smallTargets(panel), `${name} ${size.w} targets`).toEqual([]);
    }
  }
}

type Client = { relationshipId: string | null; traineeDisplayName: string };
type Item = { id: string; status: string; type: string; severity: string; detectedAt: string };

async function api<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const token = await apiToken();
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${pathname}: ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

async function clients(): Promise<Client[]> {
  return (await api<{ items: Client[] }>("/clients?limit=100")).items;
}

async function openItems(rid: string): Promise<Item[]> {
  const items = (await api<{ items: Item[] }>(`/exceptions/relationships/${rid}`)).items;
  return items.filter((i) => i.status !== "resolved");
}

async function clientNamed(name: string): Promise<Client & { relationshipId: string }> {
  const c = (await clients()).find((x) => x.traineeDisplayName.startsWith(name));
  if (!c?.relationshipId) throw new Error(`no client ${name}`);
  return c as Client & { relationshipId: string };
}

const NOT_REMINDABLE = new Set(["skipped_meal", "skipped_workout", "meal_logged_later"]);
/** Clients other specs act on; the resolving flow below leaves them alone. */
const SHARED = ["Rohan", "Farhan", "Kavya", "Neha", "Ishita", "Meera", "Arjun"];

/** A client with exactly two open, not-yet-noted items, one remindable. */
async function flowClient() {
  for (const c of await clients()) {
    if (!c.relationshipId) continue;
    if (SHARED.some((s) => c.traineeDisplayName.startsWith(s))) continue;
    const open = await openItems(c.relationshipId).catch(() => [] as Item[]);
    if (open.length !== 2) continue;
    if (!open.every((i) => i.status === "active" || i.status === "detected")) continue;
    if (!open.some((i) => !NOT_REMINDABLE.has(i.type))) continue;
    return { rid: c.relationshipId, name: c.traineeDisplayName, open };
  }
  throw new Error("no client with two open items");
}

async function openFromHome(page: Page, name: string) {
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
  return panelLoaded(page);
}

async function panelLoaded(page: Page) {
  const panel = page.getByTestId("screen-TW-05");
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await expect(panel.locator(".sp-name")).not.toHaveText(/^(Client|)$/, { timeout: 20_000 });
  await expect(panel.locator(".sp-title, .sp-summary-title").first()).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText("Loading")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator(".home-skel, [class*=skel]")).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(600);
  return panel;
}

/** Step with the pager (the only item navigation) to a remindable, open item. */
async function stepToOpenItem(panel: Locator) {
  for (let k = 0; k < 10; k += 1) {
    if (await panel.getByRole("button", { name: /^noted, keep open$/i }).count()) return;
    const next = panel.getByRole("button", { name: "Next item" });
    if (!(await next.count()) || !(await next.isEnabled())) return;
    await next.click();
    await expect(panel.locator(".sp-title")).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("W13-13 review panel (Z14-23 layout on web)", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("Home: Remind, Noted then Undo, Resolve with an outcome, all-done summary", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const flow = await flowClient();
    const first = flow.name.split(" ")[0]!;
    const panel = await openFromHome(page, flow.name);

    // One card, three named actions, no ⋯ menu, no captions.
    await expect(panel.getByText(/^1 of 2$/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /more actions/i })).toHaveCount(0);
    await expect(panel.getByText(/push notification|Noted keeps it open|leaves Home when/)).toHaveCount(0);
    await expect(panel.getByTestId("panel-client-link")).toHaveAttribute(
      "href",
      `/clients/${flow.rid}`,
    );
    await expect(panel.getByRole("button", { name: "Add note" })).toBeVisible();

    // Remind on the remindable item.
    for (let k = 0; k < 2; k += 1) {
      const remind = panel.getByRole("button", { name: `Remind ${first}` });
      if (await remind.count()) {
        await remind.click();
        await expect(
          panel.getByTestId("panel-nudge-result").or(panel.getByTestId("panel-nudge-limit")),
        ).toBeVisible({ timeout: 15_000 });
        break;
      }
      await panel.getByRole("button", { name: "Next item" }).click();
      await expect(panel.getByText(/^2 of 2$/)).toBeVisible();
    }
    // Back to item 1 with the pager (‹ or ←).
    if (await panel.getByText(/^2 of 2$/).count()) {
      await page.keyboard.press("ArrowLeft");
      await expect(panel.getByText(/^1 of 2$/)).toBeVisible();
    }

    // Noted, keep open → state line → Undo → Noted again.
    await panel.getByRole("button", { name: /^noted, keep open$/i }).click();
    const state = panel.getByTestId("panel-noted-state");
    await expect(state).toContainText(/Noted by you (at|on) .* · still open/, { timeout: 15_000 });
    await state.getByRole("button", { name: "Undo" }).click();
    await expect(panel.getByRole("button", { name: /^noted, keep open$/i })).toBeVisible({
      timeout: 15_000,
    });
    await panel.getByRole("button", { name: /^noted, keep open$/i }).click();
    await expect(state).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId("panel-more-open")).toHaveText(`1 more open for ${first}`);

    // › to item 2, Resolve… with an outcome.
    await panel.getByRole("button", { name: "Next item" }).click();
    await expect(panel.getByText(/^2 of 2$/)).toBeVisible();
    await panel.getByRole("button", { name: /^resolve…$/i }).click();
    await expect(panel.getByTestId("panel-lock-line")).toBeVisible();
    await panel.getByRole("button", { name: `Talked to ${first}` }).click();
    await panel.getByRole("button", { name: /^resolve item$/i }).click();
    const banner = page.getByTestId("exception-resolve-banner");
    await expect(banner).toContainText(`Resolved by you at`);
    await expect(banner).toContainText(`Talked to ${first}`);

    // After the Undo window the client is done.
    const summary = panel.getByTestId("panel-all-done");
    await expect(summary).toBeVisible({ timeout: 20_000 });
    await expect(summary).toContainText(`All done for ${first}`);
    await expect(summary).toContainText("1 resolved · 1 noted, still open");
    await page.waitForTimeout(400);
    await shot(page, "W-02-review-all-done-resolved", { w: 1440, h: 900 });

    // Next client opens the next client waiting on Home.
    const nextClient = panel.getByTestId("panel-next-client");
    await expect(nextClient).toBeVisible();
    const nextName = ((await nextClient.textContent()) ?? "").replace(/^.*Next client:\s*/, "").trim();
    await nextClient.click();
    await expect(panel.locator(".sp-name")).toHaveText(nextName, { timeout: 20_000 });
  });

  test("Overview: the modal has the same layout and the window never scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const rohan = await clientNamed("Rohan");
    await page.goto(`/clients/${rohan.relationshipId}`);
    await expect(page.locator(".ov-card").first()).toBeVisible({ timeout: 30_000 });
    // Wait for the full list: until it loads the card shows only the most
    // severe item from the workspace read model.
    await expect(page.locator(".ov-att")).toHaveCount(
      (await openItems(rohan.relationshipId)).length,
      { timeout: 20_000 },
    );
    await page.locator(".ov-att").getByRole("button", { name: "Review" }).first().click();
    const panel = await panelLoaded(page);
    await expect(panel).toHaveClass(/sp-panel-modal/);
    await expect(panel.getByText(/^1 of \d+$/)).toBeVisible();
    await expect(panel.getByRole("button", { name: /more actions/i })).toHaveCount(0);
    await expect(panel.getByTestId("panel-client-link")).toContainText("Rohan");
    await expect(panel.getByRole("button", { name: /^resolve…$/i })).toBeVisible();
    expect((await windowLocked(page)).windowScrolls).toBe(false);
    // The first card row is item 1 of n in the modal (one order everywhere).
    const firstRow = (await page.locator(".ov-att .ov-att-tx b").first().textContent())?.trim() ?? "";
    await expect(panel.locator(".sp-title")).toContainText(firstRow);
    await page.keyboard.press("ArrowRight");
    await expect(panel.getByText(/^2 of \d+$/)).toBeVisible();
    expect((await windowLocked(page)).windowScrolls).toBe(false);
  });

  test("captures every screen at three widths", async ({ page }) => {
    test.setTimeout(480_000);
    const rohan = await clientNamed("Rohan");
    const kavya = await clientNamed("Kavya");
    const kavyaResolved = (
      await api<{ items: Array<{ id: string }> }>(
        `/exceptions/relationships/${kavya.relationshipId}?status=resolved`,
      )
    ).items[0]!.id;

    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });

      console.log("STEP RP-01 open", size.w);
      let panel = await openFromHome(page, "Rohan");
      await stepToOpenItem(panel);
      await shot(page, "W-02-review-open", size);

      console.log("STEP RP-02 noted");
      await panel.getByRole("button", { name: /^noted, keep open$/i }).click();
      const state = panel.getByTestId("panel-noted-state");
      await expect(state).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(400);
      await shot(page, "W-02-review-noted", size);

      console.log("STEP RP-03 resolve confirm");
      await panel.getByRole("button", { name: /^resolve…$/i }).click();
      await expect(panel.getByTestId("panel-lock-line")).toBeVisible();
      await panel.getByRole("button", { name: /^talked to /i }).click();
      await shot(page, "W-02-resolve-confirm", size);

      console.log("STEP RP-04 resolved with Undo");
      await panel.getByRole("button", { name: /^resolve item$/i }).click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeVisible();
      await page.waitForTimeout(300);
      await shot(page, "W-02-review-resolved", size);
      await page.getByTestId("exception-resolve-banner").getByRole("button", { name: "Undo" }).click();
      await expect(page.getByTestId("exception-resolve-banner")).toBeHidden({ timeout: 15_000 });
      // Put the item back as it was (open, not noted).
      await state.getByRole("button", { name: "Undo" }).click();
      await expect(panel.getByRole("button", { name: /^noted, keep open$/i })).toBeVisible({
        timeout: 15_000,
      });

      console.log("STEP add note");
      await panel.getByRole("button", { name: "Add note" }).click();
      await expect(panel.getByTestId("panel-note-composer")).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, "W-02-review-add-note", size);
      await page.keyboard.press("Escape");
      await expect(panel.getByTestId("panel-note-composer")).toHaveCount(0);

      console.log("STEP RP-05 all done");
      // Reversible: walk Rohan's items with the pager and note each one; the
      // last one shows the summary. Every note is undone through the API after.
      const open = await openItems(rohan.relationshipId);
      panel = await openFromHome(page, "Rohan");
      for (let k = 0; k < open.length; k += 1) {
        await panel.getByRole("button", { name: /^noted, keep open$/i }).click();
        if (k === open.length - 1) break;
        await expect(panel.getByTestId("panel-noted-state")).toBeVisible({ timeout: 15_000 });
        await panel.getByRole("button", { name: "Next item" }).click();
        await expect(panel.getByText(`${k + 2} of ${open.length}`)).toBeVisible();
      }
      await expect(panel.getByTestId("panel-all-done")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(400);
      await shot(page, "W-02-review-all-done", size);
      for (const item of open) {
        await api(`/exceptions/${item.id}/undo`, {
          method: "POST",
          headers: { "Idempotency-Key": randomUUID() },
          body: JSON.stringify({}),
        });
      }

      console.log("STEP W-02f resolve several");
      panel = await openFromHome(page, "Farhan");
      await panel.getByRole("button", { name: /resolve several/i }).click();
      await expect(page.getByTestId("bulk-select-list")).toBeVisible();
      await expect(page.locator(".sp-bulk-title").first()).toContainText(/ · .* · /, {
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
      await shot(page, "W-02f-resolve-several", size);
      const titles = await page.locator(".sp-bulk-title").allTextContents();
      expect.soft(new Set(titles).size, "resolve several rows are distinguishable").toBe(titles.length);

      console.log("STEP W-02i ended client");
      await page.goto(`/?exception=${kavyaResolved}`);
      await expect(page.getByTestId("panel-readonly-foot")).toBeVisible({ timeout: 20_000 });
      await panelLoaded(page);
      await shot(page, "W-02i-review-ended", size);

      console.log("STEP W-03x modal");
      await page.goto(`/clients/${rohan.relationshipId}`);
      await expect(page.locator(".ov-card").first()).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[class*=skel]")).toHaveCount(0, { timeout: 20_000 });
      await expect(page.locator(".ov-att")).toHaveCount(
        (await openItems(rohan.relationshipId)).length,
        { timeout: 20_000 },
      );
      await page.locator(".ov-att").getByRole("button", { name: "Review" }).first().click();
      panel = await panelLoaded(page);
      await shot(page, "W-03x-review-modal", size);
      await stepToOpenItem(panel);
      await panel.getByRole("button", { name: /^resolve…$/i }).click();
      await expect(panel.getByTestId("panel-lock-line")).toBeVisible();
      await shot(page, "W-03x-modal-resolve-confirm", size);
      await panel.getByRole("button", { name: "Cancel" }).click();
      await page.keyboard.press("Escape");
    }
  });
});
