/**
 * Z12-4 tap-through + focus-ring smoke.
 * TRAINER_WEB_URL=http://127.0.0.1:5174 node docs/qa/Z12-4/tapthrough.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.TRAINER_WEB_URL ?? "http://127.0.0.1:5174";
const EMAIL = "rahul.coach@demo.fitbud.test";
const PASSWORD = "FitBud-demo-2026";

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "domcontentloaded" });
  await page
    .getByTestId("screen-TW-01")
    .waitFor({ state: "visible", timeout: 30_000 });
  await page
    .getByRole("textbox", { name: /mobile number or email/i })
    .fill(EMAIL);
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
  const results = [];

  // Desktop flow
  {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    await signIn(page);
    await page.goto(`${BASE}/clients/add`);
    await page.getByTestId("add-client-form").waitFor({ state: "visible" });

    const createBtn = page.getByRole("button", { name: /^Create invite$/i });
    await createBtn.focus();
    results.push({
      step: "Create invite focus ring",
      ...(await assertFocusRing(createBtn)),
    });

    const cancelBtn = page.getByRole("button", { name: /^Cancel$/i });
    await cancelBtn.focus();
    results.push({
      step: "Cancel focus ring",
      ...(await assertFocusRing(cancelBtn)),
    });

    const stamp = Date.now();
    await page.getByLabel(/^Client name$/i).fill(`Tap Client ${stamp}`);
    await page
      .getByLabel(/^Email$/i)
      .fill(`tap.client.${stamp}@demo.fitbud.test`);
    await page.getByPlaceholder(/98765/i).fill("9876500111");
    await createBtn.click();
    await page.getByTestId("invite-share-card").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    results.push({
      step: "success share card",
      ok: await page.getByTestId("invite-share-card").isVisible(),
    });
    const wa = page.getByRole("link", { name: /Send on WhatsApp/i });
    results.push({
      step: "WhatsApp link",
      ok: ((await wa.getAttribute("href")) || "").includes("wa.me"),
    });

    await page.getByRole("button", { name: /Invite another client/i }).click();
    await page.getByLabel(/^Client name$/i).fill("Kavya Nair");
    await page.getByLabel(/^Email$/i).fill("kavya.ended@demo.fitbud.test");
    await page.getByRole("button", { name: /^Create invite$/i }).click();
    await page.getByTestId("reactivate-client-link").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    const reactivate = page.getByTestId("reactivate-client-link");
    await reactivate.focus();
    results.push({
      step: "Reactivate focus ring",
      ...(await assertFocusRing(reactivate)),
    });
    results.push({
      step: "reactivate banner",
      ok: (await page.getByTestId("add-client-error").textContent())?.includes(
        "coached with you",
      ),
    });
    await page.close();
  }

  // iPad shell
  {
    const page = await browser.newPage({
      viewport: { width: 768, height: 1024 },
    });
    await signIn(page);
    await page.goto(`${BASE}/clients`);
    const menu = page.getByTestId("shell-menu-btn");
    await menu.waitFor({ state: "visible", timeout: 20_000 });
    await menu.focus();
    results.push({
      step: "hamburger focus ring",
      ...(await assertFocusRing(menu)),
    });
    await menu.click();
    await page.waitForTimeout(200);
    results.push({
      step: "nav drawer open",
      ok: await page.locator(".app-shell.is-nav-open").count().then((n) => n > 0),
    });
    const search = page.getByRole("button", { name: /Search clients/i });
    const box = await search.boundingBox();
    results.push({
      step: "search full-width-ish",
      ok: !!box && box.width > 280,
      width: box?.width ?? 0,
    });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.ok === false);
  if (failed.length) {
    console.error("FAILED", failed);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
