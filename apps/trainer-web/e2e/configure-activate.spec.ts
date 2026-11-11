/**
 * Z8-6: Coaching setup footer, end to end on the demo seed.
 * First activation (frame 148 + DS3 Activate) and Save as vN+1 (frame 149 +
 * DS3 Save as version) for Harpreet, the coaching-ready client with no setup
 * and no plan. Both run on the same relationship, so the spec is serial and
 * self-contained: nothing else in the suite depends on Harpreet's setup.
 */
import { test, expect, type Page } from "@playwright/test";
import { API, apiToken, signIn } from "./support/session";

const HARPREET = "519b5b84-c1bf-4bf3-ab4f-3cbb71e12f84";

type Configuration = {
  status: "draft" | "active" | "superseded";
  versionNumber: number;
  workout: { sessionsPerWeek: number };
  tracking: { requireProgressPhotos: boolean };
} | null;

/** The configuration as the API holds it (the source of truth, not the screen). */
async function storedConfiguration(): Promise<Configuration> {
  const res = await fetch(`${API}/configurations/relationships/${HARPREET}`, {
    headers: { Authorization: `Bearer ${await apiToken()}` },
  });
  expect(res.ok).toBeTruthy();
  const body = (await res.json()) as { data: Configuration };
  return body.data;
}

const DAY = /(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/;

async function openSetup(page: Page) {
  await page.goto(`/clients/${HARPREET}/configure`);
  await expect(page.getByTestId("screen-TW-11")).toBeVisible();
  await expect(page.getByTestId("configure-footer")).toBeVisible();
}

test.describe("Z8-6 Coaching setup: activate and save as a new version", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
  });

  test("first activation: Activate waits for the sections, confirms in DS3, one activate call", async ({
    page,
  }) => {
    const before = await storedConfiguration();
    test.skip(
      before?.status === "active",
      "Harpreet is already active on this database (rerun without a reset).",
    );
    await openSetup(page);
    const footer = page.getByTestId("configure-footer");
    await expect(page.getByTestId("configure-status-pill")).toHaveText("Draft");
    const activate = footer.getByRole("button", { name: "Activate", exact: true });
    // D17: with no short goal, Activate is disabled and the hint names Goal.
    await page.locator('input[name="goalShort"]').fill("");
    await expect(activate).toBeDisabled();
    await expect(page.getByTestId("configure-footer-hint")).toContainText(
      /sections? left: Goal/,
    );

    // Fill the one required field, save the draft: every section is done.
    await page
      .locator('input[name="goalShort"]')
      .fill("Strength base and 1.6 km under 6 min");
    await footer.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByTestId("configure-footer-hint")).toHaveText(
      "Every section is done. Activate to start coaching.",
    );
    await expect(activate).toBeEnabled();
    expect((await storedConfiguration())?.status).toBe("draft");

    // DS3: the confirmation lists what starts; nothing is sent before Confirm.
    const activateCalls: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/activate$/.test(request.url())) {
        activateCalls.push(request.url());
      }
    });
    await activate.click();
    const dialog = page.getByRole("dialog", { name: "Start coaching Harpreet?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("dt")).toHaveText([
      "Start date",
      "Workouts",
      "Meals",
      "Check-ins",
      "Tracking",
      "Reminders",
      "Steps target",
      "Plan",
    ]);
    await expect(dialog.locator("dd").first()).toHaveText(new RegExp(`^Today · ${DAY.source}$`));
    await expect(dialog).toContainText("Nothing scheduled until a plan is published");
    await expect(dialog).not.toContainText(/\d{4}-\d{2}-\d{2}/);
    expect(activateCalls).toHaveLength(0);

    // A refused activation keeps the draft and says why (the dialog stays).
    await page.route("**/configurations/relationships/*/activate", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "CONFIGURATION_VERSION_CONFLICT",
            message: "Configuration was changed after this version was loaded.",
            requestId: "e2e-refused",
          },
        }),
      }),
    );
    await dialog.getByRole("button", { name: "Activate coaching" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "This setup changed elsewhere. Reload the page and try again.",
    );
    await page.unroute("**/configurations/relationships/*/activate");
    expect((await storedConfiguration())?.status).toBe("draft");
    activateCalls.length = 0;

    await dialog.getByRole("button", { name: "Activate coaching" }).click();
    await expect(dialog).toHaveCount(0);
    expect(activateCalls).toHaveLength(1);
    await expect(
      page.getByText(
        "Coaching with Harpreet is active. Nothing is scheduled until you publish a plan.",
      ),
    ).toBeVisible();
    await expect(page.getByTestId("configure-status-pill")).toHaveText("Active · v1");

    const stored = await storedConfiguration();
    expect(stored?.status).toBe("active");
    expect(stored?.versionNumber).toBe(1);
  });

  test("Save as v2: the first edit opens v2, DS3 lists only the changes, v2 goes live from tomorrow", async ({
    page,
  }) => {
    const before = await storedConfiguration();
    expect(before?.status).toBe("active");
    const current = before!.versionNumber;
    const next = current + 1;
    const nextSessions = before!.workout.sessionsPerWeek === 5 ? 4 : 5;

    await openSetup(page);
    const footer = page.getByTestId("configure-footer");
    await expect(page.getByTestId("configure-status-pill")).toHaveText(`Active · v${current}`);
    await expect(page.getByTestId("configure-footer-hint")).toHaveText(
      `Edit a section to start v${next}.`,
    );
    const save = footer.getByRole("button", { name: `Save as v${next}` });
    await expect(save).toBeDisabled();

    // First edit: Expectations reads Editing, the footer names v(N+1).
    await page.locator("details").filter({ hasText: "Expectations" }).locator("summary").first().click();
    await page.locator('select[name="sessionsPerWeek"]').selectOption(String(nextSessions));
    await expect(
      page.locator("details").filter({ hasText: "Expectations" }).getByTestId("configure-section-badge").first(),
    ).toHaveText("Editing");
    await expect(page.getByTestId("configure-footer-hint")).toHaveText(
      new RegExp(`^Saving creates v${next} from tomorrow, ${DAY.source}\\. Today stays on v${current}\\.$`),
    );
    await expect(save).toBeEnabled();

    // Discard puts the active values back.
    await footer.getByRole("button", { name: "Discard" }).click();
    await expect(page.locator('select[name="sessionsPerWeek"]')).toHaveValue(
      String(before!.workout.sessionsPerWeek),
    );
    await expect(save).toBeDisabled();

    await page.locator('select[name="sessionsPerWeek"]').selectOption(String(nextSessions));
    await save.click();
    const dialog = page.getByRole("dialog", { name: `Save as version ${next}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Version ${current} is kept as it was.`);
    await expect(dialog).toContainText("What changes · 1");
    await expect(dialog.locator("li")).toHaveCount(1);
    await expect(dialog.locator("li").first()).toContainText("Workouts");
    await expect(dialog.locator("li s")).toContainText(
      `${before!.workout.sessionsPerWeek} a week`,
    );
    await expect(dialog.locator("li em")).toContainText(`${nextSessions} a week`);
    await expect(dialog).toContainText(new RegExp(`Tomorrow · ${DAY.source}`));
    await expect(dialog).toContainText("Today's plan stays as it is.");

    await dialog.getByRole("button", { name: `Save as version ${next}` }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(
        new RegExp(`^Version ${next} saved\\. New targets apply from tomorrow, ${DAY.source}\\.$`),
      ),
    ).toBeVisible();
    await expect(page.getByTestId("configure-status-pill")).toHaveText(`Active · v${next}`);

    // The API holds v(N+1) as the active version with the new target.
    const stored = await storedConfiguration();
    expect(stored?.status).toBe("active");
    expect(stored?.versionNumber).toBe(next);
    expect(stored?.workout.sessionsPerWeek).toBe(nextSessions);

    // After a reload the page reads the new active version.
    await openSetup(page);
    await expect(page.getByTestId("configure-status-note")).toHaveText(
      new RegExp(`^Active since ${DAY.source} · v${next}$`),
    );
    await expect(page.locator('select[name="sessionsPerWeek"]')).toHaveValue(
      String(nextSessions),
    );
  });
});
