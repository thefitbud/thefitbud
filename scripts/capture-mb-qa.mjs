/**
 * Capture trainee screens at 393×852 via __fitbudCapture bridge.
 * Usage: node scripts/capture-mb-qa.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "/opt/cursor/artifacts/screenshots";
const EVIDENCE = "/workspace/docs/spec/evidence/MB";
mkdirSync(OUT, { recursive: true });
mkdirSync(EVIDENCE, { recursive: true });

const SCREENS = [
  ["TR-02", "tr02-invite-393.png"],
  ["TR-03", "tr03-intake-393.png"],
  ["TR-06", "tr06-today-393.png"],
  ["TR-10", "tr10-overview-393.png"],
  ["TR-10B", "tr10b-day-393.png"],
  ["TR-12", "tr12-summary-393.png"],
  ["TR-13", "tr13-progress-393.png"],
  ["TR-14", "tr14-checkin-393.png"],
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
page.setDefaultTimeout(60_000);

await page.goto("http://127.0.0.1:8081/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

for (let i = 0; i < 30; i++) {
  const ready = await page.evaluate(() => Boolean(globalThis.__fitbudCapture?.ready));
  if (ready) break;
  await page.waitForTimeout(1000);
}
const ready = await page.evaluate(() => Boolean(globalThis.__fitbudCapture?.ready));
if (!ready) {
  console.error("Capture bridge not ready — is EXPO_PUBLIC_SCREEN_CAPTURE=1?");
  process.exit(1);
}

for (const [id, file] of SCREENS) {
  console.log("navigate", id);
  await page.evaluate(async (screenId) => {
    await globalThis.__fitbudCapture.navigate(screenId);
  }, id);
  await page.waitForTimeout(2200);
  if (id === "TR-06") {
    // Check-in reply + Next check-in sit below the fold.
    await page.evaluate(() => {
      for (const n of document.querySelectorAll("div")) {
        if (n.scrollHeight > n.clientHeight + 40) n.scrollTop = 1400;
      }
      const hit = [...document.querySelectorAll("*")].find((el) =>
        [...el.childNodes].some(
          (c) =>
            c.nodeType === 3 && /Acknowledged|Next check-in/i.test(c.textContent || ""),
        ),
      );
      hit?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(600);
  }
  const pathOut = join(OUT, file);
  const pathEv = join(EVIDENCE, file.replace("-393.png", ".png"));
  await page.screenshot({ path: pathOut, fullPage: false });
  await page.screenshot({ path: pathEv, fullPage: false });
  console.log("wrote", pathOut);
}

await browser.close();
console.log("done");
