// Z14-36 capture (Expo web, light and dark at 393x852 and 360x800, plus 120% text).
//
//   node docs/qa/Z14-36/capture.mjs <expoWebUrl>
//
// Needs the local API (never staging) on the demo seed and the Expo web bundle
// (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<local API>) running.
// Saves into docs/qa/Z14-36/:
//   TM-01a6-attention-<variant>.png        Attention with the tab bar, for contrast
//   TM-01a6-see-all-<variant>.png          a section's See all page (no tab bar)
//   RP-03-resolve-confirm-<variant>.png    the Resolve outcome radio rows
//   RP-03-resolve-confirm-120-<variant>.png  the same at 120% text
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8191";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const variants = [
  ["393-light", "light", { width: 393, height: 852 }],
  ["393-dark", "dark", { width: 393, height: 852 }],
  ["360-light", "light", { width: 360, height: 800 }],
  ["360-dark", "dark", { width: 360, height: 800 }],
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
  const { page, ctx } = await open(browser, scheme, viewport);
  const shot = (file) => page.screenshot({ path: path.join(here, `${file}-${name}.png`) });
  const visible = (id) => page.getByTestId(id).locator("visible=true").first();

  await shot("TM-01a6-attention");
  const seeAll = page.getByRole("button", { name: /^See all/ }).locator("visible=true").first();
  if (await seeAll.count()) {
    await seeAll.click();
    await page.getByTestId("section-all-screen").waitFor({ timeout: 15000 });
    await sleep(1000);
    await shot("TM-01a6-see-all");
    console.log(name, "tab bars while See all:", await page.getByRole("tablist").count());
    await page.getByRole("button", { name: "Back" }).locator("visible=true").first().click();
    await sleep(500);
    console.log(name, "tab bars after Back:", await page.getByRole("tablist").count());
  } else {
    console.log(name, "no See all button on this seed");
  }

  await page.getByRole("button", { name: /^Review /, exact: false }).locator("visible=true").first().click();
  await visible("review-sheet-resolve").waitFor({ timeout: 30000 });
  await sleep(1000);
  await visible("review-sheet-resolve").click();
  await page.getByText("Note (only you)").locator("visible=true").first().waitFor({ timeout: 15000 });
  await sleep(600);
  await page.getByText(/^Talked to /).locator("visible=true").first().click();
  await sleep(300);
  await shot("RP-03-resolve-confirm");
  if (name === "393-light" || name === "360-light") {
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "120%";
    });
    await sleep(500);
    await shot("RP-03-resolve-confirm-120");
  }
  await ctx.close();
}
await browser.close();
console.log("done");
