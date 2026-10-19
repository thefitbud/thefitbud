import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const P = "/workspace/fitbud-mockups/png/";
const css = `<link rel="stylesheet" href="file:///workspace/fitbud-mockups/html/tokens.css"><style>
body{margin:0;background:#E9E7F3;font-family:Satoshi,system-ui;padding:56px 64px 64px}
h1{font-size:34px;font-weight:700;color:#1A1248;letter-spacing:-.02em;display:flex;align-items:center;gap:14px}
h1 img{width:44px}
.sub{font-size:17px;color:#5B616B;margin:6px 0 36px}
.row{display:flex;gap:36px;align-items:flex-start}
figure{margin:0}
figcaption{margin-top:14px;font-size:16px;font-weight:600;color:#1A1248}
figcaption span{display:block;font-size:14px;font-weight:500;color:#5B616B;margin-top:2px}
.web img{width:760px;border-radius:12px;box-shadow:0 1px 2px rgb(26 18 72/8%),0 20px 40px -16px rgb(26 18 72/28%);display:block}
.ph img{display:block;border-radius:44px;box-shadow:0 0 0 7px #121019,0 0 0 8px #3a3647,0 24px 44px -14px rgb(26 18 72/45%)}
.ph.a img{border-radius:30px}
</style>`;
const web = `<html><head>${css}</head><body><h1><img src="file:///workspace/fitbud-mockups/html/assets/mark.svg">FitBud · Trainer web</h1><div class="sub">High-fidelity targets · 1440 × 900 · Sun 18 Oct</div>
<div class="row web">
<figure><img src="file://${P}01-trainer-web-signin.png"><figcaption>1 · Sign in<span>Brand moment, password first, code sign-in as the alternative</span></figcaption></figure>
<figure><img src="file://${P}02-trainer-web-home.png"><figcaption>2 · Home · Today<span>Needs attention rows, one per client · check-ins, renewals, activity</span></figcaption></figure>
<figure><img src="file://${P}03-trainer-web-client-rohan.png"><figcaption>3 · Client workspace · Rohan<span>One primary CTA, WhatsApp as secondary, week in counts</span></figcaption></figure>
</div></body></html>`;
const ph = (f, cap, sub, a, w) => `<figure class="ph ${a ? "a" : ""}"><img style="width:${w}px" src="file://${P}${f}"><figcaption>${cap}<span>${sub}</span></figcaption></figure>`;
const mob = `<html><head>${css}</head><body><h1><img src="file:///workspace/fitbud-mockups/html/assets/mark.svg">FitBud · Mobile</h1><div class="sub">Trainee and trainer apps · iOS 393 × 852 and Android 412 × 915</div>
<div class="row" style="gap:44px">
${ph("04-trainee-today-ios.png", "4 · Trainee Today", "iOS · Aarav, 7:30 am", 0, 300)}
${ph("04-trainee-today-android.png", "4 · Trainee Today", "Android", 1, 314)}
${ph("05-trainer-mobile-attention-ios.png", "5 · Trainer Attention", "iOS · Rahul", 0, 300)}
${ph("05-trainer-mobile-attention-android.png", "5 · Trainer Attention", "Android", 1, 314)}
${ph("06-trainee-signin-ios.png", "6 · Trainee sign in", "iOS · password", 0, 300)}
${ph("06b-trainee-signin-code-ios.png", "6 · Sign in with a code", "iOS · email live, WhatsApp coming soon", 0, 300)}
</div></body></html>`;
const b = await chromium.launch();
for (const [name, html, w] of [["overview-web.png", web, 2480], ["overview-mobile.png", mob, 2196]]) {
  fs.writeFileSync("/tmp/" + name + ".html", html);
  const p = await b.newPage({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1 });
  await p.goto("file:///tmp/" + name + ".html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: "/workspace/fitbud-mockups/" + name, fullPage: true }); console.log(name);
}
await b.close();
