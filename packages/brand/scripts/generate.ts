import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { brand } from "@fitbud/tokens";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logoDir = join(root, "logo");
const faviconDir = join(root, "favicon");
const appDir = join(root, "app");

for (const dir of [logoDir, faviconDir, appDir]) {
  mkdirSync(dir, { recursive: true });
}

const sourceMark = existsSync(join(root, "logo/mark.svg"))
  ? readFileSync(join(root, "logo/mark.svg"), "utf8")
  : readFileSync(
      "/home/ubuntu/.cursor/projects/workspace/uploads/runnerup-honest-week-mark_011c.svg",
      "utf8",
    );

writeFileSync(join(logoDir, "mark.svg"), sourceMark, "utf8");
writeFileSync(
  join(logoDir, "mark-white.svg"),
  sourceMark
    .replaceAll("#1A1248", "#FFFFFF")
    .replaceAll('fill="none" stroke="#FF587D"', 'fill="none" stroke="#FF587D"'),
  "utf8",
);
writeFileSync(
  join(logoDir, "mark-dark.svg"),
  sourceMark
    .replaceAll("#1A1248", brand.chalk)
    .replaceAll("#FF587D", brand.coral),
  "utf8",
);

function renderPng(svg: string, width: number, outPath: string, background?: string) {
  const wrapped = background
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}"><rect width="100%" height="100%" fill="${background}"/><g transform="translate(${width * 0.2},${width * 0.2}) scale(${width * 0.006})">${svg.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</g></svg>`
    : svg;
  const resvg = new Resvg(wrapped, {
    fitTo: { mode: "width", value: width },
    background: background ?? "transparent",
  });
  writeFileSync(outPath, resvg.render().asPng());
}

const markOnly = readFileSync(join(logoDir, "mark.svg"), "utf8");
renderPng(markOnly, 16, join(faviconDir, "favicon-16.png"));
renderPng(markOnly, 32, join(faviconDir, "favicon-32.png"));
renderPng(markOnly, 180, join(faviconDir, "apple-touch-icon.png"));
renderPng(markOnly, 192, join(faviconDir, "icon-192.png"));
renderPng(markOnly, 512, join(faviconDir, "icon-512.png"));
renderPng(markOnly, 1024, join(appDir, "icon.png"), brand.chalk);
renderPng(markOnly, 1024, join(appDir, "adaptive-foreground.png"));
writeFileSync(
  join(faviconDir, "site.webmanifest"),
  JSON.stringify(
    {
      name: "FitBud",
      short_name: "FitBud",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      theme_color: brand.deepNavy,
      background_color: brand.chalk,
    },
    null,
    2,
  ),
  "utf8",
);

// Minimal ICO: reuse 32px PNG bytes (browsers accept single-size ICO payload in dev)
writeFileSync(join(faviconDir, "favicon.ico"), readFileSync(join(faviconDir, "favicon-32.png")));

const webPublic = join(root, "../../apps/trainer-web/public");
mkdirSync(webPublic, { recursive: true });
for (const [name, from] of [
  ["favicon.ico", join(faviconDir, "favicon.ico")],
  ["favicon-32.png", join(faviconDir, "favicon-32.png")],
  ["apple-touch-icon.png", join(faviconDir, "apple-touch-icon.png")],
  ["site.webmanifest", join(faviconDir, "site.webmanifest")],
] as const) {
  writeFileSync(join(webPublic, name), readFileSync(from));
}

// Splash: chalk field + centred mark (1284×2778)
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778"><rect width="100%" height="100%" fill="${brand.chalk}"/><g transform="translate(442,1189) scale(4)">${markOnly.replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</g><text x="642" y="1500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="48" fill="${brand.deepNavy}">Progress, guided.</text></svg>`;
writeFileSync(join(appDir, "splash.png"), new Resvg(splashSvg).render().asPng());

console.log("Brand assets generated under packages/brand/");
