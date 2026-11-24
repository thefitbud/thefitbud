// Z14-16 capture (Expo web, trainer app: 393x852 light and dark, 412x915 light).
//
//   node docs/qa/Z14-16/capture.mjs <expoWebUrl>
//
// Needs the local API (demo seed, with one client meal edited and one removed
// through the trainee API) and the Expo web bundle
// (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<local API>) running.
// Saves the Notifications settings and the Activity feed (capture-diet.mjs does the diet day and meal sheet; the trainer web captures were taken with Playwright at 1440x900).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8086";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(browser, scheme, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, {
    timeout: 180000,
  });
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
  return { page, ctx };
}

const shot = (page, name) => page.screenshot({ path: path.join(here, name) });

const runs = [
  ["light", { width: 393, height: 852 }, "393x852-light"],
  ["dark", { width: 393, height: 852 }, "393x852-dark"],
  ["light", { width: 412, height: 915 }, "412x915-light"],
];

for (const [scheme, viewport, label] of runs) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  // Notifications settings, with the Client log edits row.
  {
    const { page, ctx } = await open(browser, scheme, viewport);
    try {
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-07", { skipAuth: true }));
      await page.getByText("Notifications").first().click();
      await page.getByText("Client log edits").waitFor({ timeout: 60000 });
      await sleep(800);
      await shot(page, `app-settings-${label}.png`);
    } catch (err) {
      console.log(`skipped settings ${label}: ${String(err).slice(0, 160)}`);
    }
    await ctx.close();
  }

  // Activity: the Edited and Removed rows.
  {
    const { page, ctx } = await open(browser, scheme, viewport);
    try {
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
      await page.getByText("Edited", { exact: true }).first().waitFor({ timeout: 60000 });
      await sleep(800);
      await shot(page, `app-activity-${label}.png`);
      await sleep(600);
    } catch (err) {
      console.log(`skipped activity ${label}: ${String(err).slice(0, 160)}`);
    }
    await ctx.close();
  }
  await browser.close();
}
console.log("done");
