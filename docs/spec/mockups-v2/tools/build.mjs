// Builds src/*.html -> html/*.html: inlines Lucide icons, WhatsApp glyph and partials.
import fs from "node:fs";
import path from "node:path";
const ROOT = "/workspace/fitbud-mockups";
const LUCIDE = "/workspace/thefitbud-run/node_modules/.pnpm/lucide-react@1.59.0_@types+react@19.3.0_react@19.3.0/node_modules/lucide-react/dist/esm/icons";
const cache = {};
function icon(name, size, cls) {
  if (!cache[name]) {
    const f = path.join(LUCIDE, name + ".mjs");
    if (!fs.existsSync(f)) throw new Error("missing icon " + name);
    let t = fs.readFileSync(f, "utf8");
    const al = t.match(/export \{ default \} from '\.\/([\w-]+)\.mjs'/); // alias re-export (e.g. history -> rotate-ccw-clock)
    if (al) t = fs.readFileSync(path.join(LUCIDE, al[1] + ".mjs"), "utf8");
    const m = t.match(/node:\s*(\[[\s\S]*?\])\s*,\s*\n\s*aliases|node:\s*(\[[\s\S]*?\])\s*\n\s*\};/);
    const arr = Function("return " + (m[1] || m[2]))();
    cache[name] = arr.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  }
  const st = size ? ` style="width:${size}px;height:${size}px"` : "";
  return `<svg class="ic${cls ? " " + cls : ""}"${st} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cache[name]}</svg>`;
}
const WA = `<svg class="wa-glyph" viewBox="0 0 24 24" aria-hidden="true"><path fill="#25D366" d="M12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.16-3.48-8.41A11.82 11.82 0 0 0 12.05 0Z"/><path fill="#fff" d="M12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Z"/><path fill="#25D366" d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z"/></svg>`;
const SIG = `<svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="currentColor"/><rect x="5" y="5.5" width="3.2" height="6.5" rx="1" fill="currentColor"/><rect x="10" y="3" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="15" y="0" width="3.2" height="12" rx="1" fill="currentColor"/></svg>`;
const WIFI = `<svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3A10.6 10.6 0 0 0 8.5.5 10.6 10.6 0 0 0 1 3.5l1.2 1.3a9 9 0 0 1 6.3-2.5Z" fill="currentColor"/><path d="M8.5 5.8c1.5 0 2.8.5 3.9 1.5l1.2-1.3a7.4 7.4 0 0 0-10.2 0l1.2 1.3c1-1 2.4-1.5 3.9-1.5Z" fill="currentColor"/><path d="M8.5 9.2c.6 0 1.1.2 1.5.6L8.5 11.5 7 9.8c.4-.4.9-.6 1.5-.6Z" fill="currentColor"/></svg>`;
const BATT = `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="17" height="9" rx="2" fill="currentColor"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2Z" fill="currentColor" opacity=".45"/></svg>`;
const A_SIG = `<svg width="15" height="15" viewBox="0 0 15 15"><path d="M14 1v13H1L14 1Z" fill="currentColor"/></svg>`;
const A_WIFI = `<svg width="17" height="13" viewBox="0 0 17 13"><path d="M8.5 13 0 3.6A12.4 12.4 0 0 1 8.5.4 12.4 12.4 0 0 1 17 3.6L8.5 13Z" fill="currentColor"/></svg>`;
const A_BATT = `<svg width="9" height="15" viewBox="0 0 9 15"><rect x="2.5" y="0" width="4" height="2" rx=".5" fill="currentColor"/><rect x="0" y="1.5" width="9" height="13.5" rx="1.6" fill="currentColor"/></svg>`;
const SB_IOS = (t) => `<div class="sb" data-chrome><span class="time">${t}</span><span class="island"></span><span class="icons">${SIG}${WIFI}${BATT}</span></div>`;
const SB_AND = (t) => `<div class="sb" data-chrome><span class="time">${t}</span><span class="cam"></span><span class="icons">${A_WIFI}${A_SIG}${A_BATT}</span></div>`;

function partial(name, params) {
  let t = fs.readFileSync(path.join(ROOT, "src/partials", name + ".html"), "utf8");
  t = t.replace(/\{\{on:(\w+)\}\}/g, (_, k) => (params.active === k ? "on" : ""));
  t = t.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? "");
  return t;
}
function build(src) {
  let t = fs.readFileSync(src, "utf8");
  for (let i = 0; i < 3; i++) t = t.replace(/\{\{>\s*([\w-]+)([^}]*)\}\}/g, (_, n, args) => {
    const p = {}; for (const m of args.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)')/g)) p[m[1]] = m[2] ?? m[3];
    return partial(n, p);
  });
  t = t.replace(/\{\{sb-ios:([^}]+)\}\}/g, (_, x) => SB_IOS(x)).replace(/\{\{sb-and:([^}]+)\}\}/g, (_, x) => SB_AND(x));
  t = t.replace(/<wa><\/wa>/g, WA);
  t = t.replace(/<ic n="([\w-]+)"(?: s="(\d+)")?(?: c="([^"]*)")?><\/ic>/g, (_, n, s, c) => icon(n, s, c));
  if (/<ic /.test(t)) throw new Error("unreplaced icon in " + src);
  return t;
}
for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((f) => f.endsWith(".html"))) {
  fs.writeFileSync(path.join(ROOT, "html", f), build(path.join(ROOT, "src", f)));
  console.log("built", f);
}
