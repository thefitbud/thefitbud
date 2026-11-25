/**
 * W13-4: check-in form builder and measure picker in the builder workspace
 * (frames W-171 and W-171b). Captures every target frame at 1440x900,
 * 1180x820 and 1024x1366, runs the check-web.mjs checks, and proves the
 * scroll model (window and .main never scroll, each pane scrolls itself).
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve(`qa-captures/${process.env.W13_CAPTURE_DIR ?? "w13-4"}`);
const GLOBAL_CHECKIN = "c1000001-0000-4000-8000-000000000001";

type Field = { id: string; key?: string } & Record<string, unknown>;
type Detail = { id: string; versions: Array<{ fields: Field[] }> };

function unwrap<T>(json: { data?: T } & T): T {
  return (json.data ?? json) as T;
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = await apiToken();
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(method === "POST" ? { "Idempotency-Key": randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(res.ok, `${method} ${url} ${res.status}`).toBeTruthy();
  return unwrap<T>(await res.json());
}

/**
 * A trainer-owned check-in form shaped like the frame: a few standard
 * questions (so the picker has rows left to add) and the trainer's own.
 */
async function ownForm(): Promise<string> {
  const base = await api<Detail>("GET", `/checkins/form-templates/${GLOBAL_CHECKIN}`);
  const standard = base.versions
    .at(-1)!
    .fields.filter((field) =>
      ["weight", "waist", "photo_front", "photo_side", "sleep_quality"].includes(field.key ?? ""),
    );
  const forked = await api<Detail>("POST", `/checkins/form-templates/${GLOBAL_CHECKIN}/fork`, {
    name: `Weekly check-in ${randomUUID().slice(0, 4)}`,
  });
  const own: Field[] = [
    {
      id: "training-feel",
      label: "How did training feel?",
      type: "scale_1_5",
      required: true,
      lowLabel: "Very hard",
      highLabel: "Easy",
    },
    { id: "hurting", label: "Anything hurting?", type: "short_text", required: false },
    {
      id: "else",
      label: "Anything else for Rahul?",
      type: "long_text",
      required: false,
    },
  ];
  await api("POST", `/checkins/form-templates/${forked.id}/versions`, {
    fields: [...standard, ...own],
  });
  return forked.id;
}

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainScrolls: main ? main.scrollHeight > main.clientHeight + 1 : true,
      mainOverflow: main ? getComputedStyle(main).overflowY : "missing",
    };
  });
}

// Copied from e2e/w13-2-shell.spec.ts (check-web.mjs checks).
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

async function paneModel(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".builder-pane")].map((pane) => {
      const box = pane.getBoundingClientRect();
      pane.scrollTop = pane.scrollHeight;
      const reached = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;
      pane.scrollTop = 0;
      return {
        id: pane.dataset.testid ?? "pane",
        bottomGap: Math.round(window.innerHeight - box.bottom),
        overflowY: getComputedStyle(pane).overflowY,
        reached,
      };
    }),
  );
}

async function expectWorkspace(page: Page, label: string, wantPanes: number) {
  const locked = await windowLocked(page);
  expect(locked.windowScrolls, `${label} window`).toBe(false);
  expect(locked.mainScrolls, `${label} .main`).toBe(false);
  expect(locked.mainOverflow, label).toBe("auto");
  const panes = await paneModel(page);
  expect(panes, label).toHaveLength(wantPanes);
  for (const pane of panes) {
    expect(pane.bottomGap, `${label} ${pane.id} reaches the bottom`).toBeLessThanOrEqual(1);
    expect(pane.overflowY, `${label} ${pane.id}`).toBe("auto");
    expect(pane.reached, `${label} ${pane.id} scrolls to its end`).toBe(true);
  }
}

/** Every button, switch and radio in the properties pane is at least 44 px (iPad widths). */
async function expectTargets44(page: Page, label: string) {
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        ".builder-pane button, .builder-pane select, .builder-pane input:not([type=radio]):not([type=checkbox]), .builder-topbar button, .builder-topbar a",
      ),
    ]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.height < 43.5;
      })
      .map((el) => `${Math.round(el.getBoundingClientRect().height)}:${(el.textContent || el.getAttribute("aria-label") || el.className).slice(0, 30)}`),
  );
  expect(small, `${label} targets under 44 px`).toEqual([]);
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

async function openForm(page: Page, id: string) {
  await page.goto(`/templates/checkins/${id}`);
  await expect(page.getByTestId("screen-TW-25")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-layout")).toBeVisible();
  await expect(page.getByTestId("checkin-question-card")).toBeVisible({ timeout: 30_000 });
}

const SIZES: Array<[number, number]> = [
  [1440, 900],
  [1180, 820],
  [1024, 1366],
];

test.describe("W13-4 check-in form builder", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("captures W-171 and W-171b at 1440, 1180 and 1024", async ({ page }) => {
    test.setTimeout(240_000);
    const id = await ownForm();
    for (const [width, height] of SIZES) {
      const wide = width >= 1280;
      const label = `${width}x${height}`;
      await page.setViewportSize({ width, height });
      await openForm(page, id);
      await page.getByRole("button", { name: /How did training feel/ }).click();
      await expect(page.getByLabel("Answer type")).toBeVisible();
      await expect(page.getByTestId("builder-pane-library")).toHaveCount(wide ? 1 : 0);
      await expectWorkspace(page, `W-171 ${label}`, wide ? 3 : 2);
      await expect(page.getByTestId("builder-version-pill")).toBeVisible();
      if (!wide) {
        await expectTargets44(page, `W-171 ${label}`);
        await expect(page.getByLabel("Trainee phone preview")).toHaveCount(0);
      } else {
        await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
      }
      await shot(page, `W-171-${label}.png`);

      if (!wide) {
        await page.getByRole("button", { name: "Preview", exact: true }).click();
        await expect(page.getByRole("dialog", { name: "Preview" })).toBeVisible();
        await expect(page.getByLabel("Trainee phone preview")).toBeVisible();
        await shot(page, `W-171-preview-${label}.png`);
        await page.getByRole("button", { name: "Close panel" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
      }

      await page.getByRole("button", { name: "Add standard measure" }).click();
      const dialog = page.getByRole("dialog", { name: "Add a standard measure" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("checkbox", { name: /Hip/ }).check();
      await dialog.getByRole("checkbox", { name: /Chest/ }).check();
      await expect(dialog.getByText("2 selected")).toBeVisible();
      await shot(page, `W-171b-${label}.png`);
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toHaveCount(0);
    }
  });

  test("add with the picker, add an own question, save; the window never scrolls", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const id = await ownForm();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openForm(page, id);

    await page.getByRole("button", { name: "Add standard measure" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a standard measure" });
    await dialog.getByRole("searchbox", { name: "Search measures" }).fill("hun");
    await expect(dialog.getByRole("checkbox", { name: /Waist/ })).toHaveCount(0);
    await dialog.getByRole("checkbox", { name: /Hunger/ }).check();
    await dialog.getByRole("button", { name: "Add 1 measure" }).click();
    await expect(page.getByTestId("standard-question-hunger")).toBeVisible();
    await expect(page.getByText(/^Question \d+ of \d+$/)).toBeVisible();

    await page.getByRole("button", { name: /Add your own question/ }).click();
    await page.getByRole("textbox", { name: "Question" }).fill("How was your mood?");
    await expect(page.getByRole("radiogroup", { name: "Answer type" })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Answer type" }).selectOption("scale_1_5");
    await expect(page.getByLabel("Label for 1")).toBeVisible();
    await expectWorkspace(page, "after edits", 3);

    await page.getByRole("button", { name: "Save version" }).click();
    await expect(page.getByText(/Saved as v\d+/)).toBeVisible({ timeout: 20_000 });
    await expectWorkspace(page, "after save", 3);
  });

  test("a FitBud base form is read-only with Fork to edit", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openForm(page, GLOBAL_CHECKIN);
    await expect(page.getByRole("button", { name: "Fork to edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add standard measure" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save version" })).toHaveCount(0);
    await expectWorkspace(page, "read-only", 3);
  });

  test("below 1024 the builder is read-only with no Save version", async ({ page }) => {
    const id = await ownForm();
    await page.setViewportSize({ width: 900, height: 1200 });
    await page.goto(`/templates/checkins/${id}`);
    await expect(page.getByTestId("builder-small-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open on a larger screen to edit.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save version" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Fork to edit" })).toHaveCount(0);
  });
});
