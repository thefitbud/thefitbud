/**
 * Mobile theme.
 *
 * v3 (Z12-36): `themes.light` / `themes.dark` carry the generated v3 colour
 * tokens (`@fitbud/tokens`, from docs/design/v3/kit-v3.css), the v3 radii and
 * the v3 text variants. The app picks one with `ThemeProvider` / `useTheme()`
 * (apps/mobile/src/providers/ThemeProvider.tsx), following the system setting
 * (D-W12-12). Shared primitives read colours only from there.
 *
 * The v2 exports below (`colors`, `semanticColors`, `radii`, `ringColors`)
 * are deprecated and unchanged, so screens that have not migrated yet keep
 * rendering as they did in light. Each screen moves to `useTheme()` in its own
 * W12 task; do not add new uses.
 */
import {
  brand,
  colorTokens,
  error,
  ink,
  radii as tokenRadii,
  rings as tokenRings,
  semantic,
  spacing as tokenSpacing,
  success,
  surface,
  v3Radii,
  warning,
  type ColorScheme,
  type ColorTokens,
} from "@fitbud/tokens";
import { registeredFonts, textVariants, type TextVariant, type VariantStyle } from "./typography.js";

export type { ColorScheme, ColorTokens };

export type Theme = {
  scheme: ColorScheme;
  /** v3 colour tokens for this scheme (camelCase kit names: ink, ink2, bg, card, brand, onBrand, …). */
  colors: ColorTokens;
  radii: typeof v3Radii;
  spacing: typeof tokenSpacing;
  text: Readonly<Record<TextVariant, VariantStyle>>;
  /** 44 pt minimum tap target (AGENTS.md). */
  touchTarget: number;
};

function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: colorTokens[scheme],
    radii: v3Radii,
    spacing: tokenSpacing,
    text: textVariants,
    touchTarget: 44,
  };
}

export const themes: Readonly<Record<ColorScheme, Theme>> = {
  light: buildTheme("light"),
  dark: buildTheme("dark"),
};

/**
 * Default body text style for React Native `Text` / `TextInput`, applied
 * globally by `FontsProvider` once Inter has loaded, so copy never falls back
 * to the platform UI font.
 */
export const defaultTextStyle = {
  fontFamily: registeredFonts.regular,
} as const;

/** @deprecated v2 light palette for unmigrated screens; use `useTheme().colors`. */
export const colors = {
  deepNavy: brand.deepNavy,
  indigo: brand.indigo,
  coral: brand.coral,
  softCoral: brand.softCoral,
  paleLavender: brand.paleLavender,
  nearBlack: ink[900],
  darkGrey: ink[700],
  midGrey: ink[500],
  lightGrey: ink[200],
  white: "#FFFFFF",
  success,
  warning,
  error,
  info: semantic.info.text,
  background: surface.pageMobile,
  card: surface.card,
} as const;

/** @deprecated v2 semantic pairs; use `useTheme().colors` (crit/critTint, warn/warnTint, …). */
export const semanticColors = semantic;

/** @deprecated v2 radii; use `useTheme().radii`. */
export const radii = {
  card: tokenRadii.mobileCard,
  control: tokenRadii.mobileControl,
  pill: tokenRadii.webPill,
} as const;

export const spacing = tokenSpacing;

/** @deprecated 48 was the v2 value; v3 primitives use `useTheme().touchTarget` (44). */
export const touchTargetMin = 48;

/** @deprecated v2 ring colours; use `useTheme().colors` (brand, protein, carbs, fat, fill2). */
export const ringColors = tokenRings;
