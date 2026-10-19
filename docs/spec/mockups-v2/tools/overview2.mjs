// Contact sheet for mobile set 2 -> overview-mobile-2.png
import { createRequire } from "node:module";
import fs from "node:fs";
import { SHOTS2 } from "./render2.mjs";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const P = "/workspace/fitbud-mockups/png/";
const css = `<link rel="stylesheet" href="file:///workspace/fitbud-mockups/html/tokens.css"><style>
body{margin:0;background:#E9E7F3;font-family:Satoshi,system-ui;padding:56px 64px 64px}
h1{font-size:34px;font-weight:700;color:#1A1248;letter-spacing:-.02em;display:flex;align-items:center;gap:14px}
h1 img{width:44px}
.sub{font-size:17px;color:#5B616B;margin:6px 0 30px}
h2{font-size:20px;font-weight:700;color:#1A1248;margin:8px 0 20px}
.row{display:grid;grid-template-columns:repeat(8,300px);gap:36px 40px;align-items:start;margin-bottom:44px}
figure{margin:0}
figcaption{margin-top:14px;font-size:16px;font-weight:600;color:#1A1248}
figcaption span{display:block;font-size:14px;font-weight:500;color:#5B616B;margin-top:2px}
img.s{display:block;width:300px;border-radius:44px;box-shadow:0 0 0 7px #121019,0 0 0 8px #3a3647,0 24px 44px -14px rgb(26 18 72/45%)}
</style>`;
const fig = ([, f, cap, sub], i) => `<figure><img class="s" src="file://${P}${f}"><figcaption>${f.split("-")[0]} · ${cap}<span>${sub}</span></figcaption></figure>`;
const tr = SHOTS2.filter((s) => s[1].includes("trainee")), tm = SHOTS2.filter((s) => s[1].includes("trainer"));
const html = `<html><head>${css}</head><body><h1><img src="file:///workspace/fitbud-mockups/html/assets/mark.svg">FitBud · Mobile, set 2</h1><div class="sub">iOS 393 × 852 · trainee Rohan Mehta (coach Rahul Verma) · Fri 16 – Mon 19 Oct</div>
<h2>Trainee</h2>${[0, 8, 16].map((i) => `<div class="row">${tr.slice(i, i + 8).map(fig).join("")}</div>`).join("")}
<h2>Trainer mobile</h2><div class="row">${tm.map(fig).join("")}</div></body></html>`;
fs.writeFileSync("/tmp/overview-mobile-2.html", html);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2856, height: 800 }, deviceScaleFactor: 1 });
await p.goto("file:///tmp/overview-mobile-2.html"); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.screenshot({ path: "/workspace/fitbud-mockups/overview-mobile-2.png", fullPage: true }); console.log("overview-mobile-2.png");
await b.close();
