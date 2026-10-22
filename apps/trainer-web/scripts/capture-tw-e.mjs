/**
 * Capture TW-E evidence screenshots into docs/spec/evidence/TW-E/
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../../docs/spec/evidence/TW-E");
const ART = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const AARAV = "30e514e1-e3f4-4dac-ae4b-5f45e72c3df6";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const CHECKIN = "744e2975-255c-4469-9f9a-6da0a853c8f2";
const BASE = "http://127.0.0.1:5173";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible" });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForFunction(() => window.location.pathname === "/", null, {
    timeout: 45_000,
  });
}

async function shot(page, name) {
  const dest = path.join(OUT, name);
  await page.screenshot({ path: dest, fullPage: false });
  fs.copyFileSync(dest, path.join(ART, name));
  console.log("saved", name);
}

async function hasSideScroll(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
}

async function waitGone(page, text, timeout = 20_000) {
  await page.waitForFunction(
    (needle) => !document.body.innerText.includes(needle),
    text,
    { timeout },
  );
}

const layoutNotes = [];

async function captureViewport(page, url, name, size, ready) {
  await page.setViewportSize(size);
  await page.goto(`${BASE}${url}`);
  if (ready) await ready(page);
  else await page.waitForTimeout(1200);
  const scroll = await hasSideScroll(page);
  layoutNotes.push({ name, ...size, sidewaysScroll: scroll });
  await shot(page, name);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await signIn(page);

const activityReady = async (p) => {
  await p.getByTestId("screen-TW-17").waitFor();
  await waitGone(p, "Loading activity");
};

// TW-17 loading (intentional race)
await page.goto(`${BASE}/clients/${ROHAN}/activity`);
await page.getByTestId("screen-TW-17").waitFor();
await shot(page, "TW-17--loading.png");
await waitGone(page, "Loading activity");
await shot(page, "TW-17.png");

await page.getByRole("button", { name: /^Meals$/ }).click();
await waitGone(page, "Loading activity");
await shot(page, "TW-17--meals.png");

// empty: Custom far-future range if UI supports; else filter to unlikely state
await page.getByRole("button", { name: /^Workouts$/ }).click();
await page.getByRole("button", { name: /Missed/i }).click().catch(() => {});
await page.waitForTimeout(600);
const emptyVisible = await page
  .getByText(/No (workouts|meals) in this range/i)
  .isVisible()
  .catch(() => false);
if (emptyVisible) await shot(page, "TW-17--empty.png");

await captureViewport(page, `/clients/${ROHAN}/activity`, "TW-17-1280.png", {
  width: 1280,
  height: 800,
}, activityReady);
await captureViewport(page, `/clients/${ROHAN}/activity`, "TW-17-768.png", {
  width: 768,
  height: 900,
}, activityReady);
await captureViewport(page, `/clients/${ROHAN}/activity`, "TW-17-390.png", {
  width: 390,
  height: 844,
}, activityReady);

// offline after loaded
await page.setViewportSize({ width: 1440, height: 900 });
await page.context().setOffline(false);
await page.goto(`${BASE}/clients/${ROHAN}/activity`);
await activityReady(page);
await page.context().setOffline(true);
await page.waitForTimeout(500);
await shot(page, "TW-17--offline.png");
await page.context().setOffline(false);
await page.waitForTimeout(300);

// error: abort activity API only (page shell still loads)
await page.route("**/workspaces/relationships/*/activity*", (route) =>
  route.abort(),
);
try {
  await page.goto(`${BASE}/clients/${ROHAN}/activity`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("screen-TW-17").waitFor({ timeout: 15_000 });
  await page
    .getByText(/could not|couldn't|failed|retry|error/i)
    .first()
    .waitFor({ timeout: 10_000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "TW-17--error.png");
} finally {
  await page.unroute("**/workspaces/relationships/*/activity*");
}
// TW-18
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/clients/${AARAV}/progress`);
await page.getByTestId("screen-TW-18").waitFor();
await shot(page, "TW-18--loading.png");
await page.waitForFunction(
  () =>
    !!document.querySelector('[role="tab"]') ||
    document.body.innerText.includes("No weigh-ins yet"),
  null,
  { timeout: 20_000 },
);
await waitGone(page, "Loading progress");
await shot(page, "TW-18.png");
await captureViewport(page, `/clients/${AARAV}/progress`, "TW-18-1280.png", {
  width: 1280,
  height: 800,
}, async (p) => {
  await p.getByTestId("screen-TW-18").waitFor();
  await waitGone(p, "Loading progress");
});
await captureViewport(page, `/clients/${AARAV}/progress`, "TW-18-390.png", {
  width: 390,
  height: 844,
}, async (p) => {
  await p.getByTestId("screen-TW-18").waitFor();
  await waitGone(p, "Loading progress");
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/clients/${ROHAN}/progress`);
await page.getByTestId("screen-TW-18").waitFor();
await page.getByRole("heading", { name: /No weigh-ins yet/i }).waitFor();
await shot(page, "TW-18--empty.png");
await page.context().setOffline(true);
await page.waitForTimeout(400);
await shot(page, "TW-18--offline.png");
await page.context().setOffline(false);

// TW-19
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/clients/${ROHAN}/check-ins`);
await page.getByTestId("screen-TW-19").waitFor();
await shot(page, "TW-19--loading.png");
await waitGone(page, "Loading check-ins");
await shot(page, "TW-19.png");
await page.goto(`${BASE}/clients/${DEEPAK}/check-ins`);
await page.getByTestId("screen-TW-19").waitFor();
await waitGone(page, "Loading check-ins");
await page.getByRole("button", { name: /Schedule check-in/i }).click();
await page.waitForTimeout(500);
await shot(page, "TW-19--schedule.png");
await page.context().setOffline(true);
await page.waitForTimeout(400);
await shot(page, "TW-19--offline.png");
await page.context().setOffline(false);

// TW-20
await page.goto(`${BASE}/clients/${ROHAN}/check-ins/${CHECKIN}`);
await page.getByTestId("screen-TW-20").waitFor();
await shot(page, "TW-20--loading.png");
await page.getByTestId("review-action-bar").waitFor({ timeout: 20_000 });
await waitGone(page, "Loading review");
await shot(page, "TW-20.png");
const bar = page.getByTestId("review-action-bar");
const box = await bar.boundingBox();
layoutNotes.push({
  name: "TW-20-bar",
  barBottom: box ? box.y + box.height : null,
  viewportH: 900,
  barVisibleWithoutScroll: box ? box.y + box.height <= 900 : false,
});
await page.context().setOffline(true);
await page.waitForTimeout(400);
await shot(page, "TW-20--offline.png");
await page.context().setOffline(false);

// TW-22
await page.goto(`${BASE}/checkins`);
await page.getByTestId("screen-TW-22").waitFor();
await shot(page, "TW-22--loading.png");
await waitGone(page, "Loading check-ins");
await page.waitForFunction(
  () => {
    const tab = document.querySelector('[data-filter="submitted"]');
    return tab && !/To review 0\b/.test(tab.textContent || "");
  },
  null,
  { timeout: 20_000 },
).catch(() => {});
await shot(page, "TW-22.png");
const names = await page.locator(".roster-table td").allTextContents().catch(() => []);
layoutNotes.push({
  name: "TW-22-names",
  hasUuid: names.some((t) => /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(t)),
  sample: names.slice(0, 8),
});
await page.locator('[data-filter="overdue"]').click();
await page.waitForTimeout(600);
await shot(page, "TW-22--overdue.png");
await page.locator('[data-filter="reviewed"]').click();
await page.waitForTimeout(800);
await shot(page, "TW-22--reviewed.png");
await page.locator('[data-filter="submitted"]').click();
await page.waitForTimeout(600);
const emptyCopy = await page
  .getByText("No check-ins waiting. Nice.")
  .isVisible()
  .catch(() => false);
if (emptyCopy) await shot(page, "TW-22--empty.png");
await page.context().setOffline(true);
await page.waitForTimeout(400);
await shot(page, "TW-22--offline.png");
await page.context().setOffline(false);

// TW-D set table leftover check
await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/clients/${ROHAN}/plan`);
await page.waitForTimeout(1000);
const adjust = page.getByRole("button", { name: /^Adjust plan$/ });
if (await adjust.isVisible().catch(() => false)) {
  await adjust.click();
  await page.waitForTimeout(1500);
  await page.getByText(/Push-up|SET|RPE/i).first().waitFor({ timeout: 10_000 }).catch(() => {});
  await shot(page, "TW-D-set-table-1280.png");
  layoutNotes.push({
    name: "TW-D-set-table-1280",
    sidewaysScroll: await hasSideScroll(page),
  });
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/clients/${ROHAN}/plan`);
await page.waitForTimeout(800);
if (await adjust.isVisible().catch(() => false)) {
  await adjust.click();
  await page.waitForTimeout(1500);
  await shot(page, "TW-D-set-table-1440.png");
  layoutNotes.push({
    name: "TW-D-set-table-1440",
    sidewaysScroll: await hasSideScroll(page),
  });
}

fs.writeFileSync(
  path.join(OUT, "layout-notes.json"),
  JSON.stringify(layoutNotes, null, 2),
);
console.log("layout", layoutNotes);
await browser.close();
