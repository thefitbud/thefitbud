import type { MeasurementType } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatInstant,
  formatLocalDate,
  formatWeight,
  labelFor,
} from "@fitbud/core";

export const MEASUREMENT_SERIES: readonly MeasurementType[] = [
  "body_weight_kg",
  "waist_cm",
  "hip_cm",
  "chest_cm",
];

export type TrendPoint = {
  id: string;
  value: number;
  unit: string;
  observedAt: string;
  source?: string;
  checkinId?: string | null;
  localDate?: string;
};

export type TrendRange = "4w" | "12w" | "all";

export function measurementTypeLabel(type: string): string {
  return labelFor("measurement_type", type);
}

export function formatObservedAt(
  value: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
): string {
  return formatInstant(value, timeZone);
}

function byTime(points: TrendPoint[]): TrendPoint[] {
  return [...points].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt),
  );
}

function filterRange(
  points: TrendPoint[],
  range: TrendRange,
  today: string,
): TrendPoint[] {
  if (range === "all") return points;
  const days = range === "4w" ? 28 : 84;
  const from = addDaysToLocalDate(today, -days);
  return points.filter((point) => {
    const civil =
      point.localDate ?? formatLocalDate(new Date(point.observedAt), "UTC");
    return civil >= from;
  });
}

function changeSummary(
  points: TrendPoint[],
  label: string,
): string | null {
  if (points.length < 2) return null;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const delta = last.value - first.value;
  const unit = last.unit || first.unit;
  const magnitude =
    label.toLowerCase().includes("weight")
      ? formatWeight(Math.abs(delta), unit === "lb" ? "lb" : "kg")
      : `${Math.abs(delta).toFixed(1)} ${unit}`;
  const sign = delta < 0 ? "−" : delta > 0 ? "+" : "";
  const deltaText = `${sign}${magnitude}`;
  const since = formatCivilDate(
    first.localDate ??
      formatLocalDate(new Date(first.observedAt), "UTC"),
  );
  return `${deltaText} since ${since}`;
}

/** TrendChart — line with gap breaks, neutral change copy (TW-18). */
export function TrendChart({
  label,
  points,
  range,
  today,
  timeZone,
}: {
  label: string;
  points: TrendPoint[];
  range: TrendRange;
  today: string;
  timeZone: string;
}) {
  const sorted = byTime(filterRange(points, range, today));
  const first = sorted[0];
  if (!first) {
    return null;
  }
  if (sorted.length === 1) {
    return (
      <p className="trend-single" data-testid="trend-single">
        <strong>
          {first.value} {first.unit}
        </strong>
        <span className="muted">Add more weigh-ins to see a trend</span>
      </p>
    );
  }

  const width = 480;
  const height = 140;
  const padX = 16;
  const padY = 16;
  const values = sorted.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const last = sorted[sorted.length - 1] ?? first;

  const coords = sorted.map((point, index) => {
    const x =
      padX + (index / (sorted.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (point.value - min) / span) * (height - padY * 2);
    return { x, y, point, index };
  });

  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < coords.length; i++) {
    const coord = coords[i]!;
    const prev = coords[i - 1];
    if (
      prev &&
      coord.point.localDate &&
      prev.point.localDate &&
      daysBetween(prev.point.localDate, coord.point.localDate) > 10
    ) {
      if (current.length > 0) {
        segments.push(current.join(" "));
        current = [];
      }
    }
    current.push(
      `${current.length === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`,
    );
  }
  if (current.length > 0) segments.push(current.join(" "));

  const summary = changeSummary(sorted, label);

  return (
    <figure className="trend-chart" data-testid="trend-chart">
      <div className="trend-range-caption">
        <span>
          Start {first.value} {first.unit}
        </span>
        <span>
          Latest {last.value} {last.unit}
        </span>
        {summary ? <span>{summary}</span> : null}
      </div>
      <div className="trend-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label} trend`}
        >
          {segments.map((path, index) => (
            <path
              key={index}
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          ))}
          {coords.map((coord) => (
            <circle key={coord.point.id} cx={coord.x} cy={coord.y} r="4" />
          ))}
        </svg>
      </div>
      <figcaption className="trend-caption">
        <time dateTime={last.observedAt}>
          {formatObservedAt(last.observedAt, timeZone)}
        </time>
      </figcaption>
    </figure>
  );
}

function daysBetween(left: string, right: string): number {
  const start = Date.parse(`${left}T00:00:00Z`);
  const end = Date.parse(`${right}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

/** @deprecated use TrendChart — kept for overview compact sparkline */
export function MeasurementTrend({
  label,
  points,
  compact = false,
}: {
  label: string;
  points: TrendPoint[];
  compact?: boolean;
}) {
  const today = formatLocalDate(new Date(), "UTC");
  return (
    <TrendChart
      label={label}
      points={points}
      range="all"
      today={today}
      timeZone="UTC"
    />
  );
}
