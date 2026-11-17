/**
 * Z12-3 tap-through + focus-ring smoke on spare ports.
 * TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-3/tapthrough.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("screen-TW-01").waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("textbox", { name: /mobile number or email/i }).fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/sign-in"), {
    timeout: 30_000,
  });
}

function assertFocusRing(el) {
  return el.evaluate((node) => {
    const s = getComputedStyle(node);
    const outline = s.outlineStyle !== "none" && s.outlineWidth !== "0px";
    const ring =
      s.boxShadow.includes("0 0") ||
      s.outlineOffset !== "0px" ||
      outline;
    return {
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow,
      ok: ring || s.outlineWidth !== "0px",
    };
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const results = [];

  await signIn(page);

  // Filtered-empty: stub empty list with filters
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [],
          nextCursor: null,
          facets: {
            status: { active: 15, ended: 2 },
            adherence: { no_recent_data: 5 },
            renewal: { due: 1 },
          },
        },
      }),
    });
  });
  await page.goto(`${BASE}/clients?adherenceState=no_recent_data&renewal=due`);
  await page.getByTestId("clients-empty").waitFor({ state: "visible" });
  const clearBtn = page.getByRole("button", { name: "Clear filters" });
  await clearBtn.focus();
  const clearRing = await assertFocusRing(clearBtn);
  results.push({ step: "filtered-empty Clear filters focus", ...clearRing });
  await clearBtn.click();
  await page.waitForTimeout(300);
  results.push({
    step: "clear filters updates URL",
    ok: !page.url().includes("adherenceState="),
  });

  // Error: fail directory
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "INTERNAL",
          message: "Please retry in a moment.",
          requestId: "req-tap-z12-3",
        },
      }),
    });
  });
  await page.goto(`${BASE}/clients`);
  await page.getByTestId("error-state").waitFor({ state: "visible" });
  const retry = page.getByRole("button", { name: "Retry" });
  await retry.focus();
  results.push({ step: "error Retry focus", ...(await assertFocusRing(retry)) });
  const support = page.getByRole("link", { name: /Email support/i });
  await support.focus();
  results.push({
    step: "error Email support focus",
    ...(await assertFocusRing(support)),
  });

  // True empty
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await page.route("**/api/clients**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          items: [],
          nextCursor: null,
          facets: { status: { ended: 0 }, adherence: {}, renewal: {} },
        },
      }),
    });
  });
  await page.goto(`${BASE}/clients`);
  await page.getByTestId("clients-empty").waitFor({ state: "visible" });
  const add = page
    .getByTestId("clients-empty")
    .getByRole("link", { name: /Add client/i });
  await add.focus();
  results.push({ step: "true-empty Add client focus", ...(await assertFocusRing(add)) });
  results.push({
    step: "true-empty hides filter bar",
    ok: (await page.getByTestId("filter-bar").count()) === 0,
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.ok === false);
  await browser.close();
  if (failed.length) {
    console.error("FAILED", failed);
    process.exit(1);
  }
  console.log("tap-through ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
