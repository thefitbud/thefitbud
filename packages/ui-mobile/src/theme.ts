/**
 * Trainee light-theme tokens — sourced from @fitbud/tokens (Stage 1).
 */
import {
  brand,
  error,
  ink,
  radii as tokenRadii,
  rings as tokenRings,
  semantic,
  spacing as tokenSpacing,
  success,
  surface,
  warning,
} from "@fitbud/tokens";

/**
 * Default body text style for React Native `Text` / `TextInput`.
 * Use this (or rely on `FontsProvider`, which applies it globally after
 * Satoshi loads) so copy on sign-in / Today / Clients uses Satoshi instead
 * of the platform UI font (-apple-system / system).
 *
 * @example
 * ```tsx
 * import { defaultTextStyle } from "@fitbud/ui-mobile";
 * <Text style={[defaultTextStyle, styles.body]}>Hello</Text>
 * ```
 */
export const defaultTextStyle = {
  fontFamily: "Satoshi-Regular",
} as const;

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

export const semanticColors = semantic;

export const radii = {
  card: tokenRadii.mobileCard,
  control: tokenRadii.mobileControl,
  pill: tokenRadii.webPill,
} as const;

export const spacing = tokenSpacing;

export const touchTargetMin = 48;

export const ringColors = tokenRings;
