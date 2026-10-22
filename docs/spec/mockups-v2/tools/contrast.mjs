// Rough WCAG contrast audit: each element with direct text vs nearest solid background.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const H = "/workspace/fitbud-mockups/html/";
const b = await chromium.launch();
for (const f of fs.readdirSync(H).filter((f) => f.endsWith(".html"))) {
  const p = await b.newPage({ viewport: /ios|android/.test(f) ? { width: 393, height: 852 } : { width: 1440, height: 900 } });
  await p.goto("file://" + H + f); await p.evaluate(() => document.fonts.ready);
  const res = await p.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
    const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const bgOf = (el) => { const stack = []; let e = el; while (e) { const cs = getComputedStyle(e); if (cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("url")) return { grad: true }; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } e = e.parentElement; } let base = { r: 255, g: 255, b: 255, a: 1 }; for (const c of stack.reverse()) base = blend(c, base); return base; };
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest("[data-chrome]") || el.closest("svg")) continue;
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!txt) continue;
      const cs = getComputedStyle(el); const fg0 = parse(cs.color); const bg = bgOf(el); if (bg.grad) continue;
      let op = 1; let e = el; while (e) { op *= +getComputedStyle(e).opacity; e = e.parentElement; }
      const fg = blend({ ...fg0, a: fg0.a * op }, bg);
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700; const large = size >= 24 || (bold && size >= 18.66);
      if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} "${txt.slice(0, 40)}" ${size}px`);
    }
    return out;
  });
  console.log(f, res.length ? "\n  " + [...new Set(res)].join("\n  ") : "OK");
  await p.close();
}
await b.close();
