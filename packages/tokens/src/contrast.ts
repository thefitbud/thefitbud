/**
 * WCAG 2.x contrast for the v3 tokens. Pure functions plus the list of
 * text/background pairs the primitives use, shared by `contrast.test.ts`
 * and `scripts/contrast-report.ts` (which writes the table in
 * docs/qa/Z12-36/README.md).
 */
import type { ColorScheme, ColorToken, ColorTokens } from "./tokens.js";

type Rgba = { r: number; g: number; b: number; a: number };

/** Parse `#RGB`, `#RRGGBB` or `rgba(r,g,b,a)` / `rgb(r,g,b)`. */
export function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (hex?.[1]) {
    const raw =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((ch) => ch + ch)
            .join("")
        : hex[1];
    return {
      r: Number.parseInt(raw.slice(0, 2), 16),
      g: Number.parseInt(raw.slice(2, 4), 16),
      b: Number.parseInt(raw.slice(4, 6), 16),
      a: 1,
    };
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (fn?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = fn[1].split(",").map((part) => Number(part.trim()));
    return { r, g, b, a };
  }
  throw new Error(`Unsupported colour: ${value}`);
}

/** Composite a (possibly translucent) colour over an opaque one. */
export function over(top: string, bottom: string): Rgba {
  const t = parseColor(top);
  const b = parseColor(bottom);
  const mix = (x: number, y: number) => x * t.a + y * (1 - t.a);
  return { r: mix(t.r, b.r), g: mix(t.g, b.g), b: mix(t.b, b.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Contrast ratio of `fg` on `bg`. A translucent `bg` is first composited over
 * `base` (the page background), a translucent `fg` over the result.
 */
export function contrastRatio(fg: string, bg: string, base = "#FFFFFF"): number {
  const background = over(bg, base);
  const backgroundCss = `rgba(${background.r},${background.g},${background.b},1)`;
  const foreground = over(fg, backgroundCss);
  const l1 = luminance(foreground);
  const l2 = luminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** body text 4.5:1; large text (≥ 18.66 px bold / 24 px) and graphics 3:1. */
export type PairKind = "text" | "large" | "graphic";

export const MIN_RATIO: Record<PairKind, number> = { text: 4.5, large: 3, graphic: 3 };

/** A side of a pair: a token name, or a fixed colour per theme. */
type Side = ColorToken | { light: string; dark: string; label: string };

export type ContrastPair = {
  fg: Side;
  bg: Side;
  kind: PairKind;
  /** Where the primitives use it. */
  use: string;
};

/**
 * The text/background pairs the rebuilt primitives draw. The first block is
 * DESIGN-SYSTEM-v3 §2.3; the second adds every other pair a primitive uses.
 * `--ink4` is disabled-only and exempt (§2.3), so it is not listed.
 */
export const V3_CONTRAST_PAIRS: readonly ContrastPair[] = [
  { fg: "ink", bg: "bg", kind: "text", use: "Screen title and body on the page" },
  { fg: "ink", bg: "card", kind: "text", use: "Card, sheet and list text" },
  { fg: "ink2", bg: "card", kind: "text", use: "Secondary text on cards" },
  { fg: "ink2", bg: "fill", kind: "text", use: "Neutral banner, segmented label" },
  { fg: "ink3", bg: "bg", kind: "text", use: "Captions on the page" },
  { fg: "ink3", bg: "card", kind: "text", use: "Captions, hints, row trailing text" },
  { fg: "ink3", bg: "fill", kind: "text", use: "Captions on fills" },
  { fg: "onBrand", bg: "brand", kind: "text", use: "Primary button, brand pill" },
  { fg: "coachInk", bg: "card", kind: "text", use: "Coach text on cards" },
  { fg: "coachInk", bg: "coachTint", kind: "text", use: "Coach target chip" },
  { fg: "coralStrong", bg: "card", kind: "graphic", use: "Today ring, due outline on cards" },
  { fg: "coralStrong", bg: "bg", kind: "graphic", use: "Today ring on the page" },
  { fg: "coralInk", bg: "card", kind: "text", use: "Coral text on cards" },
  { fg: "coralInk", bg: "coralTint", kind: "text", use: "Coral tint tag" },
  { fg: "fixedNavy", bg: "coralStrong", kind: "text", use: "Badge numeral (tab badge)" },
  { fg: "done", bg: "card", kind: "text", use: "Done text on cards" },
  { fg: "done", bg: "doneTint", kind: "text", use: "Done tag" },
  { fg: "onBrand", bg: "done", kind: "graphic", use: "Tick on a done button" },
  { fg: "ink3", bg: "doneRow", kind: "text", use: "Previous value on a done row" },
  { fg: "warn", bg: "warnTint", kind: "text", use: "Warn tag / chip" },
  { fg: "crit", bg: "critTint", kind: "text", use: "Danger tag / quiet danger button" },
  { fg: "info", bg: "infoTint", kind: "text", use: "Info tag / chip" },
  { fg: "pr", bg: "prTint", kind: "text", use: "PR tag" },
  { fg: "carbs", bg: "fill2", kind: "graphic", use: "Carbs bar on its track" },
  { fg: "fat", bg: "fill2", kind: "graphic", use: "Fat bar on its track" },
  // Pairs the primitives add beyond §2.3.
  { fg: "ink", bg: "fill", kind: "text", use: "Secondary button, ghost pill, workout chip" },
  { fg: "brandInk", bg: "brandTint", kind: "text", use: "Tint button / pill / chip, banner brand" },
  { fg: "brand", bg: "brandTint", kind: "text", use: "Active tab label and icon" },
  { fg: "ink2", bg: "glass", kind: "text", use: "Inactive tab label (glass over page)" },
  { fg: "onBrand", bg: "ink", kind: "text", use: "Selected chip" },
  { fg: "onBrand", bg: "crit", kind: "text", use: "Danger button" },
  { fg: "crit", bg: "card", kind: "text", use: "Danger list row, field error help" },
  { fg: "infoInk", bg: "infoTint", kind: "text", use: "Info banner" },
  { fg: "warnInk", bg: "warnTint", kind: "text", use: "Warn banner" },
  { fg: "critInk", bg: "critTint", kind: "text", use: "Danger banner (ErrorBanner)" },
  { fg: "doneInk", bg: "doneTint", kind: "text", use: "Done banner" },
  { fg: "brand", bg: "card", kind: "text", use: "Text button, link, nav button" },
  {
    fg: { light: "#FFFFFF", dark: "#FFFFFF", label: "white" },
    bg: "navy",
    kind: "text",
    use: "Toast text (kit: white on --navy in both themes)",
  },
  { fg: "toastOk", bg: "navy", kind: "graphic", use: "Toast success tick" },
  { fg: "onCoach", bg: "coach", kind: "text", use: "Coach avatar initials" },
  { fg: "av1Fg", bg: "av1Bg", kind: "text", use: "Client avatar 1" },
  { fg: "av2Fg", bg: "av2Bg", kind: "text", use: "Client avatar 2" },
  { fg: "av3Fg", bg: "av3Bg", kind: "text", use: "Client avatar 3" },
  { fg: "av4Fg", bg: "av4Bg", kind: "text", use: "Client avatar 4" },
  { fg: "av5Fg", bg: "av5Bg", kind: "text", use: "Client avatar 5" },
  { fg: "av6Fg", bg: "av6Bg", kind: "text", use: "Client avatar 6" },
  { fg: "heroFg", bg: "heroB", kind: "text", use: "Workout hero card text" },
  { fg: "heroBtnFg", bg: "heroBtn", kind: "text", use: "Workout hero button" },
  { fg: "prInk", bg: "prTint2", kind: "text", use: "PR moment text" },
  { fg: "waInk", bg: "waBubble", kind: "text", use: "WhatsApp preview bubble" },
];

export function sideLabel(side: Side): string {
  return typeof side === "string" ? side : side.label;
}

function sideValue(side: Side, scheme: ColorScheme, tokens: ColorTokens): string {
  return typeof side === "string" ? tokens[side] : side[scheme];
}

export type ContrastResult = ContrastPair & {
  scheme: ColorScheme;
  ratio: number;
  min: number;
  pass: boolean;
};

/** Measure every pair in one theme (translucent backgrounds sit on `bg`). */
export function measurePairs(
  scheme: ColorScheme,
  tokens: ColorTokens,
  pairs: readonly ContrastPair[] = V3_CONTRAST_PAIRS,
): ContrastResult[] {
  return pairs.map((pair) => {
    const ratio = contrastRatio(
      sideValue(pair.fg, scheme, tokens),
      sideValue(pair.bg, scheme, tokens),
      tokens.bg,
    );
    const min = MIN_RATIO[pair.kind];
    return { ...pair, scheme, ratio, min, pass: ratio >= min };
  });
}
