import { describe, expect, it } from "vitest";
import { semantic } from "./tokens.js";

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

describe("semantic text on fill contrast", () => {
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
