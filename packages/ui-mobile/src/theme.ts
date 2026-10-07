/**
 * Trainee light-theme tokens from FitBud UX and Screen Architecture.
 * Dark theme is exploratory and not approved for implementation.
 */
export const colors = {
  deepNavy: "#1A1248",
  indigo: "#4527C6",
  coral: "#FF587D",
  softCoral: "#FFB0C3",
  paleLavender: "#EDEAFF",
  nearBlack: "#0F1115",
  darkGrey: "#25262B",
  midGrey: "#5B616B",
  lightGrey: "#E6E8EB",
  white: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  /** Approved light trainee canvas from the FitBud design. */
  background: "#F6F5FB",
  card: "#FFFFFF",
} as const;

export const radii = {
  card: 20,
  control: 16,
  pill: 999,
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

/** Practical mobile touch target minimum (pt). */
export const touchTargetMin = 44;
