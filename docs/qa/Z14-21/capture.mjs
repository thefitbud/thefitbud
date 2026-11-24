// Z14-21 capture (Expo web, 393x852, light and dark).
//
//   node docs/qa/Z14-21/capture.mjs <expoWebUrl>
//
// Boots nothing itself: the local API (demo seed, never staging) and the Expo
// web bundle (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<api>)
// must already be running. Sign-in is the demo trainer through the capture
// bridge. The 75-client roster, the long Activity feed and the long Check-ins
// segment are a test-only fixture served by Playwright routes in this script:
// the API and its seed are untouched. Saves into docs/qa/Z14-21/:
//   clients-top-<scheme>          top of the list, to compare with TM-02a
//   clients-loading-more-<scheme> scrolled to the end while page 2 is in flight
//   clients-end-<scheme>          all 75 loaded, nothing under the last row
//   activity-top-<scheme>         to compare with TM-09a
//   activity-retry-<scheme>       page 2 failed: the inline retry row
//   checkins-top-<scheme>         to compare with TM-05a
//   checkins-end-<scheme>         the To review segment scrolled to its end
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8084";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
};
// Successful API bodies are wrapped as { data }; errors are { error }.
const json = (route, body, status = 200) =>
  route.fulfill({
    status,
    headers: { ...CORS, "content-type": "application/json" },
    body: JSON.stringify(status < 400 ? { data: body } : body),
  });

// ----------------------------------------------------------- the fixture ---
const FIRST = ["Rohan", "Priya", "Aarav", "Deepak", "Sneha", "Arjun", "Ishita", "Kabir", "Meera", "Vikram"];
const LAST = ["Mehta", "Nair", "Sharma", "Kapoor", "Shah", "Sen", "Iyer", "Rao", "Das", "Patel"];
const nameOf = (n) => `${FIRST[n % 10]} ${LAST[Math.floor(n / 10) % 10]} ${n + 1}`;

const ROSTER = Array.from({ length: 75 }, (_, n) => ({
  relationshipId: uuid(n + 1),
  invitationId: null,
  traineeDisplayName: nameOf(n),
  status: "coaching_ready",
  goalShort: n % 3 === 0 ? "Lose 4 kg" : null,
  nextCheckin: null,
  effectivePlan: null,
  adherenceState: n % 5 === 0 ? "needs_attention" : "on_track",
  renewalState: null,
  renewsOn: null,
  startedAt: "2026-07-06T04:00:00.000Z",
  endedAt: null,
  updatedAt: new Date(Date.UTC(2026, 10, 20, 9) - n * 2 * 3_600_000).toISOString(),
}));

function activityEvents(from, to) {
  return Array.from({ length: to - from }, (_, n) => {
    const i = from + n;
    return {
      id: `meal:${uuid(1000 + i)}`,
      relationshipId: uuid((i % 75) + 1),
      traineeDisplayName: nameOf(i % 75),
      type: "meal",
      subtype: i % 3 === 0 ? "Ate out" : "As planned",
      occurredAt: new Date(Date.UTC(2026, 10, 20, 12) - i * 3 * 3_600_000).toISOString(),
      traineeLocalTime: null,
      summary: i % 3 === 0 ? "Meal ate out" : "Meal as planned",
    };
  });
}

function inboxItem(n) {
  const id = uuid(2000 + n);
  const rel = uuid((n % 75) + 1);
  return {
    checkin: {
      id,
      coachingRelationshipId: rel,
      checkinScheduleId: null,
      localDate: "2026-11-15",
      windowStartsAt: "2026-11-14T18:30:00.000Z",
      windowEndsAt: "2026-11-15T18:29:00.000Z",
      recordStatus: "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      checkinFormVersionId: uuid(7),
      answers: null,
      submittedAt: new Date(Date.UTC(2026, 10, 19, 5) - n * 3_600_000).toISOString(),
      status: "submitted",
      review: null,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
    },
    coachingRelationshipId: rel,
    traineeUserId: uuid(3000 + n),
    traineeDisplayName: nameOf(n % 75),
    traineeTimezone: "Asia/Kolkata",
  };
}
const INBOX_TOTAL = 34;

// ------------------------------------------------------------- the routes ---
/** state.clientsPage2DelayMs: hold page 2 of the roster; state.activityFailPage2: 500 on page 2. */
async function installRoutes(page, state) {
  // The Expo web bundle reaches the API through its own origin at /__fitbud_api.
  await page.route((url) => url.pathname.startsWith("/__fitbud_api/"), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS });
    }
    const p = url.pathname.replace(/^\/__fitbud_api/, "");
    const q = url.searchParams;

    if (request.method() === "GET" && p === "/clients") {
      const limit = Number(q.get("limit") ?? 50);
      const from = q.get("cursor") ? Number(q.get("cursor")) : 0;
      const to = Math.min(from + limit, ROSTER.length);
      if (from > 0 && state.clientsPage2DelayMs) await sleep(state.clientsPage2DelayMs);
      return json(route, {
        items: ROSTER.slice(from, to),
        facets: {
          status: { coaching_ready: ROSTER.length },
          adherence: { needs_attention: 15, on_track: 60 },
          renewal: {},
        },
        nextCursor: to < ROSTER.length ? String(to) : null,
      });
    }
    if (request.method() === "GET" && p === "/activity/feed") {
      const limit = Number(q.get("limit") ?? 30);
      const from = q.get("cursor") ? Number(q.get("cursor")) : 0;
      if (from > 0 && state.activityFailPage2) {
        return json(route, { error: { code: "INTERNAL", message: "Something went wrong." } }, 500);
      }
      const to = Math.min(from + limit, 70);
      return json(route, {
        events: activityEvents(from, to),
        nextCursor: to < 70 ? String(to) : null,
      });
    }
    if (request.method() === "GET" && p === "/checkins/inbox") {
      const segment = q.get("segment") ?? "to_review";
      const limit = Number(q.get("limit") ?? INBOX_TOTAL);
      const from = q.get("cursor") ? Number(q.get("cursor")) : 0;
      const total = segment === "to_review" ? INBOX_TOTAL : 0;
      const to = Math.min(from + limit, total);
      return json(route, {
        items: Array.from({ length: to - from }, (_, n) => inboxItem(from + n)),
        nextCursor: to < total ? String(to) : null,
      });
    }
    return route.fallback();
  });
}

async function open(browser, scheme, state) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  await installRoutes(page, state);
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, {
    timeout: 180000,
  });
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await ready(page, page.getByTestId("attention-screen"), 60000);
  return { page, ctx };
}

const shot = (page, name) => page.screenshot({ path: path.join(here, name) });

/** Wait for a locator; on a timeout leave debug.png behind so the cause is visible. */
async function ready(page, locator, timeout = 60000) {
  try {
    await locator.waitFor({ timeout });
  } catch (err) {
    await shot(page, "debug.png");
    throw err;
  }
}

/** Scroll the list (the tallest scrollable element) to its end. */
async function scrollToEnd(page) {
  await page.evaluate(() => {
    const scrollers = [...document.querySelectorAll("div")].filter((el) => {
      const overflow = getComputedStyle(el).overflowY;
      return (overflow === "auto" || overflow === "scroll") && el.scrollHeight > el.clientHeight + 40;
    });
    const list = scrollers.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
    if (list) list.scrollTop = list.scrollHeight;
  });
}

for (const scheme of ["light", "dark"]) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

  // Clients: top, loading more (page 2 held), then the end of all 75.
  {
    const state = { clientsPage2DelayMs: 6000 };
    const { page, ctx } = await open(browser, scheme, state);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-02", { skipAuth: true }));
    await ready(page, page.getByText(nameOf(0), { exact: true }).locator("visible=true").first(), 60000);
    await sleep(800);
    await shot(page, `clients-top-${scheme}.png`);
    await scrollToEnd(page);
    await ready(page, page.getByTestId("paged-footer-loading"), 10000);
    await scrollToEnd(page);
    await sleep(300);
    await shot(page, `clients-loading-more-${scheme}.png`);
    state.clientsPage2DelayMs = 0;
    await ready(page, page.getByText(nameOf(30), { exact: true }).locator("visible=true").first(), 30000);
    for (let i = 0; i < 6; i += 1) {
      await scrollToEnd(page);
      await sleep(900);
    }
    await ready(page, page.getByText(nameOf(74), { exact: true }).locator("visible=true").first(), 30000);
    await scrollToEnd(page);
    await sleep(500);
    await shot(page, `clients-end-${scheme}.png`);
    await ctx.close();
  }

  // Activity: top, then page 2 fails and the retry row shows.
  {
    const state = { activityFailPage2: true };
    const { page, ctx } = await open(browser, scheme, state);
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
    await ready(page, page.getByText(/Meal as planned/).locator("visible=true").first(), 60000);
    await sleep(800);
    await shot(page, `activity-top-${scheme}.png`);
    await scrollToEnd(page);
    await ready(page, page.getByTestId("paged-footer-retry"), 20000);
    await sleep(300);
    await scrollToEnd(page);
    await shot(page, `activity-retry-${scheme}.png`);
    await ctx.close();
  }

  // Check-ins: top, then the To review segment's end.
  {
    const { page, ctx } = await open(browser, scheme, {});
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-05", { skipAuth: true }));
    await ready(page, page.getByTestId("checkin-row").locator("visible=true").first(), 60000);
    await sleep(800);
    await shot(page, `checkins-top-${scheme}.png`);
    for (let i = 0; i < 6; i += 1) {
      await scrollToEnd(page);
      await sleep(900);
    }
    await shot(page, `checkins-end-${scheme}.png`);
    await ctx.close();
  }
  await browser.close();
}
console.log("done");
