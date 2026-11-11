// Z8-7 QA capture (LOCAL demo seed only, never remote).
// Usage, with the API and trainer web already running on the demo seed:
//   node docs/qa/Z8-7/capture.cjs <trainer-web dir> <web url> <api url> <out dir> <Neha relationship id> <ended Kavya relationship id>
const { createRequire } = require("node:module");
const path = require("node:path");
const [, , webDir, webUrl, apiUrl, outDir, nehaRel, endedRel] = process.argv;
const req = createRequire(path.join(path.resolve(webDir), "package.json"));
const { chromium } = req("@playwright/test");

const VIEWPORTS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
];
const FRAME = "IP-07-trainer-web-coaching-setup-mode-v3-web";

async function main() {
  const login = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: "rahul.coach@demo.fitbud.test",
      password: "FitBud-demo-2026",
    }),
  }).then((r) => r.json());
  const token = login.data.token;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(
    ([t]) => {
      sessionStorage.setItem("fitbud.trainer.accessToken", t);
      sessionStorage.setItem("fitbud.trainer.email", "rahul.coach@demo.fitbud.test");
    },
    [token],
  );
  const page = await context.newPage();
  const relId = nehaRel;

  async function open(id, ended) {
    await page.goto(`${webUrl}/clients/${id}/configure`);
    await page.locator("[data-testid=screen-TW-11]").waitFor({ timeout: 45000 });
    if (!ended) {
      await page.locator("#configure-coaching-mode").waitFor({ state: "attached" });
      await page.locator("[data-testid=coaching-mode-section]").waitFor({ timeout: 20000 }).catch(() => {});
      const details = page.locator("details", { has: page.locator("#configure-coaching-mode") });
      if (!(await details.evaluate((d) => d.open))) await details.locator("summary").click();
      // Close the Goal row so the frame's layout (one open row) is matched.
      const goal = page.locator("details", { has: page.locator("#configure-goal") });
      if (await goal.evaluate((d) => d.open)) await goal.locator("summary").click();
    } else {
      await page.locator("[data-testid=configure-readonly]").waitFor({ timeout: 20000 });
    }
    await page.waitForTimeout(500);
  }

  const shot = async (name, vp) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(outDir, `${FRAME}-${name}-${vp}.png`) });
  };
  // Pass 1: the seeded subscription has no mode yet ("Not set", To do).
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    await open(relId, false);
    await shot("not-set", `${w}x${h}`);
  }
  // Set Hybrid (local demo DB only) so the frame's state is on screen.
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(relId, false);
  await page.locator('.configure-mode-card:has(input[value="hybrid"])').click();
  await shot("editing-from-not-set", "1440x900");
  await page.getByRole("button", { name: "Save coaching mode" }).click();
  await page.getByText(/Coaching mode set to/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(300);
  await shot("saved", "1440x900");
  for (const [w, h] of VIEWPORTS) {
    await page.setViewportSize({ width: w, height: h });
    const vp = `${w}x${h}`;
    await open(relId, false);
    await shot("hybrid", vp);
    await page.locator('.configure-mode-card:has(input[value="online"])').click();
    await page.waitForTimeout(200);
    await shot("editing", vp);
    await open(endedRel, true);
    await shot("ended", vp);
  }
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
