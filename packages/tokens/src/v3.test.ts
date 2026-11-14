/**
 * Z12-36: the v3 tokens in tokens.ts must equal the design kit. Fails when
 * someone hand-edits a generated value, or the kit changes and nobody ran
 * `pnpm --filter @fitbud/tokens generate:v3`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  keyToCssVar,
  kitTokens,
  parseRules,
  renderGeneratedTs,
  renderV3Css,
  V3_ADDITIONS_MARKER,
} from "./kitCss.js";
import { colorTokens, v3DarkColors, v3LightColors, v3Radii, v3TypeScale } from "./tokens.js";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const read = (path: string) => readFileSync(join(repo, path), "utf8");

const kitV3 = read("docs/design/v3/kit-v3.css");
const kitSource = read("docs/design/v3/src/kit.css");
const kit = kitTokens(kitV3, kitSource);

/** Every `--name: value` declared under `selector` in a stylesheet, independently of kitCss. */
function declared(css: string, selector: string): Map<string, string> {
  const out = new Map<string, string>();
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = new RegExp(`(?:^|})\\s*${selector.replace(/[.[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "g");
  for (const match of source.matchAll(re)) {
    for (const decl of (match[1] ?? "").matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/g)) {
      out.set(decl[1]!, decl[2]!.trim());
    }
  }
  return out;
}

const additions = kitSource.slice(kitSource.lastIndexOf("/*", kitSource.indexOf(V3_ADDITIONS_MARKER)));

describe("v3 tokens equal the design kit", () => {
  const cssLight = new Map([...declared(kitV3, ":root"), ...declared(additions, ":root")]);
  const cssDarkOverrides = new Map([
    ...declared(kitV3, "body.dark"),
    ...declared(additions, "body.dark"),
  ]);

  it("has every light custom property, value for value", () => {
    expect(cssLight.size).toBeGreaterThan(80);
    const fromTs = new Map(
      Object.entries(v3LightColors).map(([key, value]) => [keyToCssVar(key), value]),
    );
    expect(fromTs.size).toBe(cssLight.size);
    for (const [name, value] of cssLight) {
      expect(fromTs.get(name), name).toBe(/^#/.test(value) ? value.toUpperCase() : value);
    }
  });

  it("has every dark override, and light values for the rest", () => {
    expect(cssDarkOverrides.size).toBeGreaterThan(60);
    for (const [key, value] of Object.entries(v3DarkColors)) {
      const name = keyToCssVar(key);
      const expected = cssDarkOverrides.get(name) ?? cssLight.get(name);
      expect(value, name).toBe(/^#/.test(expected ?? "") ? expected!.toUpperCase() : expected);
    }
    expect(Object.keys(v3DarkColors)).toEqual(Object.keys(v3LightColors));
  });

  it("spot-checks DESIGN-SYSTEM-v3 §2 values", () => {
    expect(colorTokens.light.ink).toBe("#1A1248");
    expect(colorTokens.dark.ink).toBe("#F2F2F6");
    expect(colorTokens.light.coralStrong).toBe("#EE456E");
    expect(colorTokens.dark.bg).toBe("#0F0F13");
    expect(colorTokens.dark.navy).toBe("#33333C");
    expect(colorTokens.light.av3Fg).toBe("#8F5205");
    expect(colorTokens.dark.onCoach).toBe("#111116");
  });

  it("matches the type scale classes", () => {
    expect(v3TypeScale).toEqual(kit.type);
    expect(v3TypeScale.tBody).toEqual({ fontSize: 16, lineHeight: 21, fontWeight: 400, letterSpacing: -0.15 });
    expect(v3TypeScale.tLabel.textTransform).toBe("uppercase");
    expect(Object.keys(v3TypeScale)).toHaveLength(14);
  });

  it("kit-v3.css is the same stylesheet as src/kit.css before the additions", () => {
    const before = kitSource.slice(0, kitSource.lastIndexOf("/*", kitSource.indexOf(V3_ADDITIONS_MARKER)));
    expect(parseRules(before)).toEqual(parseRules(kitV3));
  });

  it("v3Radii equals the border-radius of its kit component rule", () => {
    // Every radius key names the kit rule it comes from; a new key must be added here.
    const source: Record<keyof typeof v3Radii, string | null> = {
      card: ".card",
      group: ".group",
      meal: ".meal",
      button: ".btn",
      buttonSm: ".btn.sm",
      input: ".inp",
      segment: ".seg",
      tag: ".tag",
      sheet: ".sheet",
      dialog: ".dialog",
      toast: ".toast",
      tabCapsule: ".tabbar",
      tab: ".tab",
      chip: ".chip",
      pill: ".pill",
      full: null, // "fully round" (DESIGN-SYSTEM-v3 §4); no kit rule, any value ≥ the largest pill works
    };
    expect(Object.keys(source).sort()).toEqual(Object.keys(v3Radii).sort());
    const rules = parseRules(kitV3);
    const radiusOf = (selector: string): number => {
      const rule = rules.find((r) => r.selector === selector);
      const decl = rule?.body.match(/border-radius:\s*([\d.]+)px/);
      if (!decl?.[1]) throw new Error(`no border-radius in kit rule ${selector}`);
      return Number(decl[1]);
    };
    for (const [key, selector] of Object.entries(source)) {
      const value = v3Radii[key as keyof typeof v3Radii];
      if (selector === null) {
        expect(value, key).toBeGreaterThanOrEqual(100);
        continue;
      }
      expect(value, `${key} (${selector})`).toBe(radiusOf(selector));
    }
  });

  it("the generated files are up to date (run generate:v3)", () => {
    expect(readFileSync(join(here, "v3.generated.ts"), "utf8")).toBe(renderGeneratedTs(kit));
    expect(readFileSync(join(here, "tokens-v3.css"), "utf8")).toBe(renderV3Css(kit));
  });
});
