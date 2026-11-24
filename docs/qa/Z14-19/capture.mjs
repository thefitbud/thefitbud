// Z14-19 capture (Expo web, 393x852, light and dark).
//
//   node docs/qa/Z14-19/capture.mjs <expoWebUrl>
//
// Needs the local API (port 8792, demo seed) and the Expo web bundle
// (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=http://localhost:8792)
// already running. For each of the six screens it saves the screen with the
// pressed state held on the client avatar (<screen>-pressed-<scheme>.png), and
// for the Activity feed also the client page the avatar opens, pushed on top
// (activity-opened-profile-<scheme>.png). Layout is unchanged apart from the
// pressed state, which dims the avatar.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8082";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const AVATAR = /^Open .*'s profile$/;

async function open(browser, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: scheme,
  });
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

/** Hold the press on the first avatar link, shoot, then release off the target. */
async function pressed(page, name) {
  const avatar = page.getByRole("button", { name: AVATAR }).first();
  await avatar.waitFor({ timeout: 60000 });
  const box = await avatar.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await sleep(250);
  await shot(page, name);
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await sleep(200);
}

async function fromActivity(page, rowText, name) {
  await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
  if (rowText === "workout") {
    // The Workouts filter, then the first event row (opens the Session detail).
    await page.getByRole("button", { name: "Workouts" }).click();
    await sleep(1200);
    const row = page.getByRole("button", { name: / · / }).first();
    await row.waitFor({ timeout: 60000 });
    await row.click();
  } else {
    await page.getByText(rowText).first().waitFor({ timeout: 60000 });
    await page.getByText(rowText).first().click();
  }
  await sleep(2500);
  await pressed(page, name);
}

const only = process.env.ONLY_SESSION_ASK === "1";
for (const scheme of ["light", "dark"]) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  // Activity feed rows, then the avatar opens the profile on top.
  if (!only) {
    const { page, ctx } = await open(browser, scheme);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
    await page.getByRole("button", { name: AVATAR }).first().waitFor({ timeout: 60000 });
    await sleep(800);
    await pressed(page, `activity-pressed-${scheme}.png`);
    await page.getByRole("button", { name: AVATAR }).first().click();
    await page.getByTestId("client-status").waitFor({ timeout: 60000 });
    await sleep(1200);
    await shot(page, `activity-opened-profile-${scheme}.png`);
    await ctx.close();
  }
  // Check-ins list.
  if (!only) {
    const { page, ctx } = await open(browser, scheme);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-05", { skipAuth: true }));
    await sleep(1500);
    await pressed(page, `checkins-list-pressed-${scheme}.png`);
    await ctx.close();
  }
  // Check-in review header.
  if (!only) {
    const { page, ctx } = await open(browser, scheme);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-06", { skipAuth: true }));
    await page.getByTestId("pushed-screen").waitFor({ timeout: 60000 });
    await sleep(1500);
    await pressed(page, `checkin-review-pressed-${scheme}.png`);
    await ctx.close();
  }
  // Exception header.
  if (!only) {
    const { page, ctx } = await open(browser, scheme);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-04", { skipAuth: true }));
    await page.getByTestId("pushed-screen").waitFor({ timeout: 60000 });
    await sleep(1500);
    await pressed(page, `exception-pressed-${scheme}.png`);
    await ctx.close();
  }
  // Session detail (a workout row in Activity) and Ask detail (an ask row).
  for (const [rowText, name] of [
    ["workout", `session-pressed-${scheme}.png`],
    [/Coach ask/i, `ask-pressed-${scheme}.png`],
  ]) {
    const { page, ctx } = await open(browser, scheme);
    try {
      await fromActivity(page, rowText, name);
    } catch (err) {
      console.log(`skipped ${name}: ${String(err).slice(0, 120)}`);
    }
    await ctx.close();
  }
  await browser.close();
}
console.log("done");
