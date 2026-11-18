/**
 * Z12-29 Expo-web screenshot check (D-W12-34 (2)): 393x852 at 2x, light and
 * dark (`colorScheme`), against the local demo-seeded API behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure and values, not native
 * layout. Every shot is the real local API except delete-active-clients
 * (a route stub, see below).
 *
 * The delete shots really archive an account, one persona per theme so the
 * dark pass starts from an active account: siddharth.yearly (light),
 * divya.wedding (dark). Run on a fresh `pnpm db:reset`.
 *
 * Usage: EXPO_WEB_URL=http://127.0.0.1:8096 node docs/qa/Z12-29/capture.mjs [shot ...]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8096";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "web");
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 393, height: 852 };
const DELETE_PERSONA = {
  light: "siddharth.yearly@demo.fitbud.test",
  dark: "divya.wedding@demo.fitbud.test",
};
const only = new Set(process.argv.slice(2));

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

async function openPrivacy(page) {
  await page.getByText("More", { exact: true }).last().waitFor({ timeout: 60_000 });
  await page.getByText("More", { exact: true }).last().click();
  await page.getByRole("button", { name: "Account" }).click();
  await waitText(page, "SIGN-IN");
  await page.getByRole("button", { name: "Privacy" }).click();
  await waitText(page, "How FitBud handles your data.");
}

async function openDelete(page, email) {
  await signIn(page, email);
  await openPrivacy(page);
  await page.getByRole("button", { name: "Delete account" }).click();
  await waitText(page, "We'll archive your account for 6 months.");
}

async function deleteFor(page, email) {
  await openDelete(page, email);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByTestId("delete-account-continue").click();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByTestId("delete-account-submit").click();
}

const SHOTS = {
  "TR-20c": async (page) => {
    await signIn(page, "aarav.ontrack@demo.fitbud.test");
    await page.getByText("More", { exact: true }).last().waitFor({ timeout: 60_000 });
    await page.getByText("More", { exact: true }).last().click();
    await page.getByRole("button", { name: "Account" }).click();
    await waitText(page, "Standard Time");
  },
  privacy: async (page) => {
    await signIn(page, "aarav.ontrack@demo.fitbud.test");
    await openPrivacy(page);
  },
  "BP1-delete": async (page) => {
    await openDelete(page, "aarav.ontrack@demo.fitbud.test");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  },
  "delete-proof": async (page) => {
    await SHOTS["BP1-delete"](page);
    await page.getByTestId("delete-account-continue").click();
    await waitText(page, "Enter your password to delete your account.");
  },
  "delete-wrong-password": async (page) => {
    await SHOTS["delete-proof"](page);
    await page.getByLabel("Password", { exact: true }).fill("not-my-password-1");
    await page.getByTestId("delete-account-submit").click();
    await waitText(page, "That isn't your current password.");
  },
  // No seeded account is both a client and a coach with active clients
  // (karan.dual has none), so the 409 is a route stub here; the count copy
  // ("You have 2 active clients.") is covered by DeleteAccountScreen.test.tsx.
  "delete-active-clients": async (page) => {
    await page.route("**/__fitbud_api/account/deletion", (r) =>
      r.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "ACTIVE_CLIENTS",
            message: "End coaching with your clients first.",
            requestId: "req-z12-29",
          },
        }),
      }),
    );
    await SHOTS["delete-proof"](page);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByTestId("delete-account-submit").click();
    await waitText(page, "End coaching with your clients first.");
  },
  "delete-archived-notice": async (page, theme) => {
    await deleteFor(page, DELETE_PERSONA[theme]);
    await waitText(page, "Your account is archived. Sign in before", 30_000);
  },
  "BP1-reactivate": async (page, theme) => {
    await signIn(page, DELETE_PERSONA[theme]);
    await waitText(page, "Welcome back", 60_000);
  },
  reactivated: async (page, theme) => {
    await SHOTS["BP1-reactivate"](page, theme);
    await page.getByRole("button", { name: "Reactivate my account" }).click();
    // Coaching ended with the deletion and stays ended (D-W6-8).
    await waitText(page, "View past coaching", 60_000);
  },
  "TR-22b": async (page) => {
    await signIn(page, "nikhil.reactivate@demo.fitbud.test");
    await waitText(page, "wants to coach you again", 60_000);
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
      await run(page, theme);
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
