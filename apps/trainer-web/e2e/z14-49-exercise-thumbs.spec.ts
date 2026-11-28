/**
 * Z14-49: exercise rows show the real drawing (Z14-48 media), an exercise with no drawing or a
 * failed image shows one neutral dumbbell tile, and foods have no thumbnail at all (D-W14-49,
 * D-W14-50, D-W14-52). Captures at 1440x900, 1180x820 and 1024x1366 with the W13 text checks.
 * Needs the drawings in the local bucket: `pnpm --filter @fitbud/api media:upload-exercises
 * -- --target local` after `pnpm db:reset`.
 */
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { API, apiToken, signIn } from "./support/session";

const OUT = path.resolve("qa-captures/z14-49");
const NO_DRAWING_NAME = "Farmer carry hold";

const SIZES: Array<[number, number]> = [
  [1440, 900],
  [1180, 820],
  [1024, 1366],
];

type Template = { id: string; title: string; ownership: string };

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
  if (res.status === 204) return undefined as T;
  return unwrap<T>(await res.json());
}

async function ownTemplate(type: "workout" | "nutrition", prefer: string): Promise<Template> {
  const page = await api<{ items: Template[] }>("GET", `/templates?limit=50&templateType=${type}`);
  const own = page.items.filter((item) => item.ownership === "trainer");
  const pick = own.find((item) => item.title === prefer) ?? own[0];
  expect(pick, `a trainer-owned ${type} template`).toBeTruthy();
  return pick!;
}

/** The W13 text checks. A lazy image below the fold has not started, so only visible ones count. */
async function textProblems(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    const clip: string[] = [];
    let broken = 0;
    document.querySelectorAll("img").forEach((img) => {
      const box = img.getBoundingClientRect();
      const visible = box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
      if (visible && (!img.complete || img.naturalWidth === 0)) broken += 1;
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
  // Images decode async; wait so the capture shows the drawings, not empty tiles.
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)),
    ),
  );
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  const problems = await textProblems(page);
  expect(problems.broken, `${name} broken images`).toBe(0);
  expect(problems.small, `${name} small text`).toEqual([]);
  expect(problems.clip, `${name} clipped text`).toEqual([]);
}

/** Every drawing under the selector has loaded; waits for the lazy ones. */
async function drawingsLoaded(page: Page, scope: string) {
  await page.waitForFunction(
    (sel) => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>(`${sel} img`)];
      return imgs.length > 0 && imgs.every((img) => img.complete && img.naturalWidth > 0);
    },
    scope,
    { timeout: 30_000 },
  );
}

test.describe("Z14-49 exercise thumbnails", () => {
  let noDrawingId = "";

  test.beforeAll(async () => {
    const created = await api<{ id: string }>("POST", "/libraries/exercises", {
      name: NO_DRAWING_NAME,
      primaryMuscles: ["forearms"],
      equipment: ["dumbbell"],
    });
    noDrawingId = created.id;
  });

  test.afterAll(async () => {
    if (noDrawingId) await api("DELETE", `/libraries/exercises/${noDrawingId}`);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("library exercise rows show a drawing; a no-drawing exercise shows the dumbbell", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates/libraries/exercises");
    const rows = page.locator(".libraries-table tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    const withDrawing = page.locator(".libraries-table [data-thumb=image]").first();
    await expect(withDrawing.locator("img")).toBeVisible({ timeout: 20_000 });
    await drawingsLoaded(page, ".libraries-table tbody tr:nth-child(-n+3)");
    const first = withDrawing.locator("img");
    expect(await first.getAttribute("alt")).toBe("");
    expect(await first.getAttribute("loading")).toBe("lazy");
    expect(await first.getAttribute("src")).toMatch(
      /\/api\/library\/exercise-media\/[0-9a-f-]{36}\?exp=\d+&sig=/,
    );
    expect(await withDrawing.getAttribute("aria-hidden")).toBe("true");

    // No drawing: the neutral fallback, no image, no text, no gradient.
    await page.getByPlaceholder("Search exercises").fill(NO_DRAWING_NAME);
    const row = page.locator(".libraries-table tbody tr", { hasText: NO_DRAWING_NAME });
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    const tile = row.getByTestId("library-thumb-exercise");
    await expect(tile).toHaveAttribute("data-thumb", "fallback");
    await expect(tile.locator("img")).toHaveCount(0);
    await expect(tile.locator("svg")).toHaveCount(1);
    expect(((await tile.textContent()) ?? "").trim()).toBe("");
    expect(await tile.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe("none");
  });

  test("an image that fails to load falls back to the dumbbell with no error text", async ({
    page,
  }) => {
    await page.route("**/library/exercise-media/**", (route) => route.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates/libraries/exercises");
    const tile = page
      .locator(".libraries-table tbody tr")
      .first()
      .getByTestId("library-thumb-exercise");
    await expect(tile).toHaveAttribute("data-thumb", "fallback", { timeout: 30_000 });
    await expect(tile.locator("img")).toHaveCount(0);
    await expect(page.locator("main.main")).not.toContainText(/exercise-media|sig=|failed to load/i);
    // No broken image is left anywhere in the DOM: every failed drawing became the dumbbell.
    await expect.poll(() => page.locator("[data-testid='library-thumb-exercise'] img").count(), { timeout: 15_000 }).toBe(0);
    expect((await textProblems(page)).broken).toBe(0);
  });

  test("drawings that 404 leave no broken image in the builder library list", async ({ page }) => {
    await page.route("**/library/exercise-media/**", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const workout = await ownTemplate("workout", "Demo strength block");
    await page.goto(`/templates/workouts/${workout.id}`);
    await expect(page.getByTestId("session-board")).toBeVisible({ timeout: 30_000 });
    const card = page.locator(".builder-library-card").first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByTestId("library-thumb-exercise")).toHaveAttribute(
      "data-thumb",
      "fallback",
      { timeout: 20_000 },
    );
    await expect.poll(() => page.locator("[data-testid='library-thumb-exercise'] img").count(), { timeout: 15_000 }).toBe(0);
    expect((await textProblems(page)).broken).toBe(0);
    await expect(page.locator("main.main")).not.toContainText(/404|exercise-media|sig=/i);
  });

  test("builder library list holds no unloaded image offscreen (lazy images mount near the viewport)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const workout = await ownTemplate("workout", "Demo strength block");
    await page.goto(`/templates/workouts/${workout.id}`);
    await expect(page.locator(".builder-library-card").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".builder-library-card").nth(30)).toBeAttached({ timeout: 20_000 });
    await drawingsLoaded(page, ".builder-library-card:nth-child(-n+4)");
    const state = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>("img")];
      return {
        total: imgs.length,
        unloaded: imgs.filter((img) => !img.complete || img.naturalWidth === 0).length,
        tiles: document.querySelectorAll(".builder-library-card [data-testid='library-thumb-exercise']").length,
      };
    });
    expect(state.tiles).toBeGreaterThan(state.total);
    expect(state.unloaded).toBe(0);
  });

  test("food rows have no thumbnail element anywhere", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates/libraries/foods");
    const firstRow = page.locator(".libraries-table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(
        ".libraries-table .lib-thumb, .libraries-table img, [data-testid^='library-thumb']",
      ),
    ).toHaveCount(0);
    expect((await firstRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    const lead = await firstRow
      .locator(".ui-cell-main")
      .evaluate((el) => (el.firstElementChild as HTMLElement | null)?.className ?? "");
    expect(lead).toContain("ui-t");

    const diet = await ownTemplate("nutrition", "Demo Indian meals");
    await page.goto(`/templates/diets/${diet.id}`);
    await expect(page.getByTestId("meals-board")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".meal-food-row").first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("meals-board").locator("[data-testid^='library-thumb'], .lib-thumb"),
    ).toHaveCount(0);
    await page.locator(".meal-food-row").first().click();
    await expect(page.locator(".builder-meal-item").first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator(".builder-meal-item [data-testid^='library-thumb'], .builder-meal-item .lib-thumb"),
    ).toHaveCount(0);
    await expect(
      page.locator(
        ".builder-library-card [data-testid^='library-thumb'], .builder-library-card .lib-thumb",
      ),
    ).toHaveCount(0);
  });

  test("builder rows and the properties pane show drawings", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const workout = await ownTemplate("workout", "Demo strength block");
    await page.goto(`/templates/workouts/${workout.id}`);
    await expect(page.getByTestId("session-board")).toBeVisible({ timeout: 30_000 });
    const libraryCards = page.getByTestId("library-drawer").locator(".builder-library-card");
    await expect(libraryCards.first()).toBeVisible({ timeout: 20_000 });
    await expect(libraryCards.locator("img").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".exercise-card-row img").first()).toBeVisible({ timeout: 20_000 });
    await page.locator(".exercise-card", { has: page.locator("img") }).first().click();
    await expect(page.getByTestId("exercise-properties").locator("img")).toBeVisible({
      timeout: 20_000,
    });
  });

  test("captures every target at three sizes", async ({ page }) => {
    test.setTimeout(300_000);
    const workout = await ownTemplate("workout", "Demo strength block");
    const diet = await ownTemplate("nutrition", "Demo Indian meals");
    for (const [width, height] of SIZES) {
      const size = `${width}x${height}`;
      await page.setViewportSize({ width, height });

      await page.goto("/templates/libraries/exercises");
      await expect(page.locator(".libraries-table tbody tr").first()).toBeVisible({
        timeout: 30_000,
      });
      await drawingsLoaded(page, ".libraries-table tbody tr:nth-child(-n+4)");
      await shot(page, `library-exercises-${size}.png`);

      await page.getByPlaceholder("Search exercises").fill(NO_DRAWING_NAME);
      await expect(
        page.locator(".libraries-table tbody tr", { hasText: NO_DRAWING_NAME }),
      ).toHaveCount(1, { timeout: 20_000 });
      await shot(page, `library-exercise-no-drawing-${size}.png`);

      await page.goto("/templates/libraries/foods");
      await expect(page.locator(".libraries-table tbody tr").first()).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, `library-foods-${size}.png`);

      await page.goto(`/templates/workouts/${workout.id}`);
      await expect(page.getByTestId("session-board")).toBeVisible({ timeout: 30_000 });
      if (width < 1280) {
        await page.getByRole("button", { name: "Library", exact: true }).click();
      }
      const cards = page.getByTestId("library-drawer").locator(".builder-library-card");
      await expect(cards.first()).toBeVisible({ timeout: 20_000 });
      await drawingsLoaded(
        page,
        "[data-testid=library-drawer] .builder-library-card:nth-child(-n+4)",
      );
      await drawingsLoaded(page, ".exercise-card-row");
      await shot(page, `workout-builder-library-${size}.png`);

      if (width < 1280) {
        await page.getByTestId("library-drawer").getByRole("button", { name: "Close" }).click();
      }
      await page.locator(".exercise-card", { has: page.locator("img") }).first().click();
      await expect(page.getByTestId("exercise-properties").locator("img")).toBeVisible({
        timeout: 20_000,
      });
      await drawingsLoaded(page, "[data-testid=exercise-properties]");
      await shot(page, `exercise-properties-${size}.png`);

      await page.goto(`/templates/diets/${diet.id}`);
      await expect(page.getByTestId("meals-board")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".meal-food-row").first()).toBeVisible({ timeout: 20_000 });
      await shot(page, `meal-builder-${size}.png`);
    }
  });
});
