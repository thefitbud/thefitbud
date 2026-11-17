/**
 * TW-D behavioural proofs: plan tab, builders, publish modal.
 */
import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./support/session";

const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";

const BANNED = [/Library snapshot [0-9a-f]{8}-/i, /\[object Object\]/, /\bundefined\b/, /\bNaN\b/];

async function expectNoBannedStrings(page: Page) {
  const text = await page.locator("body").innerText();
  for (const pattern of BANNED) {
    expect(text, `banned ${pattern}`).not.toMatch(pattern);
  }
}

async function discardDraftIfAny(page: Page) {
  await page.goto(`/clients/${ROHAN}/plan`);
  await page.getByTestId("screen-TW-12").waitFor();
  const discard = page.getByRole("button", { name: /^discard$/i });
  if (await discard.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await discard.click();
    await page.getByRole("button", { name: /^discard draft$/i }).click();
    await expect(page.getByTestId("draft-banner")).toBeHidden();
  }
}

test.describe("TW-D plan and builders", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await discardDraftIfAny(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await signIn(page);
    await discardDraftIfAny(page);
    await page.close();
  });

  test("TW-12 plan tab: current plan, week strip, collapsed versions", async ({ page }) => {
    await page.goto(`/clients/${ROHAN}/plan`);
    await expect(page.getByTestId("screen-TW-12")).toBeVisible();
    await expect(page.getByTestId("plan-effective-line")).toContainText(/Effective since .* · v\d+ ·/);
    const strip = page.getByTestId("week-strip");
    await expect(strip.getByRole("listitem")).toHaveCount(7);
    await expect(strip).toContainText("Mon");
    await expect(strip).toContainText("Sun");
    await expect(strip).toContainText(/Rest|Upper|Lower|Push|Pull|Legs|Full/i);
    await expect(strip).toContainText(/\d meals?/);
    // The current-plan card's own actions. The demo seed's configuration (3
    // sessions) differs from Rohan's plan (4), so the plan/configuration
    // banner adds a second "Adjust plan" above it.
    const planActions = page.locator(".current-plan-actions");
    await expect(planActions.getByRole("button", { name: /^Adjust plan$/ })).toBeVisible();
    await expect(planActions.getByRole("button", { name: /Replace from template/ })).toBeVisible();
    await page.getByRole("button", { name: /more plan actions/i }).click();
    await expect(page.getByRole("menuitem", { name: /Duplicate as template/ })).toBeVisible();
    await page.keyboard.press("Escape");
    // Z8-8 (frame 150): versions are open by default; the toggle collapses them.
    await expect(page.locator(".versions-table")).toBeVisible();
    await expectNoBannedStrings(page);
    await page.getByRole("button", { name: /Versions/ }).click();
    await expect(page.locator(".versions-table")).toBeHidden();
  });

  test("Deepak plan tab renders in the client's timezone", async ({ page }) => {
    await page.goto(`/clients/${DEEPAK}/plan`);
    await expect(page.getByTestId("screen-TW-12")).toBeVisible();
    await expect(page.getByText(/Loading plan/)).toBeHidden({ timeout: 15_000 });
    await expectNoBannedStrings(page);
  });

  test("Adjust plan opens the builder; Publish… opens the schedule modal", async ({ page }) => {
    await discardDraftIfAny(page);
    await page
      .locator(".current-plan-actions")
      .getByRole("button", { name: /^Adjust plan$/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/clients/${ROHAN}/plan/[^/]+/versions/[^/]+/edit`));
    await expect(page.getByTestId("screen-TW-13")).toBeVisible();
    await expect(page.getByTestId("autosave-status")).toContainText(/Draft v\d+/);
    await expect(page.getByTestId("library-drawer")).toBeVisible();
    // Z12-11: topbar is Preview + Publish & schedule (not “Preview as client” / “Publish…”).
    await expect(page.getByRole("button", { name: /^Preview$/ })).toBeVisible();

    await page.getByRole("tab", { name: "Nutrition" }).click();
    await expect(page.getByTestId("screen-TW-14")).toBeVisible();
    await expect(page.getByTestId("day-total-bar")).toBeVisible();
    await expectNoBannedStrings(page);

    // Z12-10: Nutrition tab + unchanged workouts → frame 156 diet-scope modal (TW-15).
    await page.getByRole("button", { name: /^Publish & schedule$/ }).click();
    const dietModal = page.getByTestId("screen-TW-15");
    await expect(dietModal).toBeVisible();
    await expect(page.getByRole("heading", { name: /Apply this change/ })).toBeVisible();
    await expect(dietModal).toContainText(/From today/);
    await expect(dietModal).toContainText("Today only");
    await expect(page.getByRole("button", { name: "Apply change" })).toBeVisible();
    await expectNoBannedStrings(page);
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(dietModal).toBeHidden();

    // Workout tab → full Publish & schedule modal (TW-16) with civil start options.
    await page.getByRole("tab", { name: "Workout" }).click();
    await expect(page.getByTestId("screen-TW-13")).toBeVisible();
    await page.getByRole("button", { name: /^Publish & schedule$/ }).click();
    const modal = page.getByTestId("screen-TW-16");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: /Publish & schedule/ })).toBeVisible();
    await expect(modal.getByRole("radio", { name: /^Start (Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/ })).toBeVisible();
    await expect(modal.getByRole("radio", { name: /Start today/ })).toBeVisible();
    await expect(modal.getByRole("radio", { name: /Pick a date/ })).toBeVisible();
    await expect(modal.getByTestId("assign-ends")).toContainText(/After 8 weeks/);
    await expect(modal.getByRole("button", { name: /^Publish$/ })).toBeVisible();
    const box = await modal.boundingBox();
    expect(box?.width).toBeLessThanOrEqual(641);
    expect(box?.width).toBeGreaterThan(500);
    await expect(modal.getByTestId("assign-replace")).toContainText(/this replaces/);
    await expect(modal.getByTestId("assign-replace")).toContainText(
      /Anything already logged stays as it is\./,
    );
    await expectNoBannedStrings(page);

    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toBeHidden();
  });

  test("draft banner continues editing; ?assign=1 opens the modal; discard clears it", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/plan`);
    const banner = page.getByTestId("draft-banner");
    await expect(banner).toContainText(/Draft v\d+ · edited/);
    await expect(banner.getByRole("link", { name: "Continue editing" })).toBeVisible();

    await page.goto(`/clients/${ROHAN}/plan?assign=1`);
    await expect(page.getByTestId("screen-TW-16")).toBeVisible({ timeout: 15_000 });
    await expectNoBannedStrings(page);

    await page.goto(`/clients/${ROHAN}/plan`);
    await page.getByRole("button", { name: /^discard$/i }).click();
    await page.getByRole("button", { name: /^discard draft$/i }).click();
    await expect(page.getByTestId("draft-banner")).toBeHidden();
  });

  test("publishing for a client in another timezone schedules the plan", async ({ page }) => {
    await page.goto(`/clients/${DEEPAK}/plan`);
    await page.getByTestId("screen-TW-12").waitFor();
    await page
      .locator(".current-plan-actions")
      .getByRole("button", { name: /^Adjust plan$/ })
      .click();
    await expect(page.getByTestId("screen-TW-13")).toBeVisible();
    await page.getByRole("button", { name: /^Publish & schedule$/ }).click();
    const modal = page.getByTestId("screen-TW-16");
    await expect(modal).toBeVisible({ timeout: 15_000 });
    // Z12-10 assign modal: civil start options; schedule uses trainee timezone on the server.
    await expect(
      modal.getByRole("radio", { name: /^Start (Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/ }),
    ).toBeVisible();
    await expect(modal.getByRole("button", { name: /^Publish$/ })).toBeEnabled({
      timeout: 15_000,
    });
    await modal.getByRole("button", { name: /^Publish$/ }).click();
    await expect(page).toHaveURL(new RegExp(`/clients/${DEEPAK}/plan$`), { timeout: 20_000 });
    await expect(page.getByTestId("plan-effective-line")).toBeVisible();
    await expect(page.getByTestId("draft-banner")).toBeHidden();
  });

  test("builder is read-only below 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(`/clients/${ROHAN}/plan`);
    await page.getByTestId("screen-TW-12").waitFor();
    await page
      .locator(".current-plan-actions")
      .getByRole("button", { name: /^Adjust plan$/ })
      .click();
    await expect(page.getByTestId("builder-small-screen")).toContainText("Open on a larger screen");
    await expect(page.getByRole("button", { name: /^Publish & schedule$/ })).toBeDisabled();
  });
});
