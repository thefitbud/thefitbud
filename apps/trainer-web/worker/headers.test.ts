import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { build } from "vite";

// Z14-38: hashed build assets are cached for a year; HTML is always revalidated.
const root = fileURLToPath(new URL("..", import.meta.url));

type Rule = { path: string; headers: Record<string, string> };

function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ path: line.trim(), headers: {} });
    } else {
      const i = line.indexOf(":");
      rules[rules.length - 1]!.headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

function assertRules(text: string) {
  const rules = parseHeaders(text);
  const cache = (p: string) => rules.filter((r) => r.path === p).map((r) => r.headers["cache-control"]);
  expect(cache("/assets/*")).toEqual(["public, max-age=31536000, immutable"]);
  for (const p of ["/", "/index.html", "/*.html"]) expect(cache(p)).toEqual(["no-cache"]);
  // Only those rules, only Cache-Control, no catch-all that would join with /assets/*.
  expect(rules.map((r) => r.path).sort()).toEqual(["/", "/*.html", "/assets/*", "/index.html"]);
  for (const r of rules) expect(Object.keys(r.headers)).toEqual(["cache-control"]);
  // Non-hashed public files (favicons, manifest, icons) never get immutable.
  const immutable = rules.filter((r) => /immutable/.test(r.headers["cache-control"] ?? ""));
  expect(immutable.map((r) => r.path)).toEqual(["/assets/*"]);
}

describe("trainer-web cache headers", () => {
  const out = mkdtempSync(join(tmpdir(), "fitbud-tw-dist-"));
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("public/_headers sets long-lived cache for /assets/* and no-cache for HTML", () => {
    assertRules(readFileSync(join(root, "public/_headers"), "utf8"));
  });

  it("vite build copies _headers to the output the Worker serves", async () => {
    await build({ root, logLevel: "silent", build: { outDir: out, emptyOutDir: true } });
    expect(existsSync(join(out, "_headers"))).toBe(true);
    assertRules(readFileSync(join(out, "_headers"), "utf8"));
    expect(existsSync(join(out, "index.html"))).toBe(true);
  }, 120_000);
});
