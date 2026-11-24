// Z14-24 capture (Expo web). Compare with docs/design/mockups/z14-17/.
//
//   node docs/qa/Z14-24/capture.mjs <expoWebUrl>
//
// Boots nothing itself: the local API (demo seed, never staging) and the Expo
// web bundle (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=<api>) must
// already be running. Sign-in is the demo trainer through the capture bridge.
// Test-only fixture: the client's notes (7, mixed visibility) are served by a
// Playwright route so the eye/lock marks and "See all notes" show; the API and
// its seed are untouched. Saves, for iOS-size light and dark (393x852) and
// Android-size light (412x915):
//   profile-top, profile-scrolled, profile-loading (reads held), profile-menu,
//   notes-all, note-sheet-empty, note-sheet-typed, note-discard
// A web page has no soft keyboard, so "keyboard up" is not captured here; the
// sheet's Save is in its header and the BottomSheet lifts it above the keyboard.
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.argv[2] ?? "http://localhost:8083";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const BODIES = [
  ["client", "Keep the last set at 40 kg this week. Tell me if the back still feels tight."],
  ["private", "Desk job, sits 9 hours. Add hip mobility before deadlifts."],
  ["client", "Great first week. Dal and roti portions look right."],
  ["private", "Prefers evening workouts after 7 pm. Vegetarian, eats eggs."],
  ["client", "Welcome! Start with the lighter weights this week."],
  ["private", "Intake call: wants to lose 6 kg by March. Old lower back strain in 2023."],
  ["private", "Referred by Neha. Pays by UPI on the 1st."],
];
const NOTES = BODIES.map(([visibility, body], i) => ({
  id: uuid(i + 1),
  coachingRelationshipId: uuid(900),
  trainerUserId: uuid(901),
  checkinId: null,
  body,
  visibility,
  subjectType: null,
  subjectId: null,
  sharedAt: null,
  seenAt: null,
  createdAt: new Date(Date.UTC(2026, 10, 13, 6, 0, 0) - i * 2 * 86_400_000).toISOString(),
  updatedAt: "2026-11-13T06:00:00.000Z",
}));

async function open(browser, scheme, viewport, hold) {
  const ctx = await browser.newContext({ viewport, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.route("**/__fitbud_api/checkins/relationships/*/notes*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.continue();
    const limit = Number(new URL(req.url()).searchParams.get("limit") ?? "80");
    const items = NOTES.slice(0, limit);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items, nextCursor: null } }),
    });
  });
  await page.route("**/__fitbud_api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (hold.ms > 0 && /\/(workspaces|clients|checkins|plans|workouts|meals|responsiveness)/.test(pathname)) {
      await sleep(hold.ms);
    }
    return route.fallback();
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, { timeout: 180000 });
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
  return { page, ctx };
}

const shot = (page, name) => page.screenshot({ path: path.join(here, name) });

async function scrollProfile(page, to) {
  await page.evaluate((to) => {
    // Every scrollable ancestor of the page content (the layers differ by platform).
    for (const el of document.querySelectorAll("div")) {
      if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        el.scrollTop = to;
      }
    }
  }, to);
  await sleep(500);
}

async function profile(page) {
  await page.evaluate(() => window.__fitbudCapture.navigate("TM-03", { skipAuth: true }));
  await page.getByTestId("client-status").waitFor({ timeout: 40000 }).catch(async (e) => {
    await page.screenshot({ path: "/tmp/claude-0/debug2.png" });
    throw e;
  });
  await page.getByText("Coach notes").first().waitFor({ timeout: 60000 });
  await page.getByTestId("note-row").first().waitFor({ timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: "/tmp/claude-0/debug.png" });
    throw e;
  });
  await sleep(800);
}

const runs = [
  ["light", { width: 393, height: 852 }, "ios-light"],
  ["dark", { width: 393, height: 852 }, "ios-dark"],
  ["light", { width: 412, height: 915 }, "android-light"],
];

for (const [scheme, viewport, tag] of runs) {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  const hold = { ms: 0 };

  // Loading: the profile's reads are held, so the paint is the header, the action
  // row and the cards with skeletons inside.
  {
    hold.ms = 6000;
    const { page, ctx } = await open(browser, scheme, viewport, hold);
    hold.ms = 6000;
    await page.evaluate(() => window.__fitbudCapture.navigate("TM-03", { skipAuth: true }));
    await page.getByTestId("client-status").waitFor({ timeout: 60000 });
    await page.getByTestId("client-skeleton").waitFor({ timeout: 20000 });
    await sleep(500);
    await shot(page, `${tag}-profile-loading.png`);
    await ctx.close();
  }

  hold.ms = 0;
  const { page, ctx } = await open(browser, scheme, viewport, hold);
  await profile(page);
  await shot(page, `${tag}-profile-top.png`);
  await scrollProfile(page, 900);
  await shot(page, `${tag}-profile-scrolled.png`);
  await scrollProfile(page, 0);

  // More menu: three rows and Cancel, no Add note.
  await page.getByTestId("client-status").getByLabel("More", { exact: true }).click();
  await page.getByText("Copy FitBud web link").waitFor({ timeout: 10000 });
  await sleep(400);
  await shot(page, `${tag}-profile-menu.png`);
  await page.getByText("Cancel", { exact: true }).click();
  await sleep(500);

  // Note sheet: empty, then typed with "<first> too", then the discard question.
  await page.getByTestId("client-add-note").click();
  await page.getByLabel("Note", { exact: true }).waitFor({ timeout: 10000 });
  await sleep(500);
  await shot(page, `${tag}-note-sheet-empty.png`);
  await page.getByLabel("Note", { exact: true }).fill("Keep the last set at 40 kg this week.");
  await page.getByTestId("note-vis-client").click();
  await sleep(300);
  await shot(page, `${tag}-note-sheet-typed.png`);
  await page.getByText("Cancel", { exact: true }).click();
  await page.getByText("Discard this note?").waitFor({ timeout: 10000 });
  await sleep(300);
  await shot(page, `${tag}-note-discard.png`);
  await page.getByText("Discard", { exact: true }).click();
  await sleep(600);

  // See all notes.
  await scrollProfile(page, 900);
  await page.getByTestId("see-all-notes").click();
  await page.getByTestId("client-notes").waitFor({ timeout: 20000 });
  await sleep(800);
  await shot(page, `${tag}-notes-all.png`);

  await ctx.close();
  await browser.close();
  console.log("done", tag);
}
