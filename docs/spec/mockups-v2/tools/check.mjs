// Banned-strings check over rendered text (innerText + title/aria-label/placeholder), excluding device chrome ([data-chrome]).
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire("/workspace/thefitbud-run/package.json");
const { chromium } = require("/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright");
const spec = JSON.parse(fs.readFileSync("/workspace/fitbud-spec/docs/spec/banned-strings.json", "utf8"));
const H = "/workspace/fitbud-mockups/html/";
const files = fs.readdirSync(H).filter((f) => f.endsWith(".html"));
const b = await chromium.launch();
let errors = 0, warns = 0; const lines = [];
for (const f of files) {
  const mobile = /ios|android/.test(f);
  const p = await b.newPage({ viewport: mobile ? { width: 393, height: 852 } : { width: 1440, height: 900 } });
  await p.goto("file://" + H + f);
  const text = await p.evaluate(() => {
    document.querySelectorAll("[data-chrome]").forEach((e) => e.remove());
    const attrs = [...document.querySelectorAll("[title],[aria-label],[placeholder],[alt]")].map((e) => [e.getAttribute("title"), e.getAttribute("aria-label"), e.getAttribute("placeholder"), e.getAttribute("alt")].filter(Boolean).join(" \n "));
    return document.body.innerText + "\n" + attrs.join("\n") + "\n" + document.title;
  });
  for (const pat of spec.patterns) {
    if (pat.scope === "mobile" && !mobile) continue;
    if (pat.scope === "web" && mobile) continue;
    const re = new RegExp(pat.regex, (pat.flags || "") + "g");
    const m = text.match(re);
    if (m) { lines.push(`${pat.severity.toUpperCase()} ${f} [${pat.id}] ${JSON.stringify(m.slice(0, 5))}`); pat.severity === "error" ? errors++ : warns++; }
  }
  const refresh = await p.getByRole("button", { name: /^\s*refresh\s*$/i }).count();
  if (refresh) { lines.push(`ERROR ${f} [manual-refresh-button] ${refresh}`); errors++; }
  await p.close();
}
await b.close();
console.log(lines.join("\n") || "(no matches)");
console.log(`\n${files.length} files checked · ${errors} errors · ${warns} warnings`);
