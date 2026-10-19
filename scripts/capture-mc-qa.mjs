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
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("console", msg.text().slice(0, 180));
});
await page.goto("http://127.0.0.1:8081", { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForFunction(() => Boolean(window.__fitbudCapture?.ready), { timeout: 90000 });

async function login(email) {
  await page.evaluate(async (value) => {
    await window.__fitbudCapture.loginTrainee(value);
  }, email);
  await page.waitForTimeout(2200);
}
async function nav(id) {
  await page.evaluate(async (screenId) => {
    await window.__fitbudCapture.navigate(screenId, { skipAuth: true });
  }, id);
  await page.waitForTimeout(1800);
}
async function text() {
  return page.evaluate(() => document.body.innerText);
}
async function shot(name) {
  await page.screenshot({ path: path.join(out, name), fullPage: false });
  console.log("saved", name);
}

await login("ishita.pushoff@demo.fitbud.test");
const greet = await text();
const greetLine = greet.split("\n").find((line) => /Good |That's everything/.test(line)) ?? "";
console.log("GREET", greetLine);

await login("kavya.ended@demo.fitbud.test");
await nav("TR-22");
const ended = await text();
console.log("ENDED once", (ended.match(/ended/gi) ?? []).length, ended.includes("Invite code"), ended.includes("Past coaching"));
console.log("ENDED snippet", ended.slice(0, 500).replaceAll("\n", " | "));
await shot("TR-22.png");
const past = page.getByRole("button", { name: "Past coaching" });
if (await past.count()) {
  await past.first().click();
  await page.waitForTimeout(2000);
  const pastText = await text();
  console.log("PAST", pastText.slice(0, 700).replaceAll("\n", " | "));
  console.log("PAST numeric date", /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(pastText));
  await shot("TR-22--past.png");
}

await login("aarav.ontrack@demo.fitbud.test");
await nav("TR-16");
const r16 = await text();
console.log("TR16 on-dup", r16.includes("Notifications: On"));
console.log("TR16 learn", r16.includes("Learn from my workouts"));
console.log("TR16 changed wrap", /\(\d+ changed\)/.test(r16));
await shot("TR-16.png");

await nav("TR-17");
const r17 = await text();
console.log("TR17 earlier", r17.includes("Earlier"));
console.log("TR17 never", (r17.match(/never sends reminders after .+/i) ?? [])[0]);
console.log("TR17 dup note", (r17.match(/No notifications during these hours/g) ?? []).length);
await shot("TR-17.png");

await nav("TR-19");
const r19 = await text();
console.log("TR19 hero", /All saved|Offline · .+ waiting/.test(r19), r19.includes("Diagnostics"));
await shot("TR-19.png");

await nav("TR-24");
const r24 = await text();
console.log("TR24 seg", r24.includes("Every day") && r24.includes("Weekdays") && r24.includes("Weekends"));
console.log("TR24 earlier btn", /\bEarlier\b/.test(r24));
await shot("TR-24.png");

await nav("TR-25");
const r25 = await text();
console.log("TR25", r25.includes("Coming soon"), r25.includes("See steps on Today"));
await shot("TR-25.png");

await nav("TR-21");
await page.getByText("needs a dev build").first().waitFor({ timeout: 20000 });
const r21 = await text();
console.log("TR21 canned", /Lower body B|Romanian deadlift/.test(r21));
console.log("TR21 long", r21.includes("Dynamic Island needs a dev build"));
console.log("TR21 line", r21.includes("The lock screen needs a dev build."));
console.log("TR21 workout", r21.includes("No workout planned.") ? "none" : "has plan");
await shot("TR-21.png");

await browser.close();
