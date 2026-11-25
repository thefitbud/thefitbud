/**
 * W13-3: workout and diet builders as a full-height three-pane workspace
 * (frames W-152, W-152 iPad, W-154). Captures every target frame at
 * 1440x900, 1180x820 and 1024x1366, runs the check-web.mjs checks, and proves
 * the scroll model: the window and .main never scroll, each pane scrolls on
 * its own, and no blank band is left under a pane.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve("qa-captures/w13-3");

type Template = {
  id: string;
  title: string;
  ownership: string;
  recordVersion: number;
  content: {
    workoutDays: Array<{ exercises: unknown[] } & Record<string, unknown>>;
    mealPrescriptions: unknown[];
  };
};

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

/** A trainer-owned (editable) template of the given type, preferring the demo one. */
async function ownTemplate(type: "workout" | "nutrition", prefer: string): Promise<Template> {
  const page = await api<{ items: Template[] }>(
    "GET",
    `/templates?limit=50&templateType=${type}`,
  );
  const own = page.items.filter((item) => item.ownership === "trainer");
  const pick = own.find((item) => item.title === prefer) ?? own[0];
  expect(pick, `a trainer-owned ${type} template`).toBeTruthy();
  return api<Template>("GET", `/templates/${pick!.id}`);
}

/** New trainer-owned template cut down to a short plan (2 exercises or 1 meal). */
async function shortCopy(source: Template, type: "workout" | "nutrition"): Promise<string> {
  const content =
    type === "workout"
      ? {
          workoutDays: [
            {
              ...source.content.workoutDays[0]!,
              exercises: source.content.workoutDays[0]!.exercises.slice(0, 2),
            },
          ],
          mealPrescriptions: [],
        }
      : { workoutDays: [], mealPrescriptions: source.content.mealPrescriptions.slice(0, 1) };
  const created = await api<Template>("POST", "/templates", {
    title: `${source.title} (short)`,
    templateType: type,
    content,
  });
  return created.id;
}

async function windowLocked(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main.main");
    const doc = document.documentElement;
    const mainStyle = main ? getComputedStyle(main) : null;
    return {
      windowScrolls: doc.scrollHeight > doc.clientHeight + 1,
      mainScrolls: main ? main.scrollHeight > main.clientHeight + 1 : true,
      mainOverflow: mainStyle?.overflowY ?? "missing",
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

/** Panes reach the bottom of the window and every pane's content is reachable. */
async function paneModel(page: Page) {
  return page.evaluate(() => {
    const panes = [...document.querySelectorAll<HTMLElement>(".builder-pane")];
    return panes.map((pane) => {
      const box = pane.getBoundingClientRect();
      const overflows = pane.scrollHeight > pane.clientHeight + 1;
      pane.scrollTop = pane.scrollHeight;
      const reached = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;
      pane.scrollTop = 0;
      return {
        id: pane.dataset.testid ?? "pane",
        bottomGap: Math.round(window.innerHeight - box.bottom),
        overflowY: getComputedStyle(pane).overflowY,
        overflows,
        reached,
      };
    });
  });
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
  return panes;
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

async function openTemplate(page: Page, hub: "workouts" | "diets", id: string) {
  await page.goto(`/templates/${hub}/${id}`);
  const screen = hub === "workouts" ? "screen-TW-13" : "screen-TW-14";
  await expect(page.getByTestId(screen)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("builder-layout")).toBeVisible();
  if (hub === "workouts") {
    await expect(page.getByTestId("session-board")).toBeVisible();
  } else {
    await expect(page.getByTestId("meals-board")).toBeVisible();
  }
}

async function libraryLoaded(page: Page) {
  await expect(page.locator(".builder-library-card").first()).toBeVisible({ timeout: 20_000 });
}

/** Open the client's plan tab and discard a leftover draft, as tw-d-flows does. */
async function discardDraftIfAny(page: Page, relationshipId: string) {
  await page.goto(`/clients/${relationshipId}/plan`);
  await page.getByTestId("screen-TW-12").waitFor();
  await expect(
    page.locator(".current-plan-actions").getByRole("button", { name: /^Adjust plan$/ }),
  ).toBeVisible({ timeout: 20_000 });
  // The draft banner loads after the plan; give it a moment before deciding.
  await page.waitForLoadState("networkidle");
  const banner = page.getByTestId("draft-banner");
  await banner.waitFor({ timeout: 5_000 }).catch(() => undefined);
  const discard = page.getByRole("button", { name: /^discard$/i });
  if (await discard.isVisible()) {
    await discard.click();
    await page.getByRole("button", { name: /^discard draft$/i }).click();
    await expect(banner).toBeHidden();
  }
}

test.describe("W13-3 builder workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("captures W-152 and W-154 at 1440, 1180 and 1024 with the pane scroll model", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const workout = await ownTemplate("workout", "Demo strength block");
    const diet = await ownTemplate("nutrition", "Demo Indian meals");
    const sizes: Array<[number, number]> = [
      [1440, 900],
      [1180, 820],
      [1024, 1366],
    ];
    for (const [frame, hub, id] of [
      ["W-152", "workouts", workout.id],
      ["W-154", "diets", diet.id],
    ] as const) {
      for (const [width, height] of sizes) {
        await page.setViewportSize({ width, height });
        await openTemplate(page, hub, id);
        const wide = width >= 1280;
        if (wide) {
          await libraryLoaded(page);
          await expect(page.getByTestId("library-drawer")).toBeVisible();
          await expect(page.getByRole("button", { name: "Library", exact: true })).toHaveCount(0);
        } else {
          await expect(page.getByTestId("builder-pane-library")).toHaveCount(0);
          await expect(page.getByRole("button", { name: "Library", exact: true })).toBeVisible();
        }
        const label = `${frame}-${width}x${height}`;
        await expectWorkspace(page, label, wide ? 3 : 2);
        if (wide) {
          const widths = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>(".builder-pane")].map((pane) =>
              Math.round(pane.getBoundingClientRect().width),
            ),
          );
          expect(widths[0], `${label} library`).toBe(300);
          expect(widths[2], `${label} properties`).toBe(340);
        }
        await shot(page, `${label}.png`);
      }
    }
  });

  test("short plans leave no blank band and no pane scrollbars", async ({ page }) => {
    test.setTimeout(120_000);
    const workout = await ownTemplate("workout", "Demo strength block");
    const diet = await ownTemplate("nutrition", "Demo Indian meals");
    const shortWorkout = await shortCopy(workout, "workout");
    const shortDiet = await shortCopy(diet, "nutrition");
    await page.setViewportSize({ width: 1440, height: 900 });

    await openTemplate(page, "workouts", shortWorkout);
    await libraryLoaded(page);
    await expect(page.locator(".exercise-card-row")).toHaveCount(2);
    let panes = await expectWorkspace(page, "short workout", 3);
    expect(panes.find((pane) => pane.id === "builder-pane-canvas")?.overflows).toBe(false);
    expect(panes.find((pane) => pane.id === "builder-pane-properties")?.overflows).toBe(false);
    await shot(page, "W-152-short-plan-1440x900.png");

    await openTemplate(page, "diets", shortDiet);
    await libraryLoaded(page);
    await expect(page.locator(".meal-card-row")).toHaveCount(1);
    panes = await expectWorkspace(page, "short diet", 3);
    expect(panes.find((pane) => pane.id === "builder-pane-canvas")?.overflows).toBe(false);
    await shot(page, "W-154-short-plan-1440x900.png");
  });

  test("at 1180 the Library button opens the drawer and adds an exercise", async ({ page }) => {
    test.setTimeout(120_000);
    const workout = await ownTemplate("workout", "Demo strength block");
    const copyId = await shortCopy(workout, "workout");
    await page.setViewportSize({ width: 1180, height: 820 });
    await openTemplate(page, "workouts", copyId);
    await expect(page.getByTestId("library-drawer")).toHaveCount(0);

    const library = page.getByRole("button", { name: "Library", exact: true });
    const box = await library.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await library.click();
    const drawer = page.getByTestId("library-drawer");
    await expect(drawer).toBeVisible();
    await expect(page.getByRole("searchbox", { name: "Search exercises" })).toBeFocused();
    await libraryLoaded(page);
    await expectWorkspace(page, "drawer open", 2);
    await shot(page, "W-152-library-drawer-1180x820.png");

    // Targets in the header row and the cards are at least 44 px at iPad widths.
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".builder-topbar button, .builder-topbar a, .exercise-card, .overflow-menu-trigger, .builder-day-tab, .ui-stepper button",
        ),
      ]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName),
    );
    expect(small).toEqual([]);

    await drawer.locator(".builder-library-card").first().click();
    await expect(page.locator(".exercise-card-row")).toHaveCount(3);
    await expect(page.getByTestId("autosave-status")).toContainText(/saved/i, {
      timeout: 15_000,
    });

    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toHaveCount(0);

    // Remove through the card menu: still the same behaviour.
    await page.getByRole("button", { name: /^Actions for / }).last().click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.locator(".exercise-card-row")).toHaveCount(2);
  });

  test("client plan builder: both tabs fill the workspace", async ({ page }) => {
    test.setTimeout(120_000);
    const token = await apiToken();
    const clients = unwrap<{
      items: Array<{ relationshipId: string | null; traineeDisplayName: string }>;
    }>(
      await fetch(`${API}/clients?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    );
    const rohan = clients.items.find((item) => /rohan/i.test(item.traineeDisplayName));
    expect(rohan?.relationshipId).toBeTruthy();
    await page.setViewportSize({ width: 1440, height: 900 });
    await discardDraftIfAny(page, rohan!.relationshipId!);
    await page
      .locator(".current-plan-actions")
      .getByRole("button", { name: /^Adjust plan$/ })
      .click();
    await expect(page.getByTestId("screen-TW-13")).toBeVisible({ timeout: 30_000 });
    await libraryLoaded(page);
    await expectWorkspace(page, "client workout", 3);
    await shot(page, "client-plan-workout-1440x900.png");

    await page.getByRole("tab", { name: "Nutrition" }).click();
    await expect(page.getByTestId("screen-TW-14")).toBeVisible();
    await expect(page.getByTestId("day-total-bar")).toBeVisible();
    await libraryLoaded(page);
    await expectWorkspace(page, "client nutrition", 3);
    await shot(page, "client-plan-nutrition-1440x900.png");

    // Leave no draft behind for later specs.
    await discardDraftIfAny(page, rohan!.relationshipId!);
  });
});
