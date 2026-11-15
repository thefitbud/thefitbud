/** Design tokens — source of truth for web and mobile (Stage 1, PLAN A1). */
import { v3DarkColors, v3LightColors, v3TypeScale } from "./v3.generated.js";

export const tagline = "Progress, guided." as const;

export const brand = {
  indigo: "#4527C6",
  deepNavy: "#1A1248",
  coral: "#FF587D",
  softCoral: "#FFB0C3",
  paleLavender: "#EDEAFF",
  chalk: "#FAF7F2",
} as const;

export const ink = {
  900: "#0F1115",
  700: "#25262B",
  500: "#5B616B",
  200: "#E6E8EB",
} as const;

export const surface = {
  pageWeb: "#F3F5FB",
  pageMobile: "#F6F5FB",
  card: "#FFFFFF",
  border: "#E7E9F2",
} as const;

export const semantic = {
  critical: { fill: "#FEF2F2", text: "#B91C1C" },
  attention: { fill: "#FFFBEB", text: "#B45309" },
  positive: { fill: "#ECFDF5", text: "#047857" },
  info: { fill: "#EFF6FF", text: "#1D4ED8" },
  neutral: { fill: "#F3F4F6", text: "#374151" },
  brandSelected: { fill: "#EDEAFF", text: "#4527C6" },
  destructive: "#B91C1C",
} as const;

export const rings = {
  kcal: "#4527C6",
  protein: brand.deepNavy,
  carbs: "#7C6CF0",
  fat: "#0E7490",
  track: "#E6E8EB",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
} as const;

export const radii = {
  webCard: 16,
  webInput: 10,
  webPill: 999,
  mobileCard: 20,
  mobileControl: 16,
} as const;

export const fontFamily =
  'Satoshi, "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif';

/** @deprecated Use semantic.positive */
export const success = semantic.positive.text;
/** @deprecated Use semantic.attention */
export const warning = semantic.attention.text;
/** @deprecated Use semantic.critical */
export const error = semantic.critical.text;

/* ---------------------------------------------------------------------------
 * v3 (W12, Z12-36). Colours and type scale are generated from the design kit
 * (docs/design/v3/kit-v3.css + the "v3 additions" block of src/kit.css): see
 * scripts/generate-v3.ts and src/v3.generated.ts. Never hand-edit a v3 colour;
 * change the kit and regenerate (src/v3.test.ts fails on drift). The v2
 * exports above stay until trainer web moves (Z12-37) and the last mobile
 * screen migrates off them.
 * ------------------------------------------------------------------------- */

export { v3DarkColors, v3LightColors, v3TypeScale };

export type ColorScheme = "light" | "dark";

/** One theme's colour tokens; light and dark share the keys. */
export type ColorTokens = { readonly [K in keyof typeof v3LightColors]: string };

export type ColorToken = keyof ColorTokens;

export const colorTokens: Readonly<Record<ColorScheme, ColorTokens>> = {
  light: v3LightColors,
  dark: v3DarkColors,
};

export type TypeToken = keyof typeof v3TypeScale;

/** v3 radii (DESIGN-SYSTEM-v3 §4 and the kit-v3.css component rules). */
export const v3Radii = {
  card: 18,
  group: 16,
  meal: 16,
  button: 14,
  buttonSm: 12,
  input: 12,
  segment: 10,
  tag: 6,
  sheet: 22,
  dialog: 20,
  toast: 14,
  tabCapsule: 31,
  tab: 26,
  chip: 17,
  pill: 16,
  full: 999,
} as const;

/** v3 font stack for CSS contexts; native uses the expo-font family names. */
export const v3FontFamily =
  'Inter, "Noto Sans Devanagari", system-ui, sans-serif';
