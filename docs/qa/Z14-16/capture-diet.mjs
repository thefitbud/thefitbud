// Z14-16 capture, part 2 (Expo web, trainer app): the client's diet day with the
// Edited tag and the meal sheet with "Edited by / Was".
//
//   node docs/qa/Z14-16/capture-diet.mjs <expoWebUrl>
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8086";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const T = { timeout: 30000 };

const runs = [
  ["light", { width: 393, height: 852 }, "393x852-light"],


];

for (const [scheme, viewport, label] of runs) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  try {
    await page.goto(base);
    await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, { timeout: 180000 });
    await page.evaluate(() => window.__fitbudCapture.loginTrainer());
    await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
    await page.getByText("Edited lunch").first().click(T);
    await page.getByTestId("client-status").waitFor({ timeout: 60000 });
    await sleep(1500);
    // The diet day opens from the client page.
    await page.getByRole("button", { name: /Review day/i }).first().click(T);
    await page.getByText(/Meals ·/i).first().waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: "Previous day" }).click(T);
    await sleep(1500);
    await page.screenshot({ path: path.join(here, `app-diet-day-${label}.png`) });
    await page.getByRole("button", { name: /Lunch/ }).first().click(T);
    await page.getByText(/Edited by/).first().waitFor(T);
    await sleep(600);
    await page.screenshot({ path: path.join(here, `app-diet-sheet-${label}.png`) });
  } catch (err) {
    console.log(`skipped ${label}: ${String(err).slice(0, 200)}`);
    await page.screenshot({ path: "/tmp/claude-0/-home-user-thefitbud/b80adb66-5d8e-5ecf-b109-014f29031da7/scratchpad/diet-debug.png" });
    console.log(
      (await page.getByRole("button").allInnerTexts()).slice(0, 40).map((t) => t.replace(/\n/g, " ")).join(" | "),
    );
  }
  await ctx.close();
  await browser.close();
}
console.log("done");
