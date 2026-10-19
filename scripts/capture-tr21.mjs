import { mkdir, copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const out = "/workspace/docs/spec/evidence";
const artifacts = "/opt/cursor/artifacts/screenshots";
const base = "http://127.0.0.1:8081";

const banned = JSON.parse(
  await readFile("/workspace/docs/spec/banned-strings.json", "utf8"),
);

function hits(text) {
  const found = [];
  for (const pattern of banned.patterns) {
    if (pattern.severity !== "error") continue;
    if (pattern.scope === "web") continue;
    const re = new RegExp(pattern.regex, pattern.flags);
    if (re.test(text)) found.push(pattern.id);
  }
  return found;
}

await mkdir(out, { recursive: true });
await mkdir(artifacts, { recursive: true }).catch(() => {});
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
});
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("console", msg.text().slice(0, 200));
});

async function shot(name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file, fullPage: false });
  await copyFile(file, path.join(artifacts, name)).catch(() => {});
  console.log("saved", name);
}

await page.goto(base, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForFunction(() => Boolean(window.__fitbudCapture?.ready), {
  timeout: 90000,
});
await page.evaluate(async () => {
  await window.__fitbudCapture.loginTrainee("aarav.ontrack@demo.fitbud.test");
});
await page.waitForTimeout(2500);

const todayText = await page.evaluate(() => document.body.innerText);
console.log("TODAY banner", /isn't logged yet|Eaten as planned|From your coach/.test(todayText));
console.log("TODAY snippet", todayText.slice(0, 400).replaceAll("\n", " | "));
if (/isn't logged yet/.test(todayText)) await shot("TR-21--banner.png");

await page.evaluate(async () => {
  await window.__fitbudCapture.navigate("TR-21", { skipAuth: true });
});
await page.waitForTimeout(2500);
await page.getByText("needs a dev build").first().waitFor({ timeout: 20000 });

const initial = await page.evaluate(() => document.body.innerText);
console.log("INITIAL", initial.slice(0, 1800));
console.log("banned", hits(initial));
console.log("has id", /\bTR-21\b/.test(initial));
console.log("has placeholder", /placeholder/i.test(initial));
console.log("dev build", initial.includes("needs a dev build"));
await shot("TR-21.png");

if ((await page.getByRole("button", { name: "Snooze 30 min" }).count()) > 0) {
  await page.getByRole("button", { name: "Snooze 30 min" }).first().click();
  await page.getByText("Snoozed for 30 minutes.").waitFor({ timeout: 8000 });
  await shot("TR-21--snoozed.png");
  console.log("snooze ok");
} else {
  console.log("aarav has no open meal to snooze");
}

const eaten = page.getByRole("button", { name: "Eaten as planned" });
console.log("aarav eaten count", await eaten.count());

await page.getByText("Workout on the lock screen").scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await shot("TR-21--live.png");
await page.getByRole("button", { name: "Skip rest" }).first().click();
await page.getByText("Set 3 · Go").first().waitFor({ timeout: 5000 });
await shot("TR-21--rest-skipped.png");
console.log("skip rest ok");

const scrolled = await page.evaluate(() => document.body.innerText);
console.log("banned after", hits(scrolled));
console.log("dev note visible", scrolled.includes("needs a dev build"));

await page.evaluate(async () => {
  await window.__fitbudCapture.loginTrainee("rohan.slipping@demo.fitbud.test");
});
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  await window.__fitbudCapture.navigate("TR-21", { skipAuth: true });
});
await page.waitForTimeout(2500);
const rohan = await page.evaluate(() => document.body.innerText);
console.log("ROHAN", rohan.slice(0, 900));
console.log("rohan banned", hits(rohan));
if (/Snooze 30 min/.test(rohan)) {
  await shot("TR-21--rohan.png");
  await page.getByRole("button", { name: "Snooze 30 min" }).first().click();
  await page.getByText("Snoozed for 30 minutes.").waitFor({ timeout: 8000 });
  console.log("rohan snooze ok");
}
const rohanEaten = page.getByRole("button", { name: "Eaten as planned" });
if ((await rohanEaten.count()) > 0) {
  await rohanEaten.first().click();
  await page.getByText(/Saved on this phone/).first().waitFor({ timeout: 20000 });
  console.log(
    "rohan confirm",
    await page.getByText(/Saved on this phone/).first().innerText(),
  );
  await shot("TR-21--confirmed.png");
} else {
  console.log("rohan has no confirm button");
}

await browser.close();
