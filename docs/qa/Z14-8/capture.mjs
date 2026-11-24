/**
 * Z14-8 Expo-web screenshot check (D-W14-5): 393x852 at 2x, light and dark
 * (`colorScheme`), against the local demo-seeded API behind Metro's
 * /__fitbud_api proxy. Expo web proves copy, structure, states and values,
 * not native layout (safe areas, native sheets) and not the lock screen
 * (TR-15d is the device run's).
 *
 * Account: rohan.slipping@demo.fitbud.test (Asia/Kolkata; the seed leaves him
 * a missed workout this week, opened from the banner's "Log it").
 *
 *   W-03   The log mid-session: one set logged, the rest skipped.
 *   W-16   "Finish early?" from the log's Finish.
 *   TR-19a Sync status after a late set was settled: the server's sync/push
 *          answer for that set is the Z14-7 shape (`already_applied` with the
 *          WORKOUT_ALREADY_FINISHED note), served by Playwright because a
 *          lock-screen row needs a device; the note is what the trainee sees
 *          instead of "Couldn't send".
 *
 * Usage (repo root): EXPO_WEB_URL=http://127.0.0.1:8081 node docs/qa/Z14-8/capture.mjs [shot ...]
 */
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.EXPO_WEB_URL ?? "http://127.0.0.1:8081";
const EMAIL = process.env.CAPTURE_EMAIL ?? "rohan.slipping@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const VIEWPORT = { width: 393, height: 852 };
const only = new Set(process.argv.slice(2));

async function waitText(scope, text, timeout = 45_000) {
  await scope.getByText(text, { exact: false }).first().waitFor({ timeout });
}

async function signIn(page) {
  await page.goto(BASE, { timeout: 240_000 });
  await waitText(page, "Sign in with a code instead", 240_000);
  await page.getByLabel("Mobile number or email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByTestId("tab-today").waitFor({ timeout: 90_000 });
}

/** Opens the missed (or already open) workout's log and ends on it. */
async function openLog(page) {
  await page.getByTestId("tab-workout").click();
  const pane = page.getByTestId("trainee-pane-workout");
  const minimise = page.getByRole("button", { name: "Minimise workout" });
  const logIt = pane.getByRole("button", { name: /Log it/ }).first();
  const resume = page.getByRole("button", { name: "Resume workout" }).last();
  const cont = pane.getByRole("button", { name: /Continue workout/ }).first();
  const start = pane.getByRole("button", { name: "Start workout" }).first();
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await minimise.isVisible().catch(() => false)) break;
    if (await resume.isVisible().catch(() => false)) await resume.click();
    else if (await logIt.isVisible().catch(() => false)) await logIt.click();
    else if (await cont.isVisible().catch(() => false)) await cont.click();
    else if (attempt > 5 && (await start.isVisible().catch(() => false))) await start.click();
    await page.waitForTimeout(1_000);
  }
  await minimise.waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
}

/** Logs the next set as planned and skips the rest it starts. */
async function logOneSet(page) {
  await page.getByRole("button", { name: /^Log set [0-9]+/ }).first().click();
  const skip = page.getByRole("button", { name: "Skip rest" });
  await skip.waitFor({ timeout: 15_000 });
  await skip.click();
  await page.waitForTimeout(1_200);
}

const SHOTS = {
  async "W-03"(page) {
    await signIn(page);
    await openLog(page);
    await logOneSet(page);
  },
  async "W-16"(page) {
    await signIn(page);
    await openLog(page);
    await page.getByRole("button", { name: "Finish workout" }).click();
    await waitText(page, "Finish early?");
    await page.waitForTimeout(1_200);
  },
  async "TR-19a"(page) {
    // The server's answer to a set that arrived after the workout ended
    // (Z14-7: apps/api/src/domain/sync.ts finishedWorkoutSyncResult).
    await page.route("**/__fitbud_api/sync/push**", async (route) => {
      const body = route.request().postDataJSON();
      if (process.env.CAPTURE_DEBUG) console.log("push", JSON.stringify(body).slice(0, 300));
      const results = body.mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: "already_applied",
        recordId: mutation.recordId,
        serverVersion: 7,
        entityType: mutation.entityType,
        error: null,
        ...(mutation.operation === "workout.complete_set"
          ? {
              note: {
                code: "WORKOUT_ALREADY_FINISHED",
                message: "This set arrived after you finished the workout, so it wasn't added.",
              },
            }
          : {}),
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        // The API's one envelope (apps/api/src/lib/envelope.ts).
        body: JSON.stringify({ data: { results } }),
      });
    });
    await signIn(page);
    await openLog(page);
    await logOneSet(page);
    await page.waitForTimeout(2_000);
    await page.getByRole("button", { name: "Minimise workout" }).click();
    await page.getByTestId("tab-today").click();
    await page.getByRole("button", { name: /^Sync status/ }).first().click();
    await waitText(page, "ended, so it wasn't added.");
    // Let a seeded in-app notice (a foreground banner) leave the header.
    await page.waitForTimeout(7_000);
  },
};

async function main() {
  await mkdir(HERE, { recursive: true });
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  );
  try {
    for (const scheme of ["light", "dark"]) {
      for (const [name, shot] of Object.entries(SHOTS)) {
        if (only.size > 0 && !only.has(name)) continue;
        const context = await browser.newContext({
          viewport: VIEWPORT,
          deviceScaleFactor: 2,
          colorScheme: scheme,
          timezoneId: "Asia/Kolkata",
        });
        const page = await context.newPage();
        try {
          await shot(page, context);
          const file = join(HERE, `${name}-${scheme}-web.png`);
          await page.screenshot({ path: file });
          console.log(`saved ${file}`);
        } catch (error) {
          const file = join(HERE, `${name}-${scheme}-FAILED.png`);
          await page.screenshot({ path: file }).catch(() => undefined);
          console.error(`${name} ${scheme} failed: ${error instanceof Error ? error.message : error}`);
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

await main();
