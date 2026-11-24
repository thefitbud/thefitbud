// Z14-23 capture (Expo web: iOS light and dark at 393x852, Android light at 412x915).
//
//   node docs/qa/Z14-23/capture.mjs <expoWebUrl>
//
// Needs the local API (never staging) on the demo seed and the Expo web bundle
// (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<local API>) already
// running. Sign-in is the demo trainer through the capture bridge. Everything
// is real local data: the review sheet opens from the first Review button on
// Attention, and the exception screen from the bridge's openFirstException.
// The local DB changes while capturing (noted, resolved); run `pnpm db:reseed`
// in apps/api between variants (RESEED=1 does it).
// Saves into docs/qa/Z14-23/:
//   RP-01-review-open-<variant>         review sheet, open item
//   RP-02-review-noted-<variant>        after Noted, keep open (state line)
//   RP-03-resolve-confirm-<variant>     the Resolve… outcome sheet
//   RP-04-review-resolved-<variant>     resolved item, read only (or all done)
//   RP-05-review-all-done-<variant>     the all-done summary when reached
//   RP-06-review-from-profile-<variant> the exception screen
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "../../../apps/api");
const base = process.argv[2] ?? "http://localhost:8187";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const variants = [
  ["ios-light", "light", { width: 393, height: 852 }],
  ["ios-dark", "dark", { width: 393, height: 852 }],
  ["android-light", "light", { width: 412, height: 915 }],
];

async function open(browser, scheme, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, { timeout: 240000 });
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await page.getByTestId("attention-screen").waitFor({ timeout: 90000 });
  await sleep(1500);
  return { page, ctx };
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
for (const [name, scheme, viewport] of variants) {
  if (process.env.RESEED === "1") {
    execSync("pnpm db:reseed", { cwd: apiDir, stdio: "ignore" });
  }
  const { page, ctx } = await open(browser, scheme, viewport);
  const shot = (file) => page.screenshot({ path: path.join(here, `${file}-${name}.png`) });
  const visible = (id) => page.getByTestId(id).locator("visible=true").first();

  // Review sheet from Attention.
  await page.getByRole("button", { name: /^Review /, exact: false }).locator("visible=true").first().click();
  await visible("review-sheet-resolve").waitFor({ timeout: 30000 });
  await sleep(1200);
  await shot("RP-01-review-open");

  // Noted, keep open.
  await visible("review-sheet-noted").click();
  await sleep(1500);
  await shot("RP-02-review-noted");
  const undo = page.getByTestId("review-sheet-undo").locator("visible=true").first();
  if (await undo.count()) {
    // keep the noted item for the resolve step
  } else {
    // A single-item client goes straight to the all-done summary (RP-05).
    await shot("RP-05-review-all-done");
    await page.getByRole("button", { name: "Previous item" }).locator("visible=true").first().click();
    await sleep(800);
  }

  // Resolve… confirm sheet.
  await visible("review-sheet-resolve").click();
  await page.getByText("Note (only you)").locator("visible=true").first().waitFor({ timeout: 15000 });
  await sleep(600);
  await shot("RP-03-resolve-confirm");
  await page.getByText(/^Talked to /).locator("visible=true").first().click();
  await visible("resolve-confirm").click();
  await sleep(2000);
  await shot("RP-04-review-resolved");
  if (!(await page.getByTestId("review-sheet-all-resolved").count())) {
    // not at the summary yet
  } else {
    await shot("RP-05-review-all-done");
  }
  await ctx.close();

  // The exception screen (opened from the profile or a notification).
  const second = await open(browser, scheme, viewport);
  await second.page.evaluate(() => window.__fitbudCapture.navigate("TM-04", { skipAuth: true }));
  await second.page.getByTestId("exception-review").waitFor({ timeout: 30000 });
  await sleep(1500);
  await second.page.screenshot({ path: path.join(here, `RP-06-review-from-profile-${name}.png`) });
  await second.ctx.close();
}
await browser.close();
console.log("done");
