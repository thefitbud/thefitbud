import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs/spec/evidence");

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
await page.goto("http://127.0.0.1:8081", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => Boolean(window.__fitbudCapture?.ready), {
  timeout: 90000,
});

async function login(email) {
  await page.evaluate(async (value) => {
    await window.__fitbudCapture.loginTrainee(value);
  }, email);
  await page.waitForTimeout(2500);
}
async function nav(id) {
  await page.evaluate(async (screenId) => {
    await window.__fitbudCapture.navigate(screenId, { skipAuth: true });
  }, id);
  await page.waitForTimeout(2000);
}
async function text() {
  return page.evaluate(() => document.body.innerText);
}

await login("aarav.ontrack@demo.fitbud.test");
await nav("TR-20");
await page.screenshot({ path: path.join(out, "TR-20.png") });
console.log("TR-20", (await text()).includes("We'll get back"));

await nav("TR-24");
const meal = await text();
console.log("TR-24 error", /at least an hour/.test(meal));
console.log("TR-24 order", meal.match(/Breakfast|Lunch|Snack|Dinner/g)?.join(">"));
await page.screenshot({ path: path.join(out, "TR-24.png") });

await nav("TR-16");
const summary = page.getByRole("switch", { name: "Daily summary" });
const before = await summary.getAttribute("aria-checked");
await summary.click();
await page.waitForTimeout(1200);
const after = await summary.getAttribute("aria-checked");
await nav("TR-16");
const reloaded = await page.getByRole("switch", { name: "Daily summary" }).getAttribute("aria-checked");
console.log("switch", before, after, reloaded);
if (before != null && reloaded !== before) {
  await summary.click();
  await page.waitForTimeout(800);
}

await login("deepak.dubai@demo.fitbud.test");
await nav("TR-24");
const deepakBefore = await text();
console.log("deepak 3:10", deepakBefore.includes("3:10"));
console.log("deepak hour error", /at least an hour/.test(deepakBefore));
await page.screenshot({ path: path.join(out, "TR-24--deepak-dubai.png") });
const reset = page.getByRole("button", { name: "Reset to plan" }).first();
if (await reset.count()) {
  await reset.click();
  await page.waitForTimeout(400);
  const save = page.getByRole("button", { name: "Save" });
  await save.click();
  await page.waitForTimeout(1500);
  const deepakAfter = await text();
  console.log("deepak after reset has plan line", /plan /.test(deepakAfter));
  console.log("deepak toast", /Meal times updated/.test(deepakAfter));
  await page.screenshot({ path: path.join(out, "TR-24--deepak-reset.png") });
}

await login("aarav.ontrack@demo.fitbud.test");
await nav("TR-21");
const widget = await text();
console.log("widget rest", /0:45|rest timer|Bench press/i.test(widget));
console.log("widget id", /TR-21/.test(widget));
await page.screenshot({ path: path.join(out, "TR-21.png") });

await browser.close();
