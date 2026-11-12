// Z11-13 QA capture (LOCAL demo seed only). Usage with API and web running:
//   node docs/qa/Z11-13/capture.cjs <trainer-web dir> <web url> <out dir>
const { createRequire } = require("node:module");
const path = require("node:path");
const [, , webDir, webUrl, outDir] = process.argv;
const req = createRequire(path.join(path.resolve(webDir), "package.json"));
const { chromium } = req("@playwright/test");
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${webUrl}/`);
  await page.getByLabel(/email/i).fill("rahul.coach@demo.fitbud.test");
  await page.locator("input[name=password]").fill("FitBud-demo-2026");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(clients|today|attention)?/);
  await page.waitForTimeout(1500);
  const id = await page.evaluate(async () => {
    const token = sessionStorage.getItem("fitbud.trainer.accessToken");
    const res = await fetch("/api/clients?status=ended&q=Kavya", {
      headers: { authorization: `Bearer ${token}`, "x-fitbud-role": "trainer" },
    });
    const json = await res.json();
    const items = (json.data ?? json).items;
    return items.find((i) => /Kavya/.test(i.traineeDisplayName ?? i.displayName ?? ""))?.relationshipId ?? JSON.stringify(items[0]);
  });
  console.log("id", id);
  await page.goto(`${webUrl}/clients/${id}/overview`);
  await page.getByTestId("screen-TW-30").waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, "179-client-ended-1440x900.png") });
  console.log(await page.locator(".wsh").innerText());
  await browser.close();
})();
