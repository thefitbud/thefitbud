// Banned-strings check over v3 rendered text (innerText + title/aria-label/placeholder/alt), device chrome [data-chrome] excluded.
import fs from "node:fs";
import { chromium } from '/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs';
const spec = JSON.parse(fs.readFileSync("../../spec/banned-strings.json", "utf8"));
const H = process.cwd()+"/html/"; const files = fs.readdirSync(H).filter(f=>f.endsWith(".html"));
const b = await chromium.launch(); let errors=0,warns=0; const lines=[];
for (const f of files) {
  const mobile = !/-web|-ipad/.test(f);
  const p = await b.newPage({ viewport: mobile?{width:393,height:852}:{width:1440,height:900} });
  await p.goto("file://"+H+f);
  const text = await p.evaluate(()=>{document.querySelectorAll("[data-chrome]").forEach(e=>e.remove());
    const a=[...document.querySelectorAll("[title],[aria-label],[placeholder],[alt]")].map(e=>["title","aria-label","placeholder","alt"].map(k=>e.getAttribute(k)).filter(Boolean).join(" \n "));
    return document.body.innerText+"\n"+a.join("\n")+"\n"+document.title;});
  for (const pat of spec.patterns) {
    if (pat.scope==="mobile"&&!mobile) continue; if (pat.scope==="web"&&mobile) continue;
    const m=text.match(new RegExp(pat.regex,(pat.flags||"")+"g"));
    if (m){lines.push(`${pat.severity.toUpperCase()} ${f} [${pat.id}] ${JSON.stringify(m.slice(0,5))}`);pat.severity==="error"?errors++:warns++;}
  }
  const r=await p.getByRole("button",{name:/^\s*refresh\s*$/i}).count(); if(r){lines.push(`ERROR ${f} [manual-refresh-button]`);errors++;}
  await p.close();
}
await b.close(); console.log(lines.join("\n")||"(no matches)"); console.log(`\n${files.length} files checked · ${errors} errors · ${warns} warnings`);
