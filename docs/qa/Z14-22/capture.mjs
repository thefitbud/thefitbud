// Z14-22 capture (Expo web, light and dark at 393x852, light at 412x915 and 360x740).
//
//   node docs/qa/Z14-22/capture.mjs <expoWebUrl>
//
// Needs the local API (port 8792, demo seed, never staging) and the Expo web
// bundle (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=http://localhost:8792)
// already running. Sign-in is the demo trainer through the capture bridge. The
// Attention data (5 missed, 2 asked, 2 check-ins, 1 off plan, 1 noted: the
// Z14-17 frame's content) is a test-only fixture served by Playwright routes;
// the API and its seed are untouched. Saves into docs/qa/Z14-22/:
//   attention-top-<variant>        TM-01a3
//   attention-pill-tap-<variant>   TM-01a4 (after tapping the Check-ins tile)
//   attention-collapsed-<variant>  TM-01a5 (Missed collapsed)
//   section-see-all-<variant>      TM-01a6 (See all 5 missed)
// variants: ios-light, ios-dark (393x852), android-light (412x915), 360-light (360x740)
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8082";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(status < 400 ? { data: body } : body),
  });

const now = Date.now();
const NAMES = ["Rohan Mehta", "Neha Reddy", "Farhan Ali", "Deepak Nair", "Ishita Sen"];
const SUMMARY = [
  "Missed 2 workouts",
  "Breakfast not logged",
  "Missed Upper body A",
  "Missed Lower body B",
  "Lunch not logged",
];
const TYPES = ["missed_workout", "overdue_meal", "missed_workout", "missed_workout", "overdue_meal"];
const AGES = [7200, 4320, 2880, 1440, 1440];

const missed = NAMES.map((name, i) => ({
  relationshipId: uuid(100 + i),
  traineeDisplayName: name,
  clientWhatsappE164: null,
  bucket: "needs_you",
  itemCount: 1,
  mostSevere: i === 0 ? "critical" : "attention",
  oldestAgeMinutes: AGES[i],
  items: [
    {
      id: uuid(200 + i),
      type: TYPES[i],
      severity: i === 0 ? "critical" : "attention",
      status: "active",
      ageMinutes: AGES[i],
      summary: SUMMARY[i],
      details: { localDate: "2026-11-20" },
      acknowledgedAt: null,
    },
  ],
}));
const off = {
  relationshipId: uuid(110),
  traineeDisplayName: "Priya Nair",
  clientWhatsappE164: null,
  bucket: "needs_you",
  itemCount: 1,
  mostSevere: "attention",
  oldestAgeMinutes: 2880,
  items: [
    {
      id: uuid(210),
      type: "meal_deviation",
      severity: "attention",
      status: "active",
      ageMinutes: 2880,
      summary: "Over calories 3 of the last 5 days",
      details: { localDate: "2026-11-20" },
      acknowledgedAt: null,
    },
  ],
};
const noted = {
  relationshipId: uuid(120),
  traineeDisplayName: "Meera Iyer",
  clientWhatsappE164: null,
  bucket: "reviewed",
  itemCount: 1,
  mostSevere: "attention",
  oldestAgeMinutes: 2880,
  items: [
    {
      id: uuid(220),
      type: "overdue_meal",
      severity: "attention",
      status: "acknowledged",
      ageMinutes: 2880,
      summary: "Lunch not logged",
      details: { localDate: "2026-11-20" },
      acknowledgedAt: new Date(now - 3_600_000).toISOString(),
    },
  ],
};
const needsYou = [...missed, off];
const ATTENTION = { groups: [...needsYou, noted], needsYou, reviewed: [noted] };

const asks = [
  ["Sneha Kapoor", "Can I swap squats for leg press? My knee is sore.", "pain", 140],
  ["Deepak Nair", "Dinner swap: paneer instead of chicken?", "meal_swap", 141],
].map(([, label, topic, n], i) => ({
  id: uuid(300 + i),
  relationshipId: uuid(n),
  itemType: "meal_assignment",
  itemId: uuid(400 + i),
  topic,
  status: "open",
  askCount: 1,
  askedAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
  lastAskedAt: new Date(now - (i + 1) * 3_600_000).toISOString(),
  itemLabel: label,
  itemDate: "2026-11-23",
}));

function inboxItem(n, name) {
  const rel = uuid(140 + n);
  return {
    checkin: {
      id: uuid(500 + n),
      coachingRelationshipId: rel,
      checkinScheduleId: null,
      localDate: "2026-11-23",
      windowStartsAt: "2026-11-22T18:30:00.000Z",
      windowEndsAt: "2026-11-23T18:29:00.000Z",
      recordStatus: "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: uuid(7),
      answers: null,
      submittedAt: new Date(now - (n + 1) * 5 * 3_600_000).toISOString(),
      status: "submitted",
      review: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    coachingRelationshipId: rel,
    traineeUserId: uuid(600 + n),
    traineeDisplayName: name,
    traineeTimezone: "Asia/Kolkata",
  };
}
const INBOX = [inboxItem(0, "Sneha Kapoor"), inboxItem(1, "Deepak Nair")];

async function installRoutes(page) {
  await page.route((url) => url.pathname.startsWith("/__fitbud_api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = url.pathname.replace(/^\/__fitbud_api/, "");
    if (request.method() === "GET" && p === "/exceptions/attention") return json(route, ATTENTION);
    if (request.method() === "GET" && p === "/coach-asks") {
      return json(route, { items: asks, nextCursor: null });
    }
    if (request.method() === "GET" && p === "/checkins/inbox") {
      return json(route, { items: INBOX, nextCursor: null });
    }
    return route.fallback();
  });
}

async function open(browser, scheme, viewport) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  await installRoutes(page);
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
  await page.getByText("Rohan Mehta", { exact: true }).locator("visible=true").first().waitFor({ timeout: 60000 });
  await sleep(800);
  return { page, ctx };
}

const variants = [
  ["ios-light", "light", { width: 393, height: 852 }],
  ["ios-dark", "dark", { width: 393, height: 852 }],
  ["android-light", "light", { width: 412, height: 915 }],
  ["360-light", "light", { width: 360, height: 740 }],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
for (const [name, scheme, viewport] of variants) {
  const shot = (page, file) => page.screenshot({ path: path.join(here, `${file}-${name}.png`) });
  const { page, ctx } = await open(browser, scheme, viewport);
  await shot(page, "attention-top");

  await page.getByTestId("needs-you-tile-checkins").click();
  await sleep(900);
  await shot(page, "attention-pill-tap");

  // Back to the top for the collapsed state.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("div")) {
      const overflow = getComputedStyle(el).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 40) {
        el.scrollTop = 0;
      }
    }
  });
  await sleep(500);
  await page.getByTestId("needs-you-section-missed").click();
  await sleep(500);
  await shot(page, "attention-collapsed");
  await page.getByTestId("needs-you-section-missed").click();
  await sleep(400);

  await page.getByRole("button", { name: "See all 5 missed" }).click();
  await page.getByTestId("section-all-screen").waitFor({ timeout: 10000 });
  await sleep(700);
  await shot(page, "section-see-all");
  await ctx.close();
}
await browser.close();
console.log("done");
