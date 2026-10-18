/**
 * TW-C behavioural proofs for workspace header, overview, intake, configure, notes.
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const SNEHA = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const VIKRAM = "2fe7a6d8-4c61-443d-9614-18b4210186ee";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page).toHaveURL("/", { timeout: 45_000 });
}

test.describe("TW-C workspace", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({ browser }) => {
    // Warm login once so later tests aren't rate-limited.
    const page = await browser.newPage();
    await signIn(page);
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test("TW-09a header: chips, WhatsApp client number, one CTA, tabs", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/overview`);
    await expect(page.getByTestId("screen-TW-09a")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Rohan Mehta/i })).toBeVisible();
    await expect(page.getByText("Needs attention").first()).toBeVisible();
    const wa = page.getByRole("link", { name: /Message on WhatsApp/i });
    await expect(wa).toBeVisible();
    const href = await wa.getAttribute("href");
    expect(href).toMatch(/^https:\/\/wa\.me\/919000000007/);
    await expect(page.getByRole("button", { name: /Review issue/i })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: /Client sections/i });
    await expect(tabs.getByRole("link", { name: /Overview/i })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /Plan/i })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /Activity/i })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /Progress/i })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /Check-ins/i })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /History/i })).toBeVisible();
    await expect(tabs.getByText(/^3$/)).toBeVisible();
    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(
      page.getByRole("menuitem", { name: /Configure coaching/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Onboarding answers/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /Reminder settings for this client/i }),
    ).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Add note/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /End coaching/i })).toBeVisible();
  });

  test("TW-09a Deepak timezone badge; Kavya ended; unknown 404", async ({
    page,
  }) => {
    await page.goto(`/clients/${DEEPAK}/overview`);
    await expect(page.getByText(/time/i).first()).toBeVisible({ timeout: 15_000 });

    await page.goto(`/clients/${KAVYA}/overview`);
    await expect(page.getByText(/Coaching ended/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Reactivate coaching/i }),
    ).toBeVisible();

    await page.goto(`/clients/${UNKNOWN}/overview`);
    await expect(page.getByRole("heading", { name: /Client not found/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Back to clients/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Message on WhatsApp/i }),
    ).toHaveCount(0);
  });

  test("TW-09 overview: no ISO effective-since, counts not %, attention first", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/overview`);
    await expect(page.getByTestId("screen-TW-09")).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(body).not.toMatch(/\d+%/);
    expect(body).not.toMatch(/Library snapshot/i);
    await expect(page.getByRole("heading", { name: /Needs attention/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /This week/i })).toBeVisible();
    await expect(page.getByText(/of .*workouts|Workouts done/i).first()).toBeVisible();
    await expect(page.getByText(/Effective since/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /View all activity/i })).toBeVisible();
  });

  test("TW-10 Sneha intake header + sticky CTA; Vikram empty WhatsApp", async ({
    page,
  }) => {
    await page.goto(`/clients/${SNEHA}/onboarding`);
    await expect(page.getByTestId("screen-TW-10")).toBeVisible();
    await expect(page.getByText(/Intake/i).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Mark ready & configure/i }),
    ).toBeVisible();

    await page.goto(`/clients/${VIKRAM}/onboarding`);
    await expect(page.getByTestId("screen-TW-10")).toBeVisible();
    await expect(page.getByText(/hasn't submitted/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Remind on WhatsApp|WhatsApp/i }).first(),
    ).toBeVisible();
  });

  test("TW-11 configure: accordion + payment labels + Coming soon", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/configure`);
    await expect(page.getByTestId("screen-TW-11")).toBeVisible();
    const reminders = page.locator("details").filter({
      hasText: /Automatic reminders/i,
    });
    await expect(reminders).toBeVisible();
    await reminders.locator("summary").click();
    await expect(page.getByText(/Coming soon/i).first()).toBeVisible();
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/\bper_100_g\b/);
    // Payment frequency select should show labeled options when opened
    const freq = page.locator('select[name="paymentFrequency"]');
    if (await freq.count()) {
      const options = await freq.locator("option").allTextContents();
      expect(options.some((o) => /Monthly/i.test(o))).toBeTruthy();
      expect(options.every((o) => !/_/.test(o))).toBeTruthy();
    }
  });

  test("TW-34 note composer: private default, counter after 800", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/overview`);
    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /add note/i }).click();
    await expect(page.getByTestId("screen-TW-34")).toBeVisible();
    const visibility = page.getByRole("checkbox", {
      name: /Visible to client/i,
    });
    await expect(visibility).not.toBeChecked();
    const area = page.locator("textarea").first();
    await area.fill("x".repeat(820));
    await expect(page.getByText(/820\s*\/\s*1000/)).toBeVisible();
    await visibility.check();
    await expect(
      page.getByText(/will see this on their Today screen/i),
    ).toBeVisible();
    await expect(page.getByText(/From rahul · just now/i)).toBeVisible();
    await visibility.uncheck();
    await area.fill("Private note from TW-C e2e");
    await page.getByRole("button", { name: /^Save note$/i }).click();
    await expect(page.getByText(/Saved privately/i)).toBeVisible({
      timeout: 15_000,
    });

    await page.goto(`/clients/${KAVYA}/overview`);
    await expect(page.getByText(/Coaching ended/i)).toBeVisible();
    await page.getByRole("button", { name: /more actions/i }).click();
    await expect(page.getByRole("menuitem", { name: /add note/i })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: /^Add note$/i })).toHaveCount(
      0,
    );
    await expect(page.getByTestId("screen-TW-34")).toHaveCount(0);
  });

  test("Activity has no plan UUID; History has no Refresh button", async ({
    page,
  }) => {
    await page.goto(`/clients/${ROHAN}/activity`);
    await page.waitForTimeout(800);
    const activityText = await page.locator("body").innerText();
    expect(activityText).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );

    await page.goto(`/clients/${ROHAN}/history`);
    await page.waitForTimeout(500);
    await expect(
      page.getByRole("button", { name: /^\s*refresh\s*$/i }),
    ).toHaveCount(0);
  });
});
