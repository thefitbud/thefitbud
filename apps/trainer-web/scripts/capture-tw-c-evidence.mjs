/**
 * Capture TW-C evidence screenshots into docs/spec/evidence/TW-C/
 * Viewport 1440×900 (and 390×844 / 768 where the spec asks).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../..");
const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5173";
const OUT = join(ROOT, "docs/spec/evidence/TW-C");
const MOCKUP = join(ROOT, "docs/spec/mockups/png");
const API = process.env.FITBUD_API_URL ?? "http://127.0.0.1:8787";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

const ROHAN = "c422296e-ed7b-4196-a2b4-647096af3002";
const SNEHA = "6a68b615-c47c-4bfc-a7f8-550becf7878a";
const VIKRAM = "2fe7a6d8-4c61-443d-9614-18b4210186ee";
const DEEPAK = "f2a64fdb-96ad-46f3-a95e-99151b4a25f1";
const KAVYA = "b9f01670-8acc-45f6-adab-d7728bca88a6";
const ISHITA = "0a72ab36-f042-46dc-bceb-67725d78b46a";
const UNKNOWN = "00000000-0000-4000-8000-000000000000";

async function apiToken() {
  const login = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": `198.51.100.${(Date.now() % 50) + 10}`,
    },
    body: JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
  });
  const body = await login.json();
  const token = body?.data?.token;
  if (!token) throw new Error(`login failed: ${JSON.stringify(body)}`);
  await fetch(`${API}/auth/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
  });
  return token;
}

async function signIn(page) {
  const token = await apiToken();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ token, email }) => {
      sessionStorage.setItem("fitbud.trainer.accessToken", token);
      sessionStorage.setItem("fitbud.trainer.email", email);
    },
    { token, email: EMAIL },
  );
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  if (page.url().includes("/sign-in")) {
    throw new Error(`session inject failed; still on ${page.url()}`);
  }
  await page.getByRole("heading", { name: /Today/i }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function shot(page, name, { fullPage = false } = {}) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage });
  console.log("wrote", path);
  return path;
}

async function sideBySide(browser, leftPath, rightPath, outName) {
  const out = join(OUT, outName);
  const leftB64 = (await readFile(leftPath)).toString("base64");
  const rightB64 = (await readFile(rightPath)).toString("base64");
  const html = `<!doctype html><html><body style="margin:0;background:#e8e6ef;display:flex;gap:24px;align-items:flex-start;padding:12px">
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Implemented</div><img id="l" src="data:image/png;base64,${leftB64}" style="display:block;max-width:1440px;height:auto"/></div>
  <div><div style="font:12px sans-serif;margin:0 0 8px;color:#333">Mockup</div><img id="r" src="data:image/png;base64,${rightB64}" style="display:block;max-width:1440px;height:auto"/></div>
</body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 3000, height: 2000 } });
  const p = await ctx.newPage();
  await p.setContent(html, { waitUntil: "load" });
  await p.waitForFunction(() => {
    const l = document.getElementById("l");
    const r = document.getElementById("r");
    return l?.complete && r?.complete && l.naturalHeight > 0 && r.naturalHeight > 0;
  });
  const box = await p.evaluate(() => ({
    width: document.body.scrollWidth + 24,
    height: document.body.scrollHeight + 24,
  }));
  await p.setViewportSize({
    width: Math.min(box.width, 4000),
    height: Math.min(Math.max(box.height, 900), 8000),
  });
  await p.screenshot({ path: out, fullPage: true });
  await ctx.close();
  console.log("wrote", out);
}

async function axeScan(page, name, results) {
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const violations = axe.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.length,
  }));
  results.push({ route: name, violations });
  console.log(
    `axe ${name}: ${violations.length} violations`,
    violations.map((v) => v.id).join(", ") || "none",
  );
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const axeResults = [];

  await signIn(page);

  // TW-09a / TW-09 Rohan overview
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-09").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(600);
  const overviewPath = await shot(page, "TW-09", { fullPage: true });
  await shot(page, "TW-09a");
  await shot(page, "TW-09-full", { fullPage: true });
  await axeScan(page, "TW-09-overview", axeResults);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-09-390");
  await shot(page, "TW-09a-390");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await shot(page, "TW-09-768");
  await page.setViewportSize({ width: 1440, height: 900 });

  // Deepak timezone
  await page.goto(`${BASE}/clients/${DEEPAK}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-09a--deepak");

  // Kavya ended
  await page.goto(`${BASE}/clients/${KAVYA}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-09a--ended");

  // 404
  await page.goto(`${BASE}/clients/${UNKNOWN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-09a--not-found");

  // TW-10 Sneha + Vikram
  await page.goto(`${BASE}/clients/${SNEHA}/onboarding`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-10").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(500);
  await shot(page, "TW-10");
  await axeScan(page, "TW-10-onboarding", axeResults);

  await page.goto(`${BASE}/clients/${VIKRAM}/onboarding`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-10--not-submitted");

  // TW-11 configure
  await page.goto(`${BASE}/clients/${ROHAN}/configure`, {
    waitUntil: "networkidle",
  });
  await page.getByTestId("screen-TW-11").waitFor({ state: "visible", timeout: 30_000 });
  const reminders = page.locator("details").filter({
    hasText: /Automatic reminders/i,
  });
  if (await reminders.count()) {
    await reminders.locator("summary").click();
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  await shot(page, "TW-11");
  await axeScan(page, "TW-11-configure", axeResults);

  await page.goto(`${BASE}/clients/${ISHITA}/configure`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(500);
  await shot(page, "TW-11--push-off");

  // TW-34 note composer
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /more actions/i }).click();
  await page.getByRole("menuitem", { name: /add note/i }).click();
  await page.getByTestId("screen-TW-34").waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(300);
  await shot(page, "TW-34");
  await axeScan(page, "TW-34-note", axeResults);

  // Exception drawer open from overview
  await page.goto(`${BASE}/clients/${ROHAN}/overview`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(400);
  const review = page.getByRole("button", { name: /^review$/i }).first();
  if (await review.count()) {
    await review.click();
    await page.waitForTimeout(500);
    await shot(page, "TW-09--exception-drawer");
  }

  // Side-by-side vs mockup
  await sideBySide(
    browser,
    overviewPath,
    join(MOCKUP, "03-trainer-web-client-rohan.png"),
    "TW-09-side-by-side.png",
  );

  await writeFile(
    join(OUT, "axe-results.json"),
    JSON.stringify(axeResults, null, 2),
  );
  console.log("wrote axe-results.json");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
