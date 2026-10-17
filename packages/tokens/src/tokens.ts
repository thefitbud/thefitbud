/** Design tokens — source of truth for web and mobile (Stage 1, PLAN A1). */

export const tagline = "Progress, guided." as const;

export const brand = {
  indigo: "#4527C6",
  deepNavy: "#1A1249",
  coral: "#FF5B7D",
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
