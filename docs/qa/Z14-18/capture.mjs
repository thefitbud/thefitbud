// Z14-18 capture (Expo web, light and dark).
//
//   node docs/qa/Z14-18/capture.mjs <expoWebUrl>
//
// Boots nothing itself: the local API (port 8792, demo seed) and the Expo web
// bundle (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=http://localhost:8792)
// must already be running. Saves into docs/qa/Z14-18/:
//   bk01-*      pushed screens with the header back (client page, check-in review,
//               notification settings, Log workout from the client page), 393x852
//   bk02-*      iOS swipe-back frames: the pushed screen dragged 0 %, 35 % and 60 %
//               of the width, with the screen below visible
//   android-*   the same client page at 412x915
// Expo web has no native gesture handler, so the swipe frames set the pushed
// layer's transform directly: they show what is underneath and the layering,
// not the pan itself (that is the device run, F30-trainer-back.yaml).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8082";
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

async function clientPage(page) {
  await page.evaluate(() => window.__fitbudCapture.navigate("TM-03", { skipAuth: true }));
  await page.getByTestId("client-status").waitFor({ timeout: 60000 });
  await page.getByText(/Quiet hours/).first().waitFor({ timeout: 60000 });
  await sleep(600);
}

async function dragTop(page, fraction, width) {
  await page.evaluate(
    ([fraction, width]) => {
      const layers = [...document.querySelectorAll('[data-testid="pushed-screen"]')];
      const top = layers[layers.length - 1];
      if (top) top.style.transform = `translateX(${Math.round(fraction * width)}px)`;
    },
    [fraction, width],
  );
  await sleep(150);
}

for (const scheme of ["light", "dark"]) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const phone = { width: 393, height: 852 };
  {
    const { page, ctx } = await open(browser, scheme, phone);
    await clientPage(page);
    await shot(page, `bk01-client-page-${scheme}.png`);
    // iOS swipe-back, frame by frame: Clients is underneath the client page.
    for (const [label, f] of [["0", 0], ["35", 0.35], ["60", 0.6]]) {
      await dragTop(page, f, phone.width);
      await shot(page, `bk02-swipe-${label}-${scheme}.png`);
    }
    await dragTop(page, 0, phone.width);

    // Log workout pushed from the client page (BK-01 as drawn).
    await page.getByRole("button", { name: "More" }).first().click();
    await page.getByRole("button", { name: /Log in person for/ }).click();
    await page.getByRole("button", { name: "Log workout" }).click();
    await page.getByRole("heading", { name: "Log workout" }).waitFor({ timeout: 30000 });
    await sleep(800);
    await shot(page, `bk01-log-workout-${scheme}.png`);
    await dragTop(page, 0.35, phone.width);
    await shot(page, `bk02-swipe-log-workout-35-${scheme}.png`);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(browser, scheme, phone);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-06", { skipAuth: true }));
    await page.getByTestId("pushed-screen").waitFor({ timeout: 60000 });
    await sleep(1500);
    await shot(page, `bk01-checkin-review-${scheme}.png`);
    await dragTop(page, 0.35, phone.width);
    await shot(page, `bk02-swipe-checkin-35-${scheme}.png`);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(browser, scheme, phone);
    await page.getByTestId("tab-more").click();
    await page.getByText(/Notification/).first().click();
    await page.getByTestId("pushed-screen").waitFor({ timeout: 60000 });
    await sleep(1200);
    await shot(page, `bk01-notification-settings-${scheme}.png`);
    await ctx.close();
  }
  {
    const { page, ctx } = await open(browser, scheme, { width: 412, height: 915 });
    await clientPage(page);
    await shot(page, `android-size-client-page-${scheme}.png`);
    await ctx.close();
  }
  await browser.close();
}
console.log("done");
