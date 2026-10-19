/**
 * Capture TW-G evidence screenshots into docs/spec/evidence/TW-G/
 */
import { chromium, webkit } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../../../docs/spec/evidence/TW-G");
const ART = "/opt/cursor/artifacts/screenshots";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ART, { recursive: true });

const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";
const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";
const NIKHIL = "8919b5c0-73fa-495a-958e-e9333a41f4e7";
const FARHAN = "778a793a-d04e-44bc-b7aa-187f70573275";
const ISHITA = "0a72ab36-f042-46dc-bceb-67725d78b46a";
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

const layoutNotes = [];

async function captureViewport(page, url, name, size) {
  await page.setViewportSize(size);
  await page.goto(`${BASE}${url}`);
  await page.waitForTimeout(1200);
  const scroll = await hasSideScroll(page);
  layoutNotes.push({ name, ...size, sidewaysScroll: scroll });
  await shot(page, name);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await signIn(page);

// TW-21 History
await page.goto(`${BASE}/clients/${ROHAN}/history`);
await page.getByTestId("screen-TW-21").waitFor({ timeout: 30_000 });
await page.waitForTimeout(800);
await shot(page, "TW-21.png");
await captureViewport(page, `/clients/${ROHAN}/history`, "TW-21-1280.png", {
  width: 1280,
  height: 800,
});
await captureViewport(page, `/clients/${ROHAN}/history`, "TW-21-768.png", {
  width: 768,
  height: 1024,
});
await captureViewport(page, `/clients/${ROHAN}/history`, "TW-21-390.png", {
  width: 390,
  height: 844,
});
await page.setViewportSize({ width: 1440, height: 900 });
await page.route("**/api/history/**", (route) =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: { message: "fail" } }) }),
);
await page.goto(`${BASE}/clients/${ROHAN}/history`);
await page.waitForTimeout(1000);
await shot(page, "TW-21--error.png");
await page.unroute("**/api/history/**");
await page.context().setOffline(true);
await page.goto(`${BASE}/clients/${ROHAN}/history`);
await page.waitForTimeout(800);
await shot(page, "TW-21--offline.png");
await page.context().setOffline(false);

// TW-28 Settings
await page.goto(`${BASE}/settings/profile`);
await page.getByTestId("screen-TW-28").waitFor({ timeout: 20_000 });
await shot(page, "TW-28.png");
await page.goto(`${BASE}/settings/help`);
await page.waitForTimeout(500);
await shot(page, "TW-28--help.png");
await page.goto(`${BASE}/settings/units`);
await page.waitForTimeout(400);
await shot(page, "TW-28--units.png");
await page.goto(`${BASE}/settings/privacy`);
await page.waitForTimeout(400);
await shot(page, "TW-28--privacy.png");
await captureViewport(page, "/settings/profile", "TW-28-768.png", {
  width: 768,
  height: 1024,
});
await captureViewport(page, "/settings/profile", "TW-28-390.png", {
  width: 390,
  height: 844,
});
await page.setViewportSize({ width: 1440, height: 900 });

// TW-29 Notifications
await page.goto(`${BASE}/settings/notifications`);
await page.getByTestId("screen-TW-29").waitFor({ timeout: 20_000 });
await shot(page, "TW-29.png");
await page.route("**/api/notifications/preferences**", (route) =>
  route.fulfill({ status: 500, body: JSON.stringify({ error: { message: "fail" } }) }),
);
await page.goto(`${BASE}/settings/notifications`);
await page.waitForTimeout(900);
await shot(page, "TW-29--error.png");
await page.unroute("**/api/notifications/preferences**");
await page.context().setOffline(true);
await page.goto(`${BASE}/settings/notifications`);
await page.waitForTimeout(700);
await shot(page, "TW-29--offline.png");
await page.context().setOffline(false);

// TW-30 Ended
await page.goto(`${BASE}/clients?status=ended`);
await page.waitForTimeout(1000);
await shot(page, "TW-30--roster.png");
await page.goto(`${BASE}/settings/ended`);
await page.getByTestId("screen-TW-30").waitFor({ timeout: 20_000 });
await shot(page, "TW-30.png");
await page.goto(`${BASE}/clients/${KAVYA}/overview`);
await page.getByTestId("screen-TW-30").waitFor({ timeout: 20_000 });
await shot(page, "TW-30--kavya.png");
await page.goto(`${BASE}/clients/${NIKHIL}/overview`);
await page.waitForTimeout(1000);
await shot(page, "TW-30--nikhil-pending.png");
await page.getByRole("button", { name: /Reactivate|Cancel request/i }).first().waitFor({ timeout: 5_000 }).catch(() => {});
await shot(page, "TW-30--nikhil.png");
await page.goto(`${BASE}/settings/ended`);
await page.getByRole("button", { name: /^Reactivate$/i }).first().click();
await page.waitForTimeout(500);
await shot(page, "TW-30--reactivate-modal.png");
await page.getByRole("button", { name: /^Cancel$/i }).click();
await captureViewport(page, `/clients/${KAVYA}/overview`, "TW-30-768.png", {
  width: 768,
  height: 1024,
});
await page.setViewportSize({ width: 1440, height: 900 });

// TW-31 Responsiveness
await page.goto(`${BASE}/clients/${ROHAN}/overview`);
await page.waitForTimeout(1200);
await shot(page, "TW-31--rohan.png");
await page.getByRole("button", { name: /^Details$/i }).click();
await page.getByTestId("screen-TW-31").waitFor({ timeout: 10_000 });
await page.waitForTimeout(600);
await shot(page, "TW-31.png");
await page.keyboard.press("Escape").catch(() => {});
await page.goto(`${BASE}/clients/${FARHAN}/overview`);
await page.waitForTimeout(1200);
await shot(page, "TW-31--farhan.png");
await page.goto(`${BASE}/clients/${ISHITA}/overview`);
await page.waitForTimeout(1200);
await shot(page, "TW-31--ishita.png");

await browser.close();

// iPad WebKit shots
try {
  const wk = await webkit.launch({ headless: true });
  const ipad = await wk.newPage({ viewport: { width: 768, height: 1024 } });
  await signIn(ipad);
  await ipad.goto(`${BASE}/clients`);
  await ipad.waitForTimeout(1000);
  await shot(ipad, "TW-G-ipad-portrait-clients.png");
  await ipad.setViewportSize({ width: 1024, height: 768 });
  await ipad.goto(`${BASE}/`);
  await ipad.waitForTimeout(800);
  await shot(ipad, "TW-G-ipad-landscape-home.png");
  await ipad.goto(`${BASE}/settings/notifications`);
  await ipad.waitForTimeout(800);
  await shot(ipad, "TW-G-ipad-notifications.png");
  await wk.close();
} catch (err) {
  console.warn("webkit capture skipped:", err.message);
}

fs.writeFileSync(
  path.join(OUT, "layout-notes.json"),
  JSON.stringify(layoutNotes, null, 2),
);
console.log("layout notes written", layoutNotes.length);
