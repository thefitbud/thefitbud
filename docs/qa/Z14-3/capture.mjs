// Z14-3 capture and timing harness (Expo web, 393x852, 80 ms injected latency).
//
//   node docs/qa/Z14-3/capture.mjs <expoWebUrl> <label> [timings|shots]
//
// Boots nothing itself: the local API (port 8792, demo seed) and the Expo web
// bundle (EXPO_PUBLIC_SCREEN_CAPTURE=1, EXPO_PUBLIC_API_BASE_URL=http://localhost:8792)
// must already be running. Every API request is held for 80 ms (the bundle
// reaches the API through Metro's /__fitbud_api proxy, so one route covers it).
// `timings` (default) prints the median of three runs; `shots` saves light and
// dark screenshots into docs/qa/Z14-3/.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [, , base = "http://localhost:8082", label = "after", mode = "timings"] = process.argv;
const LATENCY_MS = 80;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function newPage(browser, scheme, latency = LATENCY_MS) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  const state = { latency, calls: [] };
  // Metro proxies /__fitbud_api to the local API, so the bundle never crosses origins.
  await page.route("**/__fitbud_api/**", async (route) => {
    const req = route.request();
    if (req.method() !== "OPTIONS") state.calls.push(`${req.method()} ${new URL(req.url()).pathname}`);
    await sleep(state.latency);
    return route.continue();
  });
  await page.goto(base);
  await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, {
    timeout: 180000,
  });
  return { page, state, ctx };
}

async function login(page) {
  await page.evaluate(() => window.__fitbudCapture.loginTrainer());
  await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
}

const tab = (page, id) => page.getByTestId(`tab-${id}`).click();
const visible = (page, text, timeout = 60000) =>
  page.getByText(text, { exact: false }).first().waitFor({ timeout });

async function timed(fn) {
  const started = Date.now();
  await fn();
  return Date.now() - started;
}

async function timings(browser) {
  const out = {};
  const { page, state, ctx } = await newPage(browser, "light");
  // Needs you, first load after sign-in: time to the first client card.
  out.needsYouFirst = await timed(async () => {
    await page.evaluate(() => window.__fitbudCapture.loginTrainer());
    await page.locator('[data-testid="needs-you-action"]').first().waitFor({ timeout: 60000 });
  });
  await sleep(1500);
  // Clients, first visit.
  const clientsCalls = state.calls.length;
  out.clientsFirst = await timed(async () => {
    await tab(page, "clients");
    await page.locator('[data-testid^="client-row-"]').first().waitFor({ timeout: 60000 });
  });
  out.clientsCalls = state.calls.length - clientsCalls;
  await sleep(1500);
  // A client's page, first open.
  const row = page.locator('[data-testid^="client-row-"]').first();
  const clientCalls = state.calls.length;
  out.clientPageFirst = await timed(async () => {
    await row.click();
    await page.getByTestId("client-status").waitFor({ timeout: 60000 });
    // Fully loaded: the Reminders card (responsiveness) is the last block to arrive.
    await page.getByText(/Quiet hours/).first().waitFor({ timeout: 60000 });
  });
  out.clientPageCalls = state.calls.length - clientCalls;
  await sleep(2500);
  // Back, then open the same client again (snapshot now exists).
  await page.getByLabel("Back").first().click();
  await page.locator('[data-testid^="client-row-"]').first().waitFor({ timeout: 60000 });
  out.clientPageSecond = await timed(async () => {
    await page.locator('[data-testid^="client-row-"]').first().click();
    await page.getByTestId("client-status").waitFor({ timeout: 60000 });
    await page.getByText(/Quiet hours/).first().waitFor({ timeout: 60000 });
  });
  await sleep(2500);
  await page.getByLabel("Back").first().click();
  await page.locator('[data-testid^="client-row-"]').first().waitFor({ timeout: 60000 });
  // Tab switch: Clients to Needs you and back (second visit, within 30 s).
  await tab(page, "attention");
  await sleep(300);
  const switchCalls = state.calls.length;
  out.tabSwitchBack = await timed(async () => {
    await tab(page, "clients");
    await page.locator('[data-testid^="client-row-"]').first().waitFor({ timeout: 60000 });
  });
  out.tabSwitchCalls = state.calls.length - switchCalls;
  out.apiCallsTotal = state.calls.length;
  out.callLog = state.calls;
  await ctx.close();
  return out;
}

// Paths that stay fast when a "data" delay is on, so sign-in and /me still work
// while the screens' own reads are held.
const AUTH_PATH = /\/(auth|me)(\/|$)/;

async function shotPage(browser, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: scheme,
  });
  const page = await ctx.newPage();
  const state = { all: LATENCY_MS, data: 0 };
  await page.route("**/__fitbud_api/**", async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname;
    const wait = AUTH_PATH.test(pathname) ? LATENCY_MS : Math.max(state.all, state.data);
    await sleep(wait);
    return route.continue();
  });
  const ready = async () => {
    await page.waitForFunction(() => window.__fitbudCapture?.ready === true, null, {
      timeout: 180000,
    });
  };
  await page.goto(base);
  await ready();
  return { page, state, ctx, ready };
}

const rows = (page) => page.locator('[data-testid^="client-row-"]');

// Each screen is captured twice:
//  - "none":     a fresh browser context (no snapshot); the screen's reads are held
//                for 4 s, so the paint is the empty or skeleton state.
//  - "snapshot": the screen is visited once (which saves its snapshot), the page is
//                reloaded so nothing stays mounted, then its reads are held for 4 s:
//                the paint is the last data plus the quiet "Updating…" line.
async function shots(browser) {
  const dir = here;
  mkdirSync(dir, { recursive: true });
  const taken = [];
  const save = async (page, name) => {
    await page.screenshot({ path: path.join(dir, name) });
    taken.push(name);
  };
  for (const scheme of ["light", "dark"]) {
    // ---- With none: Needs you, Clients, Activity, client page.
    {
      const { page, state, ctx } = await shotPage(browser, scheme);
      state.all = 4000;
      await page.evaluate(() => window.__fitbudCapture.loginTrainer());
      await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
      await sleep(900);
      await save(page, `needs-you-none-${scheme}.png`);
      // Clients, first visit: reads held, so the roster is a skeleton.
      await tab(page, "clients");
      await sleep(900);
      await save(page, `clients-none-${scheme}.png`);
      // Activity, first visit.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
      await sleep(900);
      await save(page, `activity-none-${scheme}.png`);
      // Client page, first open: let the roster arrive, then hold the page's reads.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-02", { skipAuth: true }));
      await rows(page).first().waitFor({ timeout: 60000 });
      await rows(page).first().click();
      await page.getByTestId("client-status").waitFor({ timeout: 60000 });
      await sleep(900);
      await save(page, `client-page-none-${scheme}.png`);
      await ctx.close();
    }
    {
      // Review sheet with no kept item: the list loads at normal speed, then the
      // item's own reads are held, so the card shows its loading line.
      const { page, state, ctx } = await shotPage(browser, scheme);
      await login(page);
      await sleep(2500);
      state.data = 4000;
      await page.locator('[data-testid="needs-you-action"]').nth(2).click();
      await sleep(900);
      await save(page, `review-sheet-none-${scheme}.png`);
      await ctx.close();
    }
    // ---- With a snapshot, one screen at a time.
    {
      const { page, state, ctx, ready } = await shotPage(browser, scheme);
      await login(page);
      await sleep(2500);
      await save(page, `needs-you-${scheme}.png`);
      // Review sheet on a client with several open items: item 1, then item 2.
      await page.locator('[data-testid="needs-you-action"]').nth(2).click();
      await sleep(1500);
      await save(page, `review-sheet-item1-${scheme}.png`);
      await page.getByLabel("Next item").first().click().catch(() => undefined);
      await sleep(250);
      await save(page, `review-sheet-item2-${scheme}.png`);
      await page.keyboard.press("Escape");
      await sleep(300);
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-01", { skipAuth: true }));
      // Clients (saves its snapshot).
      await tab(page, "clients");
      await rows(page).first().waitFor({ timeout: 60000 });
      await sleep(1500);
      await save(page, `clients-${scheme}.png`);
      // Activity.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
      await sleep(3500);
      await save(page, `activity-${scheme}.png`);
      // Client page (saves its snapshot).
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-02", { skipAuth: true }));
      await sleep(800);
      await rows(page).first().waitFor({ timeout: 60000 });
      await rows(page).first().click();
      await page.getByTestId("client-status").waitFor({ timeout: 60000 });
      await sleep(3000);
      await save(page, `client-page-${scheme}.png`);

      // Reload and hold every data read. The session and the snapshots survive.
      state.data = 4000;
      await page.reload();
      await ready();
      // Needs you is the landing tab: snapshot with Updating….
      await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
      await sleep(900);
      await save(page, `needs-you-snapshot-${scheme}.png`);
      // Clients, mounted for the first time after the reload.
      await tab(page, "clients");
      await rows(page).first().waitFor({ timeout: 60000 });
      await sleep(900);
      await save(page, `clients-snapshot-${scheme}.png`);
      // Activity, from its own snapshot.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
      await sleep(900);
      await save(page, `activity-snapshot-${scheme}.png`);
      // Client page, opened again with its reads held.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-02", { skipAuth: true }));
      await rows(page).first().waitFor({ timeout: 60000 });
      await rows(page).first().click();
      await page.getByTestId("client-status").waitFor({ timeout: 60000 });
      await sleep(900);
      await save(page, `client-page-snapshot-${scheme}.png`);
      await ctx.close();
    }
  }
  return taken;
}

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  if (mode === "shots") {
    const taken = await shots(browser);
    console.log(JSON.stringify({ label, taken }, null, 2));
  } else {
    const runs = [];
    for (let i = 0; i < 3; i += 1) runs.push(await timings(browser));
    const median = (key) => {
      const values = runs.map((run) => run[key]).sort((a, b) => a - b);
      return values[Math.floor(values.length / 2)];
    };
    const result = Object.fromEntries(
      Object.keys(runs[0]).filter((key) => key !== "callLog").map((key) => [key, median(key)]),
    );
    console.log(JSON.stringify({ label, latencyMs: LATENCY_MS, runs, median: result }, null, 2));
    writeFileSync(path.join(here, `timings-${label}.json`), JSON.stringify({ label, latencyMs: LATENCY_MS, runs, median: result }, null, 2));
  }
} finally {
  await browser.close();
}
