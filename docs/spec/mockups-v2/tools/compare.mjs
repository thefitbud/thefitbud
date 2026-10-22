// Mockup vs built side-by-sides -> compare/TR-xx-*.png and compare/compare-sheet.png
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const P = "/workspace/fitbud-mockups/png/", C = "/workspace/fitbud-mockups/compare/", B = C + "built/";
const PAIRS = [
  ["TR-01", "Sign in", "06-trainee-signin-ios.png", "tr01-signin-393.png"],
  ["TR-02", "Invite acceptance", "20-trainee-invite-ios.png", "tr02-invite-393.png"],
  ["TR-03", "Intake form", "21-trainee-intake-ios.png", "tr03-intake-393.png"],
  ["TR-04", "Waiting for coach", "22-trainee-waiting-ios.png", "tr04-waiting-393.png"],
  ["TR-05", "Reminder setup", "23-trainee-reminder-setup-ios.png", "tr05-reminders-393.png"],
  ["TR-06", "Today", "04-trainee-today-ios.png", "tr06-today-393.png"],
  ["TR-07", "Diet", "07-trainee-diet-ios.png", "tr07-diet-393.png"],
  ["TR-08", "Something different", "08-trainee-something-different-ios.png", "tr08-something-different-393.png"],
  ["TR-09", "Assigned meal plan", "24-trainee-meal-plan-ios.png", "tr09-mealplan-393.png"],
  ["TR-10", "Workout overview", "10-trainee-workout-overview-ios.png", "tr10-overview-393.png"],
  ["TR-11", "Active workout", "11-trainee-active-workout-ios.png", "tr11-active-393.png"],
  ["TR-12", "Workout summary", "12-trainee-workout-summary-ios.png", "tr12-summary-393.png"],
  ["TR-13", "Progress", "13-trainee-progress-ios.png", "tr13-progress-393.png"],
  ["TR-14", "Check-in", "14-trainee-check-in-ios.png", "tr14-checkin-393.png"],
  ["TR-15", "Notifications", "15-trainee-notifications-ios.png", "tr15-inbox-393.png"],
  ["TR-18", "Ask coach", "25-trainee-ask-coach-ios.png", "tr18-ask-393.png"],
  ["TR-23", "Item unavailable", "26-trainee-item-unavailable-ios.png", "tr23-unavailable-393.png"],
  ["TR-26", "Food search", "09-trainee-food-search-ios.png", "tr26-food-search-393.png"],
];
const css = `<link rel="stylesheet" href="file:///workspace/fitbud-mockups/html/tokens.css"><style>
body{margin:0;background:#E9E7F3;font-family:Satoshi,system-ui}
.pair{display:inline-block;padding:36px 40px 40px}
.pair h2{font-size:24px;font-weight:700;color:#1A1248;letter-spacing:-.01em;margin-bottom:18px}
.pair h2 span{color:#5B616B;font-weight:600;margin-right:8px}
.row{display:flex;gap:36px}
.lab{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:15px;font-size:15px;font-weight:700;margin-bottom:12px}
.lab.m{background:#4527C6;color:#fff}.lab.b{background:#fff;color:#25262B;border:1px solid #D9DCE8}
img{display:block;width:393px;height:852px;object-fit:cover;object-position:top;border-radius:40px;box-shadow:0 0 0 6px #121019,0 18px 36px -14px rgb(26 18 72/45%);background:#fff}
.sheet{padding:48px 56px}.sheet h1{font-size:34px;font-weight:700;color:#1A1248;margin-bottom:6px}.sheet .sub{font-size:17px;color:#5B616B;margin-bottom:24px}
.grid{display:grid;grid-template-columns:repeat(6,auto);gap:8px 12px}
.grid .pair{padding:16px 18px 24px;background:#F3F1FA;border-radius:24px}
.grid .pair img{width:240px;height:520px;border-radius:26px;box-shadow:0 0 0 4px #121019}
.grid .row{gap:14px}.grid .pair h2{font-size:18px;margin-bottom:10px}.grid .lab{height:24px;font-size:12px;margin-bottom:8px}
</style>`;
const pair = ([id, name, m, b]) => `<div class="pair"><h2><span>${id}</span>${name}</h2><div class="row"><div><div class="lab m">Mockup</div><img src="file://${P}${m}"></div><div><div class="lab b">Built now</div><img src="file://${B}${b}"></div></div></div>`;
const br = await chromium.launch();
const pg = await br.newPage({ viewport: { width: 920, height: 900 }, deviceScaleFactor: 2 });
for (const p of PAIRS) {
  fs.writeFileSync("/tmp/cmp.html", `<html><head>${css}</head><body>${pair(p)}</body></html>`);
  await pg.goto("file:///tmp/cmp.html"); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(150);
  const out = `${C}${p[0]}-${p[1].toLowerCase().replace(/[^a-z]+/g, "-")}.png`;
  await (await pg.$(".pair")).screenshot({ path: out }); console.log(out);
}
const sheet = `<html><head>${css}</head><body><div class="sheet"><h1>FitBud trainee mobile · Mockup vs Built now</h1><div class="sub">Every coded screen (TR-01 to TR-15, 18, 23, 26) · iOS 393 × 852 · built captures from the 18–19 Oct QA runs and branch cursor/mb-trainee-workout-progress-c688</div><div class="grid">${PAIRS.map(pair).join("")}</div></div></body></html>`;
fs.writeFileSync("/tmp/cmp-sheet.html", sheet);
const pg2 = await br.newPage({ viewport: { width: 3400, height: 900 }, deviceScaleFactor: 1 });
await pg2.goto("file:///tmp/cmp-sheet.html"); await pg2.evaluate(() => document.fonts.ready); await pg2.waitForTimeout(400);
await pg2.screenshot({ path: C + "compare-sheet.png", fullPage: true }); console.log("compare-sheet.png");
await br.close();
