/**
 * TW-B behavioural flows: auth, roster, add client, welcome, invite lifecycle.
 * Requires API :8787 and trainer-web :5173 with seeded demo data.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { hashPassword } from "../../api/src/auth/password.ts";

const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const NOVA = "nova.coach@demo.fitbud.test";
const ANITA_INVITE = "06b54e81-016c-4220-a9a8-31195324669b";
const ANITA_EMAIL = "anita.invite@demo.fitbud.test";
const KAVYA_EMAIL = "kavya.ended@demo.fitbud.test";
const API_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../api",
);

/** Demo password is on the reset deny-list; restore the seed hash via D1. */
async function restoreDemoPassword(email: string) {
  const hash = await hashPassword(PASSWORD);
  const sql = `UPDATE user_identities SET password_hash = '${hash.replace(/'/g, "''")}', failed_login_count = 0, locked_until = NULL WHERE email_norm = '${email.toLowerCase()}';`;
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "fitbud",
      "--local",
      "--persist-to",
      ".wrangler/state",
      "--command",
      sql,
    ],
    { cwd: API_ROOT, stdio: "pipe" },
  );
}

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

async function apiLogin(
  request: APIRequestContext,
  email = EMAIL,
  password = PASSWORD,
) {
  const login = await request.post(`${API}/auth/login`, {
    headers: { "CF-Connecting-IP": `198.51.100.${(Date.now() % 50) + 10}` },
    data: { identifier: email, password },
  });
  expect(login.ok()).toBeTruthy();
  const body = (await login.json()) as { data: { token: string } };
  const session = await request.post(`${API}/auth/session`, {
    headers: {
      Authorization: `Bearer ${body.data.token}`,
      "Content-Type": "application/json",
    },
    data: { idToken: body.data.token, timezone: "Asia/Kolkata" },
  });
  expect(session.ok()).toBeTruthy();
  return body.data.token;
}

test.describe("TW-B auth flows", () => {
  test.describe.configure({ mode: "serial" });

  test("wrong password shows generic error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await page.locator('input[name="password"]').fill("wrong-password-xxx");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.getByRole("alert")).toContainText(
      "That mobile number or email and password don't match.",
    );
  });

  test("OTP send + verify signs in; Coming soon is wa_otp-off behaviour", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/sign-in/code");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await expect(page.getByTestId("wa-otp-coming-soon")).toBeVisible();
    await expect(page.getByText(/codes on whatsapp are coming soon/i)).toBeVisible();
    await page.getByRole("button", { name: /send code/i }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible();
    const code = await fetchDevCode(EMAIL);
    expect(code).toBeTruthy();
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
    // Authenticated trainee on any route must keep the gate (not full sign-in).
    await page.goto("/clients");
    await expect(page.getByTestId("trainee-only-gate")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/needs attention/i)).toHaveCount(0);
    await expect(page.getByTestId("trainee-only-gate")).toContainText(
      "This account is set up as a client",
    );
  });

  test("rate limit returns lockout copy after many failures", async ({
    page,
    request,
  }) => {
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
    await page.unroute("**/auth/login");
  });

  test("next= redirect returns to original path after sign-in", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/clients?q=rohan");
    await page.waitForURL(/\/sign-in\?next=/);
    await expect(page).toHaveURL(/next=%2Fclients/);
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/clients/, { timeout: 45_000 });
    await expect(page).toHaveURL(/q=rohan/);
  });

  test("API down while signed in shows ErrorState not sign-in", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.route("**/me", (route) => route.abort("failed"));
    await page.route("**/api/me", (route) => route.abort("failed"));
    await page.reload();
    await expect(page.getByText(/can't reach fitbud/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page).not.toHaveURL(/\/sign-in/);
    await page.unroute("**/me");
    await page.unroute("**/api/me");
  });

  test("forgot-password code → new password → signed in", async ({ page }) => {
    test.setTimeout(120_000);

    async function enterOtp(otp: string) {
      const boxes = page.locator(".otp-box");
      await expect(boxes.first()).toBeVisible({ timeout: 15_000 });
      // Always write the mail-sink code (DEV autofill can race with a prior message).
      for (let i = 0; i < 6; i += 1) {
        await boxes.nth(i).fill(otp[i]!);
      }
      await expect(
        page.getByRole("button", { name: /^verify code$/i }),
      ).toBeEnabled({ timeout: 10_000 });
    }

    await page.goto("/forgot-password?next=/clients");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
    await page.getByRole("button", { name: /send code/i }).click();
    await expect(page.getByText(/if an account exists/i)).toBeVisible({
      timeout: 15_000,
    });
    const code = await fetchDevCode(EMAIL);
    expect(code).toBeTruthy();
    await enterOtp(code!);
    await page.getByRole("button", { name: /^verify code$/i }).click();
    await expect(page.getByText(/choose a new password/i)).toBeVisible({
      timeout: 20_000,
    });
    const newPass = `FitBud-reset-${Date.now().toString().slice(-4)}aA1!`;
    await page.locator('input[autocomplete="new-password"]').fill(newPass);
    await page.getByRole("button", { name: /save password and sign in/i }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/clients"), {
      timeout: 45_000,
    });
    // Seed demo password is on the reset deny-list — restore via D1 for later tests.
    await restoreDemoPassword(EMAIL);
  });

  test("sign-in mockup chrome: icons, no DEV hints by default", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByText("For trainers")).toBeVisible();
    await expect(page.getByText("Breakfast not logged (Sat)")).toBeVisible();
    await expect(page.getByText(/Check-in submitted/)).toBeVisible();
    await expect(page.getByTestId("dev-test-identity")).toHaveCount(0);
    const emailVal = await page
      .getByRole("textbox", { name: /mobile number or email/i })
      .inputValue();
    expect(emailVal).toBe("");
  });
});

test.describe("TW-B first-run welcome", () => {
  test("fresh trainer completes welcome steps 1–3 and finish", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto("/sign-in");
    await page.getByRole("textbox", { name: /mobile number or email/i }).fill(NOVA);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/welcome/, { timeout: 45_000 });
    await page.getByTestId("screen-TW-02").waitFor({ state: "visible" });
    await page.getByLabel(/display name/i).fill("Nova Coach");
    await page.getByPlaceholder(/98765/i).fill("9876500999");
    await page.getByLabel(/timezone/i).fill("Asia/Kolkata");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByText(/your starting templates/i)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByText(/invite your first client/i)).toBeVisible();
    await expect(page.getByTestId("welcome-invite-form")).toBeVisible();
    // Invalid WhatsApp on step 1 already saved; prove field error path on re-edit via draft is optional —
    // Skip for now and assert finish copy.
    await page.getByRole("button", { name: /skip for now/i }).click();
    await expect(page.getByTestId("welcome-done")).toContainText(
      "You're set. FitBud will show you who needs attention here.",
    );
    await page.getByRole("link", { name: /go to home/i }).click();
    await page.waitForURL(/\/$/, { timeout: 30_000 });
  });

  test("invalid WhatsApp shows inline field error on welcome", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.goto("/welcome?capture=welcome");
    await page.getByPlaceholder(/98765/i).fill("12");
    await page.getByRole("button", { name: /^continue$/i }).click();
    await expect(page.getByRole("alert")).toContainText(/valid|10-digit/i);
  });
});

test.describe("TW-B roster + invite", () => {
  test("roster search, Ended segment, FilterBar unclipped at 1280/1440", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });

    async function assertFilterBarUnclipped() {
      const bar = page.getByTestId("filter-bar");
      await expect(bar).toBeVisible();
      const ok = await bar.evaluate((el) => {
        const style = getComputedStyle(el);
        if (style.overflowX === "hidden") return false;
        const pills = Array.from(el.querySelectorAll(".filter-pill"));
        const barBox = el.getBoundingClientRect();
        return pills.every((pill) => {
          const box = pill.getBoundingClientRect();
          return box.right <= barBox.right + 1 && box.left >= barBox.left - 1;
        });
      });
      expect(ok, "FilterBar pills must not be clipped").toBe(true);
    }

    for (const width of [1440, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/clients");
      await page.getByTestId("screen-TW-06").waitFor({ state: "visible" });
      await assertFilterBarUnclipped();
    }

    await expect(page.getByText(/\d+ active/i)).toBeVisible();
    await expect(page.getByText(/Kavya/i)).toHaveCount(0);
    await page.getByPlaceholder(/search clients/i).fill("rohan");
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/q=rohan/);
    await expect(page.getByText(/Rohan/i).first()).toBeVisible();
    await page.getByPlaceholder(/search clients/i).fill("");
    await page.waitForTimeout(400);

    // Renewal filter uses Home Renewals derivation (Rohan = expired).
    await page.goto("/clients?renewal=expired");
    await page.getByRole("button", { name: /^More/i }).click();
    await expect(page.getByText(/Rohan/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Expired/i).first()).toBeVisible();

    // History: Invited → Expired then Back restores status=invited.
    await page.goto("/clients");
    await page.getByRole("button", { name: /^Invited/i }).click();
    await expect(page).toHaveURL(/status=invited/);
    await page.getByRole("button", { name: /^More/i }).click();
    await page.getByRole("button", { name: /^Expired$/i }).click();
    await expect(page).toHaveURL(/renewal=expired/);
    await page.goBack();
    await expect(page).toHaveURL(/status=invited/);

    await page.getByRole("tab", { name: /^Ended$/i }).click();
    await expect(page.getByText(/Kavya|Nikhil/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("add client share card: WhatsApp, copy, QR", async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.goto("/clients/add");
    const stamp = Date.now();
    await page.getByLabel(/client name/i).fill(`Share Client ${stamp}`);
    await page.getByLabel(/^email$/i).fill(`share.client.${stamp}@demo.fitbud.test`);
    await page.getByPlaceholder(/98765/i).fill("9876543211");
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByTestId("invite-share-card")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: /send on whatsapp/i })).toHaveAttribute(
      "href",
      /wa\.me/,
    );
    await page.getByRole("button", { name: /copy invite link/i }).click();
    await expect(page.getByRole("button", { name: /^copied$/i })).toBeVisible({
      timeout: 5_000,
    });
    await page.getByRole("button", { name: /^qr code$/i }).click();
    await expect(page.getByRole("img", { name: /invite qr/i })).toBeVisible();
  });

  test("duplicate pending invite and ended reactivate states", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.goto("/clients/add");
    await page.getByLabel(/client name/i).fill("Anita Desai");
    await page.getByLabel(/^email$/i).fill(ANITA_EMAIL);
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByTestId("add-client-error")).toContainText(
      /already has a pending invite/i,
    );
    await expect(page.getByTestId("duplicate-invite-link")).toBeVisible();

    await page.getByLabel(/client name/i).fill("Kavya Menon");
    await page.getByLabel(/^email$/i).fill(KAVYA_EMAIL);
    await page.getByRole("button", { name: /create invite/i }).click();
    await expect(page.getByTestId("add-client-error")).toContainText(
      /reactivate/i,
    );
    await expect(page.getByTestId("reactivate-client-link")).toBeVisible();
  });
});

test.describe("TW-B invite lifecycle (serial)", () => {
  test.describe.configure({ mode: "serial" });

  test("pending invite reissue confirm + revoke", async ({ page, request }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.goto(`/invitations/${ANITA_INVITE}`);
    await page.getByTestId("screen-TW-08").waitFor({ state: "visible" });
    await page.getByRole("button", { name: /copy new link/i }).click();
    await expect(
      page.getByText(/old link will stop working/i),
    ).toBeVisible();
    await page.getByRole("button", { name: /create new link/i }).click();
    await page.waitForURL(
      (url) =>
        /\/invitations\/[0-9a-f-]{36}/i.test(url.pathname) &&
        !url.pathname.includes(ANITA_INVITE),
      { timeout: 30_000 },
    );
    const newUrl = page.url();
    expect(newUrl).not.toContain(ANITA_INVITE);

    // Old demo token belongs to the revoked row — preview may 4xx or return revoked.
    const preview = await request.get(
      `${API}/invitations/preview?token=fitbud-demo-anita-invite-pending`,
    );
    if (preview.ok()) {
      const body = (await preview.json()) as {
        data?: { status?: string };
        status?: string;
      };
      const status = body.data?.status ?? body.status;
      expect(status).toMatch(/revoked|expired|invalid/i);
    } else {
      expect([400, 404, 410, 409, 422]).toContain(preview.status());
    }

    await page.getByRole("button", { name: /more actions/i }).click();
    await page.getByRole("menuitem", { name: /revoke invite/i }).click();
    await expect(page.getByText(/revoke this invite/i)).toBeVisible();
    await page.getByRole("button", { name: /^revoke invite$/i }).click();
    await expect(page.getByText(/revoked on/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("accepted invite redirects to workspace", async ({ page, request }) => {
    test.setTimeout(120_000);
    await apiLogin(request);
    const stamp = Date.now();
    const email = `accept.${stamp}@demo.fitbud.test`;
    const created = await request.post(`${API}/invitations`, {
      data: {
        recipientEmail: email,
        recipientDisplayName: `Accept ${stamp}`,
        sendEmail: false,
      },
      headers: { "Idempotency-Key": `e2e-accept-${stamp}` },
    });
    expect(created.ok()).toBeTruthy();
    const invite = (await created.json()) as {
      data: { id: string; token: string; inviteUrl: string };
    };
    const start = await request.post(`${API}/auth/otp/start`, {
      data: { identifier: email, purpose: "invite" },
    });
    expect(start.ok() || start.status() === 202).toBeTruthy();
    const code = await fetchDevCode(email);
    expect(code).toBeTruthy();
    const verify = await request.post(`${API}/auth/otp/verify`, {
      data: { identifier: email, purpose: "invite", code },
    });
    expect(verify.ok()).toBeTruthy();
    const verified = (await verify.json()) as { data: { otpProof: string } };
    // Demo seed password is on the reset/accept deny-list.
    const acceptPassword = `FitBud-Accept-${stamp.toString().slice(-4)}aA1!`;
    const accept = await request.post(`${API}/invitations/accept`, {
      data: {
        token: invite.data.token,
        password: acceptPassword,
        otpProof: verified.data.otpProof,
        displayName: `Accept ${stamp}`,
      },
    });
    expect(accept.ok(), await accept.text()).toBeTruthy();
    const accepted = (await accept.json()) as {
      data: { relationshipId: string };
    };

    await signIn(page);
    await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
      timeout: 45_000,
    });
    await page.goto(`/invitations/${invite.data.id}`);
    await page.waitForURL(
      new RegExp(`/clients/${accepted.data.relationshipId}`),
      { timeout: 30_000 },
    );
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
