import { describe, expect, it } from "vitest";
import { colorTokens, semantic } from "./tokens.js";
import { contrastRatio as v3Contrast, measurePairs, sideLabel } from "./contrast.js";

function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "");
  const r = Number.parseInt(raw.slice(0, 2), 16) / 255;
  const g = Number.parseInt(raw.slice(2, 4), 16) / 255;
  const b = Number.parseInt(raw.slice(4, 6), 16) / 255;
  const transform = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [R, G, B] = [transform(r), transform(g), transform(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("v3 text/background pairs (Z12-36), both themes", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const result of measurePairs(scheme, colorTokens[scheme])) {
      const name = `${scheme}: ${sideLabel(result.fg)} on ${sideLabel(result.bg)} (${result.kind})`;
      it(`${name} ≥ ${result.min}:1`, () => {
        expect(result.ratio).toBeGreaterThanOrEqual(result.min);
      });
    }
  }

  it("reproduces the measured values in DESIGN-SYSTEM-v3 §2.3", () => {
    const at = (scheme: "light" | "dark", fg: string, bg: string) =>
      Number(v3Contrast(colorTokens[scheme][fg as "ink"], colorTokens[scheme][bg as "ink"]).toFixed(2));
    expect(at("light", "ink", "bg")).toBe(15.74);
    expect(at("dark", "ink", "bg")).toBe(17.13);
    expect(at("light", "ink3", "fill")).toBe(4.87);
    expect(at("dark", "coralStrong", "bg")).toBe(6.32);
    expect(at("light", "fat", "fill2")).toBe(3.33);
  });

  it("composites translucent colours before measuring", () => {
    // 50% black over white is #808080-ish: 3.95:1 against white.
    expect(v3Contrast("rgba(0,0,0,.5)", "#FFFFFF")).toBeCloseTo(3.95, 1);
  });
});

describe("v2 semantic text on fill contrast (trainer web until Z12-37)", () => {
  const pairs = [
    semantic.critical,
    semantic.attention,
    semantic.positive,
    semantic.info,
    semantic.neutral,
    semantic.brandSelected,
  ];

  for (const { fill, text } of pairs) {
    it(`${text} on ${fill} meets WCAG AA`, () => {
      expect(contrastRatio(text, fill)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
