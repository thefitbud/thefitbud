import type { MeasurementType } from "@fitbud/contracts";
import { formatInstant } from "@fitbud/core";
import { labelFor } from "@fitbud/core";

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
};

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

export function MeasurementTrend({
  label,
  points,
  compact = false,
}: {
  label: string;
  points: TrendPoint[];
  compact?: boolean;
}) {
  const sorted = byTime(points);
  const first = sorted[0];
  if (!first) {
    return <p className="workspace-empty">No stored {label.toLowerCase()} measurements.</p>;
  }
  if (sorted.length === 1) {
    return (
      <p className="trend-single">
        <strong>
          {first.value} {first.unit}
        </strong>
        <time dateTime={first.observedAt}>{formatObservedAt(first.observedAt)}</time>
      </p>
    );
  }

  const width = 320;
  const height = compact ? 72 : 120;
  const padX = 8;
  const padY = 12;
  const values = sorted.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const last = sorted[sorted.length - 1] ?? first;
  const coords = sorted.map((point, index) => {
    const x =
      padX + (index / (sorted.length - 1)) * (width - padX * 2);
    const y = padY + (1 - (point.value - min) / span) * (height - padY * 2);
    return { x, y, point };
  });
  const path = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"}${coord.x.toFixed(1)} ${coord.y.toFixed(1)}`)
    .join(" ");

  return (
    <figure className={compact ? "trend-chart is-compact" : "trend-chart"}>
      <div className="trend-plot">
        <div className="trend-scale" aria-hidden="true">
          <span>
            {max} {last.unit}
          </span>
          <span>
            {min} {last.unit}
          </span>
        </div>
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {coords.map((coord) => (
            <circle key={coord.point.id} cx={coord.x} cy={coord.y} r="3.5" />
          ))}
        </svg>
      </div>
      <figcaption className="trend-caption">
        {last.value} {last.unit}
        <time dateTime={last.observedAt}> {formatObservedAt(last.observedAt)}</time>
        <span className="muted">
          {" "}
          · from {first.value} {first.unit}
        </span>
      </figcaption>
      <details className="trend-values">
        <summary>
          {sorted.length} stored {label.toLowerCase()} values
        </summary>
        <ol>
          {sorted.map((point) => (
            <li key={point.id}>
              {point.value} {point.unit}
              <time dateTime={point.observedAt}> {formatObservedAt(point.observedAt)}</time>
            </li>
          ))}
        </ol>
      </details>
    </figure>
  );
}
