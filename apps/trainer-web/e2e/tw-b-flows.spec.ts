/**
 * TW-B behavioural flows: auth, roster, add client.
 * Requires API :8787 and trainer-web :5173 with seeded demo data.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ANITA_INVITE = "06b54e81-016c-4220-a9a8-31195324669b";

async function signIn(
  page: Page,
  email = EMAIL,
  password = PASSWORD,
) {
  await page.goto("/sign-in");
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
}

async function fetchDevCode(to: string): Promise<string | null> {
  const res = await fetch(`${API}/dev/mail?to=${encodeURIComponent(to)}`);
  if (!res.ok) return null;
  const raw = (await res.json()) as {
    data?: { items?: Array<{ subject?: string; textBody?: string }> };
    items?: Array<{ subject?: string; textBody?: string }>;
  };
  const items = raw.data?.items ?? raw.items ?? [];
  const newest = items[0];
  const haystack = `${newest?.subject ?? ""} ${newest?.textBody ?? ""}`;
  return /(\d{6})/.exec(haystack)?.[1] ?? null;
}

test.describe("TW-B auth flows", () => {
  test("wrong password shows generic error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await page.locator('input[name="password"]').fill("wrong-password-xxx");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByRole("alert")).toContainText(
      "That mobile number or email and password don't match.",
    );
  });

  test("OTP send + verify signs in", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/sign-in/code");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await expect(page.getByTestId("wa-otp-coming-soon")).toBeVisible();
    await page.getByRole("button", { name: /send code/i }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
    const code = await fetchDevCode(EMAIL);
    expect(code).toBeTruthy();
    // Fill OTP boxes
    const boxes = page.locator(".otp-box");
    for (let i = 0; i < 6; i += 1) {
      await boxes.nth(i).fill(code![i]!);
    }
    await page.getByRole("button", { name: /verify and sign in/i }).click();
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
  });

  test("trainee-only account is role-gated", async ({ page }) => {
    await signIn(page, "sneha.review@demo.fitbud.test", PASSWORD);
    await expect(page.getByTestId("trainee-only-gate")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId("trainee-only-gate")).toContainText(
      "This account is set up as a client",
    );
  });

  test("rate limit returns lockout copy after many failures", async ({
    page,
    request,
  }) => {
    // Prove API IP bucket (30/15m) on a dedicated CF-Connecting-IP, then map
    // 429 → UI copy without locking the browser's shared local IP.
    const identifier = `ratelimit.${Date.now()}@demo.fitbud.test`;
    const probeIp = `203.0.113.${(Date.now() % 200) + 20}`;
    let saw429 = false;
    for (let i = 0; i < 40; i += 1) {
      const res = await request.post(`${API}/auth/login`, {
        headers: { "CF-Connecting-IP": probeIp },
        data: { identifier, password: "bad-password-xxx" },
      });
      if (res.status() === 429) {
        saw429 = true;
        break;
      }
    }
    expect(saw429).toBeTruthy();
    await page.goto("/sign-in");
    await page.route("**/auth/login", async (route) => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "RATE_LIMITED",
            message: "Too many attempts.",
            requestId: "e2e-rate-limit",
          },
        }),
      });
    });
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(identifier);
    await page.locator('input[name="password"]').fill("bad-password-xxx");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Too many tries. Wait 15 minutes or sign in with a code.",
    );
  });
});

test.describe("TW-B roster + invite", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
  });

  test("roster search, filter, sort segment, ended", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/clients");
    await page.getByTestId("screen-TW-06").waitFor({ state: "visible" });
    await expect(page.getByRole("heading", { name: /clients/i })).toBeVisible();

    // Ended clients absent from Current
    await expect(page.getByText(/Kavya/i)).toHaveCount(0);
    await expect(page.getByText(/Nikhil/i)).toHaveCount(0);

    await page.getByPlaceholder(/search clients/i).fill("rohan");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/q=rohan/);
    await expect(page.getByText(/Rohan/i).first()).toBeVisible();

    // Clear search before Ended — q=rohan would hide Kavya/Nikhil.
    await page.getByPlaceholder(/search clients/i).fill("");
    await page.waitForTimeout(400);
    await page.getByRole("tab", { name: /^Ended$/i }).click();
    await expect(page).toHaveURL(/status=ended|segment=ended/);
    await expect(page.getByText(/Kavya|Nikhil/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole("tab", { name: /^Current$/i }).click();
  });

  test("add client end-to-end creates share card", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/clients/add");
    await page.getByTestId("screen-TW-07").waitFor({ state: "visible" });
    const stamp = Date.now();
    await page.getByLabel(/client name/i).fill(`Test Client ${stamp}`);
    await page.getByLabel(/^email$/i).fill(`test.client.${stamp}@demo.fitbud.test`);
    await page.getByPlaceholder(/98765/i).fill("9876543210");
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByTestId("invite-share-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/invite ready for/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /send on whatsapp/i })).toBeVisible();
  });

  test("pending invitation detail shows form and actions", async ({ page }) => {
    await page.goto(`/invitations/${ANITA_INVITE}`);
    await page.getByTestId("screen-TW-08").waitFor({ state: "visible" });
    await expect(page.getByText(/Anita/i).first()).toBeVisible();
    await expect(page.getByText(/Invited/i).first()).toBeVisible();
    const remind = page.getByRole("link", { name: /remind on whatsapp/i });
    await expect(remind).toBeVisible();
    await expect(remind).toHaveAttribute("href", /wa\.me\/919876501111/);
    await expect(
      page.getByRole("button", { name: /copy new link/i }),
    ).toBeVisible();
  });
});

test.describe("TW-B axe", () => {
  test("axe on TW-B screens", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/sign-in");
    for (const route of ["/sign-in", "/sign-in/code", "/forgot-password"]) {
      await page.goto(route);
      await page.waitForTimeout(400);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(serious, `${route}: ${serious.map((v) => v.id).join(", ")}`).toEqual(
        [],
      );
    }

    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    for (const route of [
      "/welcome?capture=welcome",
      "/clients",
      "/clients/add",
      `/invitations/${ANITA_INVITE}`,
    ]) {
      await page.goto(route);
      await page.waitForTimeout(600);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );
      expect(
        serious,
        `${route}: ${serious.map((v) => v.id).join(", ")}`,
      ).toEqual([]);
    }
  });
});
