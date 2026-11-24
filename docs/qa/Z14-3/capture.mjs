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

async function shots(browser) {
  const dir = here;
  mkdirSync(dir, { recursive: true });
  const taken = [];
  for (const scheme of ["light", "dark"]) {
    // No snapshot: every API call is held for 4 s, so the first paint is the
    // empty or skeleton state. A fresh context has no snapshot.
    {
      const { page, ctx } = await newPage(browser, scheme, 4000);
      await page.evaluate(() => window.__fitbudCapture.loginTrainer());
      await page.getByTestId("attention-screen").waitFor({ timeout: 60000 });
      await sleep(900);
      await page.screenshot({ path: path.join(dir, `needs-you-none-${scheme}.png`) });
      taken.push(`needs-you-none-${scheme}.png`);
      await ctx.close();
    }
    // With snapshots: visit each screen once at normal latency, then hold the API
    // for 4 s and come back, so the paint is the snapshot with "Updating…".
    {
      const { page, state, ctx } = await newPage(browser, scheme);
      await login(page);
      await sleep(2500);
      await page.screenshot({ path: path.join(dir, `needs-you-${scheme}.png`) });
      taken.push(`needs-you-${scheme}.png`);
      // Review sheet on a client with several open items: item 1, then step to item 2.
      await page.locator('[data-testid="needs-you-action"]').nth(2).click();
      await sleep(1500);
      await page.screenshot({ path: path.join(dir, `review-sheet-item1-${scheme}.png`) });
      taken.push(`review-sheet-item1-${scheme}.png`);
      await page.getByLabel("Next item").first().click().catch(() => undefined);
      await sleep(250);
      await page.screenshot({ path: path.join(dir, `review-sheet-item2-${scheme}.png`) });
      taken.push(`review-sheet-item2-${scheme}.png`);
      await page.keyboard.press("Escape");
      await sleep(300);
      // The sheet closes with its own dismiss; fall back to a reload-free reset.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-01", { skipAuth: true }));
      await tab(page, "clients");
      await page.locator('[data-testid^="client-row-"]').first().waitFor({ timeout: 60000 });
      await sleep(1500);
      await page.screenshot({ path: path.join(dir, `clients-${scheme}.png`) });
      taken.push(`clients-${scheme}.png`);
      // Activity (segment inside Clients).
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-09", { skipAuth: true }));
      await sleep(3500);
      await page.screenshot({ path: path.join(dir, `activity-${scheme}.png`) });
      taken.push(`activity-${scheme}.png`);
      // Client page.
      await page.evaluate(() => window.__fitbudCapture.navigate("TM-02", { skipAuth: true }));
      await sleep(800);
      const row = page.locator('[data-testid^="client-row-"]').first();
      await row.waitFor({ timeout: 60000 });
      await row.click();
      await page.getByTestId("client-status").waitFor({ timeout: 60000 });
      await sleep(3000);
      await page.screenshot({ path: path.join(dir, `client-page-${scheme}.png`) });
      taken.push(`client-page-${scheme}.png`);
      // Snapshot repaint: leave and reopen with the API held for 4 s.
      await page.getByLabel("Back").first().click();
      await row.waitFor({ timeout: 60000 });
      state.latency = 4000;
      await row.click();
      await page.getByTestId("client-status").waitFor({ timeout: 60000 });
      await sleep(700);
      await page.screenshot({ path: path.join(dir, `client-page-snapshot-${scheme}.png`) });
      taken.push(`client-page-snapshot-${scheme}.png`);
      state.latency = LATENCY_MS;
      await page.getByLabel("Back").first().click();
      // Needs you with a snapshot and the API held: switch away and back.
      state.latency = 4000;
      await tab(page, "attention");
      await sleep(700);
      await page.screenshot({ path: path.join(dir, `needs-you-snapshot-${scheme}.png`) });
      taken.push(`needs-you-snapshot-${scheme}.png`);
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
