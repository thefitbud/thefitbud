// Z14-25 capture (Expo web, light and dark).
//
//   node docs/qa/Z14-25/capture.mjs <expoWebUrl>
//
// Boots nothing itself: the local API (demo seed) and the Expo web bundle
// (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<api>) must already
// be running. Saves into docs/qa/Z14-25/:
//   bk01-account-*, bk01-password-*   More -> Account -> Password, 393x852
//   bk02-swipe-35-*, bk02-swipe-60-*  Password dragged 35 % / 60 % of the width,
//                                     Account visible underneath
//   android-password-*                the same Password page at 412x915
// Expo web has no native gesture handler, so the swipe frames set the pushed
// layer's transform directly: they show what is underneath and the layering,
// not the pan itself (that is the device run, F31-trainee-back.yaml).
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8084";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function open(browser, scheme, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, {
    timeout: 180000,
  });
  await page.evaluate(() => window.__fitbudCapture.loginTrainee("aarav.ontrack@demo.fitbud.test"));
  await page.getByTestId("trainee-today").waitFor({ timeout: 90000 });
  return { page, ctx };
}

const shot = (page, name) => page.screenshot({ path: path.join(here, name) });

async function toPassword(page) {
  await page.getByTestId("tab-more").click();
  await page.getByText("Account", { exact: true }).first().click();
  await page.getByTestId("trainee-overlay-account").waitFor({ timeout: 30000 });
  await sleep(800);
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
  for (const [name, viewport] of [
    ["", { width: 393, height: 852 }],
    ["android-", { width: 412, height: 915 }],
  ]) {
    const { page, ctx } = await open(browser, scheme, viewport);
    await toPassword(page);
    if (!name) await shot(page, `bk01-account-${scheme}.png`);
    await page.getByText("Password", { exact: true }).first().click();
    await page.getByTestId("trainee-overlay-password").waitFor({ timeout: 30000 });
    await sleep(900);
    await shot(page, `${name ? "android-password" : "bk01-password"}-${scheme}.png`);
    if (!name) {
      for (const [label, f] of [["35", 0.35], ["60", 0.6]]) {
        await dragTop(page, f, viewport.width);
        await shot(page, `bk02-swipe-${label}-${scheme}.png`);
      }
    }
    await ctx.close();
  }
  await browser.close();
}
console.log("done");
