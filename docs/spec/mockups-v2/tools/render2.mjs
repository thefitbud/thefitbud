// Renders mobile set 2 (screens 07–19, iOS 393×852 @3x). Usage: node tools/render2.mjs [filter]
import { createRequire } from "node:module";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const H = "/workspace/fitbud-mockups/html/", P = "/workspace/fitbud-mockups/png/";
export const SHOTS2 = [
  ["diet-ios.html", "07-trainee-diet-ios.png", "Diet", "Rohan · Mon 5:40 pm · breakfast closed by Rahul"],
  ["diet-photo-ios.html", "07b-trainee-diet-photo-ios.png", "Diet · photo after logging", "Log saved first · photo uploading"],
  ["something-different-ios.html", "08-trainee-something-different-ios.png", "Something different", "Three choices, nothing else"],
  ["portion-change-ios.html", "08b-trainee-portion-change-ios.png", "Changed the portion", "Planned items · stepper, remove, note"],
  ["ate-out-ios.html", "08c-trainee-ate-out-ios.png", "Ate out", "A note and Save"],
  ["food-search-ios.html", "09-trainee-food-search-ios.png", "Log it myself", "Food library search · live total"],
  ["workout-overview-ios.html", "10-trainee-workout-overview-ios.png", "Workout", "Sat · Tue and Thu still loggable"],
  ["workout-day-ios.html", "10b-trainee-workout-day-ios.png", "Workout day detail", "Full plan · sticky Start workout"],
  ["active-workout-ios.html", "11-trainee-active-workout-ios.png", "Active workout · mid-set", "Set table · one tap to log"],
  ["active-workout-rest-ios.html", "11b-trainee-active-workout-rest-ios.png", "Active workout · rest", "Timer running · next exercise open"],
  ["workout-summary-ios.html", "12-trainee-workout-summary-ios.png", "Workout done", "Recap in counts · note to Rahul"],
  ["progress-ios.html", "13-trainee-progress-ios.png", "Progress", "12-week weight trend · check-ins"],
  ["check-in-ios.html", "14-trainee-check-in-ios.png", "Weekly check-in", "Weight, photos, your week"],
  ["notifications-ios.html", "15-trainee-notifications-ios.png", "Notifications", "Today and Earlier"],
  ["more-ios.html", "16-trainee-more-ios.png", "More", "Profile, coach, settings, Help"],
  ["invite-ios.html", "20-trainee-invite-ios.png", "Invite acceptance", "Anita joins Rahul"],
  ["intake-ios.html", "21-trainee-intake-ios.png", "Intake form", "Section 2 of 5 · autosaved"],
  ["waiting-ios.html", "22-trainee-waiting-ios.png", "Waiting for coach", "Checklist · meanwhile"],
  ["reminder-setup-ios.html", "23-trainee-reminder-setup-ios.png", "Reminder setup", "Step 1 of 4"],
  ["meal-plan-ios.html", "24-trainee-meal-plan-ios.png", "Assigned meal plan", "Day totals · what changed"],
  ["ask-coach-ios.html", "25-trainee-ask-coach-ios.png", "Ask coach", "WhatsApp prefill · you press Send"],
  ["unavailable-ios.html", "26-trainee-item-unavailable-ios.png", "Item unavailable", "Replaced by a plan update"],
  ["lock-live-activity-ios.html", "27-trainee-lock-live-activity-ios.png", "Lock · Live Activity", "Exercise, set, rest countdown"],
  ["dynamic-island-ios.html", "27b-trainee-dynamic-island-ios.png", "Dynamic Island", "Expanded and compact"],
  ["lock-meal-push-ios.html", "28-trainee-lock-meal-push-ios.png", "Lock · meal push", "Grouped text · Eaten as planned, Open Diet"],
  ["inapp-meal-ios.html", "29-trainee-inapp-meal-ios.png", "In-app banner · meal", "Over Today · one-tap log"],
  ["inapp-note-ios.html", "29b-trainee-inapp-note-ios.png", "In-app banner · coach note", "Over Today · note text not shown"],
  ["lock-coach-ios.html", "30-trainee-lock-coach-ios.png", "Lock · check-in and note", "Check-in due · coach note"],
  ["clients-ios.html", "17-trainer-mobile-clients-ios.png", "Clients", "Trainer · search, filters, two chips"],
  ["client-status-ios.html", "18-trainer-mobile-client-status-ios.png", "Client status", "Trainer · Rohan this week"],
  ["check-in-review-ios.html", "19-trainer-mobile-check-in-review-ios.png", "Check-in review", "Trainer · sticky review sheet"],
];
if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv[2];
  const browser = await chromium.launch();
  for (const [file, out] of SHOTS2) {
    if (only && !file.includes(only) && !out.includes(only)) continue;
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.goto("file://" + H + file);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    await page.screenshot({ path: P + out });
    console.log("shot", out);
    await ctx.close();
  }
  await browser.close();
}
