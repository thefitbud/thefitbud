/**
 * Z12-49 Expo-web screenshot check (D-W12-34 (2)): 393x852 at 2x, light and
 * dark (`colorScheme`), against the local demo-seeded API behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure and values, not native
 * layout. States the local API cannot produce are made with a Playwright
 * route stub, named in the README next to each file.
 *
 * Usage: EXPO_WEB_URL=http://127.0.0.1:8095 node docs/qa/Z12-49/capture.mjs [shot ...]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8095";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "web");
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 393, height: 852 };
const only = new Set(process.argv.slice(2));

const json = (status, body) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});
const apiError = (status, code, message) =>
  json(status, { error: { code, message, requestId: "req-z12-49" } });

async function waitText(page, text, timeout = 45_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function signIn(page, email) {
  await page.goto(BASE);
  await waitText(page, "Sign in with a code instead");
  await page.getByLabel("Mobile number or email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const SHOTS = {
  "TR-01a": async (page) => {
    await page.goto(BASE);
    await waitText(page, "Sign in with a code instead");
  },
  "TR-01e": async (page) => {
    await page.route("**/__fitbud_api/auth/login", (r) =>
      r.fulfill(apiError(401, "INVALID_CREDENTIALS", "Invalid credentials.")),
    );
    await page.goto(BASE);
    await waitText(page, "Sign in with a code instead");
    await page.getByLabel("Mobile number or email").fill("98201 45678");
    await page.getByLabel("Password", { exact: true }).fill("not-it-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await waitText(page, "That number and password don't match.");
  },
  "TR-01f": async (page) => {
    await page.route("**/__fitbud_api/auth/login", (r) =>
      r.fulfill(apiError(429, "RATE_LIMITED", "Too many attempts.")),
    );
    await page.goto(BASE);
    await waitText(page, "Sign in with a code instead");
    await page.getByLabel("Mobile number or email").fill("98201 45678");
    await page.getByLabel("Password", { exact: true }).fill("not-it-123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await waitText(page, "Too many tries.");
  },
  "TR-01b": async (page) => {
    await page.goto(BASE);
    await waitText(page, "Sign in with a code instead");
    await page.getByLabel("Mobile number or email").fill("aarav.ontrack@demo.fitbud.test");
    await page.getByRole("button", { name: "Sign in with a code instead" }).click();
    await waitText(page, "We'll email you a 6-digit code");
  },
  "TR-01c": async (page) => {
    await SHOTS["TR-01b"](page);
    await page.getByRole("button", { name: "Send code" }).click();
    await waitText(page, "Enter your code");
    await page.getByLabel("6-digit code").fill("4820");
  },
  "TR-01g": async (page) => {
    await page.route("**/__fitbud_api/auth/otp/verify", (r) =>
      r.fulfill(apiError(401, "OTP_EXPIRED", "Code expired.")),
    );
    await SHOTS["TR-01b"](page);
    await page.getByRole("button", { name: "Send code" }).click();
    await waitText(page, "Enter your code");
    await page.getByLabel("6-digit code").fill("482019");
    await waitText(page, "This code has expired");
  },
  "TR-01d": async (page) => {
    await page.route("**/__fitbud_api/auth/otp/verify", (r) =>
      r.fulfill(json(200, { data: { purpose: "reset", resetProof: "reset-proof-z12-49" } })),
    );
    await page.goto(BASE);
    await waitText(page, "Sign in with a code instead");
    await page.getByLabel("Mobile number or email").fill("aarav.ontrack@demo.fitbud.test");
    await page.getByRole("button", { name: "Forgot password" }).click();
    await page.getByRole("button", { name: "Send code" }).click();
    await waitText(page, "Enter your code");
    await page.getByLabel("6-digit code").fill("482019");
    await waitText(page, "Set a new password");
    await page.getByLabel("New password").fill("steady-lifts-77");
  },
  "TM-08b": async (page) => {
    await page.route("**/__fitbud_api/me", async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      body.data.permittedRoles = [];
      await r.fulfill({ response: res, json: body });
    });
    await signIn(page, "aarav.ontrack@demo.fitbud.test");
    await waitText(page, "This account can't use the app yet");
  },
  "TR-20a": async (page) => {
    await signIn(page, "aarav.ontrack@demo.fitbud.test");
    await page.getByText("More", { exact: true }).last().waitFor({ timeout: 60_000 });
    await page.getByText("More", { exact: true }).last().click();
    await waitText(page, "Coached by Rahul");
  },
  "TR-16a": async (page) => {
    await SHOTS["TR-20a"](page);
    await page.getByRole("button", { name: "Reminders" }).click();
    await waitText(page, "REMIND ME ABOUT");
    await waitText(page, "Times use");
  },
  "TR-16b": async (page) => {
    await page.route("**/reminder-status**", async (r) => {
      const res = await r.fetch();
      const body = await res.json();
      body.data.pushDeliverable = false;
      await r.fulfill({ response: res, json: body });
    });
    await SHOTS["TR-20a"](page);
    await page.getByRole("button", { name: "Reminders" }).click();
    await waitText(page, "Notifications are off for FitBud");
  },
  "TR-20c": async (page) => {
    await SHOTS["TR-20a"](page);
    await page.getByRole("button", { name: "Account" }).click();
    await waitText(page, "SIGN-IN");
    await waitText(page, "Standard Time");
  },
  "TR-20g": async (page) => {
    await SHOTS["TR-20c"](page);
    await page.getByRole("button", { name: "Password", exact: true }).click();
    await waitText(page, "Current password");
    await page.getByLabel("Current password").fill("FitBud-demo-2026");
    await page.getByLabel("New password", { exact: true }).fill("steady-lifts-77");
  },
  "TR-20e": async (page) => {
    await SHOTS["TR-20a"](page);
    await page.getByRole("button", { name: "Help" }).click();
    await waitText(page, "Email the FitBud team");
  },
  "TR-20b": async (page) => {
    await SHOTS["TR-20a"](page);
    await page.getByRole("button", { name: /^Profile/ }).click();
    await waitText(page, "Date of birth");
    await page.waitForTimeout(800);
  },
  "TR-04": async (page) => {
    await signIn(page, "sneha.review@demo.fitbud.test");
    await waitText(page, "is building your plan", 60_000);
    await page.waitForTimeout(800);
  },
  "TR-03": async (page) => {
    await signIn(page, "vikram.onboarding@demo.fitbud.test");
    await waitText(page, "Getting to know you", 60_000);
  },
  "TR-22a": async (page) => {
    await signIn(page, "kavya.ended@demo.fitbud.test");
    await waitText(page, "Your history is safe", 60_000);
  },
  "TR-22b": async (page) => {
    await signIn(page, "nikhil.reactivate@demo.fitbud.test");
    await waitText(page, "wants to coach you again", 60_000);
    await page.waitForTimeout(600);
  },
  "TM-08a": async (page) => {
    await signIn(page, "karan.dual@demo.fitbud.test");
    await waitText(page, "How do you want to use FitBud?", 60_000);
  },
  "TM-08d": async (page) => {
    await SHOTS["TM-08a"](page);
    await page.getByRole("radio", { name: /^Client/ }).click();
    await page.getByRole("button", { name: "Continue as client" }).click();
    await page.getByText("More", { exact: true }).last().waitFor({ timeout: 60_000 });
    await page.getByText("More", { exact: true }).last().click();
    await waitText(page, "Switch to coach view");
  },
  "TM-08c": async (page) => {
    await SHOTS["TM-08d"](page);
    await page.getByRole("button", { name: "Switch to coach view" }).click();
    await waitText(page, "Switch to coach view?");
    await page.waitForTimeout(600);
  },
};

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });
const results = [];
for (const theme of ["light", "dark"]) {
  for (const [id, run] of Object.entries(SHOTS)) {
    if (only.size && !only.has(id)) continue;
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: theme,
    });
    const page = await context.newPage();
    try {
      await run(page);
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, `${id}-${theme}-web.png`) });
      results.push(`${id} ${theme} ok`);
    } catch (err) {
      results.push(`${id} ${theme} FAILED: ${String(err).split("\n")[0]}`);
      await page.screenshot({ path: join(OUT, `failed-${id}-${theme}.png`) }).catch(() => {});
    }
    await context.close();
  }
}
await browser.close();
console.log(results.join("\n"));
