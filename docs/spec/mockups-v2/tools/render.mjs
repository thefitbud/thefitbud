import { createRequire } from "node:module";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const H = "/workspace/fitbud-mockups/html/", P = "/workspace/fitbud-mockups/png/";
const W = { viewport: { width: 1440, height: 900 }, dpr: 2 };
export const SHOTS = [
  ["signin-web.html", "01-trainer-web-signin.png", W],
  ["home.html", "02-trainer-web-home.png", W],
  ["home.html", "02-trainer-web-home-full.png", { ...W, full: true }],
  ["home-greeting.html", "02b-trainer-web-home-greeting-variant.png", W],
  ["home-light-sidebar.html", "02c-trainer-web-home-light-sidebar-variant.png", W],
  ["workspace.html", "03-trainer-web-client-rohan.png", W],
  ["workspace.html", "03-trainer-web-client-rohan-full.png", { ...W, full: true }],
  ["today-ios.html", "04-trainee-today-ios.png", { viewport: { width: 393, height: 852 }, dpr: 3 }],
  ["today-ios-full.html", "04-trainee-today-ios-full.png", { viewport: { width: 393, height: 852 }, dpr: 3, full: true }],
  ["today-android.html", "04-trainee-today-android.png", { viewport: { width: 412, height: 915 }, dpr: 2.625 }],
  ["attention-ios.html", "05-trainer-mobile-attention-ios.png", { viewport: { width: 393, height: 852 }, dpr: 3 }],
  ["attention-android.html", "05-trainer-mobile-attention-android.png", { viewport: { width: 412, height: 915 }, dpr: 2.625 }],
  ["signin-ios.html", "06-trainee-signin-ios.png", { viewport: { width: 393, height: 852 }, dpr: 3 }],
  ["signin-code-ios.html", "06b-trainee-signin-code-ios.png", { viewport: { width: 393, height: 852 }, dpr: 3 }],
];
const only = process.argv[2];
const browser = await chromium.launch();
for (const [file, out, o] of SHOTS) {
  if (only && !file.includes(only) && !out.includes(only)) continue;
  const ctx = await browser.newContext({ viewport: o.viewport, deviceScaleFactor: o.dpr });
  const page = await ctx.newPage();
  await page.goto("file://" + H + file);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: P + out, fullPage: !!o.full });
  console.log("shot", out);
  await ctx.close();
}
await browser.close();
