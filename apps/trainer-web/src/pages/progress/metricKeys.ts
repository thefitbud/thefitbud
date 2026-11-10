import type {
  ProgressMetricKey,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";

/**
 * Standard check-in question keys the Progress tab can chart (Z6-7), grouped the
 * way the rail shows them (frames 160, 160b, 160c).
 */
export const WEIGHT_KEYS = [
  "weight",
] as const satisfies readonly ProgressMetricKey[];
export const BODY_KEYS = [
  "waist",
  "hips",
  "chest",
  "arm",
  "thigh",
] as const satisfies readonly ProgressMetricKey[];
export const RATING_KEYS = [
  "energy",
  "sleep_quality",
  "stress",
  "hunger",
] as const satisfies readonly ProgressMetricKey[];

export const ALL_METRIC_KEYS: readonly ProgressMetricKey[] = [
  ...WEIGHT_KEYS,
  ...BODY_KEYS,
  ...RATING_KEYS,
];

export type MetricGroup = "weight" | "body" | "ratings";

export function groupOfKey(key: ProgressMetricKey): MetricGroup {
  if (key === "weight") return "weight";
  if ((RATING_KEYS as readonly string[]).includes(key)) return "ratings";
  return "body";
}

/**
 * Display names for the standard keys. `packages/core` has no label namespace for
 * check-in standard keys yet (follow-up), so the names live here, typed against the
 * contract enum so a new key fails the build until it has a name.
 */
export const METRIC_LABELS: Record<ProgressMetricKey, string> = {
  weight: "Weight",
  waist: "Waist",
  hips: "Hip",
  chest: "Chest",
  arm: "Arm",
  thigh: "Thigh",
  energy: "Energy",
  sleep_quality: "Sleep quality",
  stress: "Stress",
  hunger: "Hunger",
};

export function metricLabel(key: ProgressMetricKey): string {
  return METRIC_LABELS[key];
}

const NUMBER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** A value as entered, with its unit: "86.4 kg", "94 cm", "3 of 5". */
export function formatMetricValue(
  value: number,
  unit: ProgressMetricSeries["unit"],
): string {
  if (unit === null) return `${NUMBER.format(value)} of 5`;
  return `${NUMBER.format(value)} ${unit}`;
}

/** A signed difference between two entered values: "−2.7 kg", "+1 cm", "0 kg". */
export function formatMetricDifference(
  value: number,
  unit: ProgressMetricSeries["unit"],
): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const magnitude = NUMBER.format(Math.abs(rounded));
  return unit ? `${sign}${magnitude} ${unit}` : `${sign}${magnitude}`;
}

export function formatPointDate(localDate: string): string {
  return formatCivilDate(localDate);
}

/** Line styles in legend order: the focused series is always first and solid. */
export const SERIES_STYLES = [
  { name: "solid", color: "#4527C6", dash: undefined },
  { name: "dashed", color: "#0E7490", dash: "6 5" },
  { name: "dotted", color: "#B45309", dash: "2 4" },
  { name: "long dash", color: "#1A1248", dash: "12 5" },
  { name: "dash dot", color: "#7C6CF0", dash: "10 4 2 4" },
] as const;

export type SeriesStyle = (typeof SERIES_STYLES)[number];

export function styleAt(index: number): SeriesStyle {
  return SERIES_STYLES[index % SERIES_STYLES.length]!;
}
