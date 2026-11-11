import { useEffect, useRef, useState } from "react";
import {
  formatMetricValue,
  formatPointDate,
  type SeriesStyle,
} from "./metricKeys";

export type ChartPoint = { localDate: string; value: number };

export type ChartSeries = {
  key: string;
  label: string;
  /** "kg", "cm", "reps", or null for a 1 to 5 rating. */
  unit: string | null;
  points: ChartPoint[];
  style: SeriesStyle;
  /** Plots against the right-hand axis (compare, frame 160d). */
  axis?: "left" | "right";
};

export type AxisSpec = {
  /** Fixed value axis (ratings use 1 to 5); otherwise fitted to the values. */
  fixedDomain?: [number, number];
  /** Tick text: "88 kg", "4 of 5", "12 reps". */
  tickLabel?: (value: number) => string;
};

type Props = {
  series: ChartSeries[];
  /** Fixed value axis (ratings use 1 to 5); otherwise fitted to the values. */
  fixedDomain?: [number, number];
  /** Left-axis tick text; defaults to the value with the first series' unit. */
  tickLabel?: (value: number) => string;
  /** A second value axis on the right for series with `axis: "right"`. */
  rightAxis?: AxisSpec;
  /**
   * Breaks a line where two entries sit far apart (frames 160d, 160e). With a label,
   * the gap is named under the lines ("no check-in").
   */
  gaps?: { label?: string };
  /** Accessible name for the whole chart. */
  label: string;
  height?: number;
};

const PAD = { top: 12, right: 24, bottom: 34, left: 56 };
const PAD_RIGHT_AXIS = 60;

function dayNumber(localDate: string): number {
  const [y, m, d] = localDate.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1) / 86_400_000;
}

/** Steps that read well on a value axis: 0.5, 1, 2, 5, 10 … */
function niceStep(span: number, targetTicks: number): number {
  const raw = span / Math.max(1, targetTicks);
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 5, 10]) {
    if (factor * power >= raw) return factor * power;
  }
  return 10 * power;
}

export function valueTicks(
  values: number[],
  fixed?: [number, number],
): { min: number; max: number; ticks: number[] } {
  if (fixed) {
    const ticks: number[] = [];
    for (let value = fixed[0]; value <= fixed[1]; value += 1) ticks.push(value);
    return { min: fixed[0], max: fixed[1], ticks };
  }
  let low = Math.min(...values);
  let high = Math.max(...values);
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    low = 0;
    high = 1;
  }
  if (high - low < 1) {
    low -= 1;
    high += 1;
  }
  const step = niceStep(high - low, 4);
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) {
    ticks.push(Math.round(value * 100) / 100);
  }
  return { min, max, ticks };
}

/**
 * Axis dates: real point dates spread evenly in time, the first and the last always
 * kept, and none closer than `minGap` (in the same units as `position`).
 */
export function dateTicks(
  dates: string[],
  position: (localDate: string) => number,
  minGap = 90,
): string[] {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length <= 1) return sorted;
  const kept: string[] = [sorted[0]!];
  const last = sorted.at(-1)!;
  for (const date of sorted.slice(1, -1)) {
    if (
      position(date) - position(kept.at(-1)!) >= minGap &&
      position(last) - position(date) >= minGap
    ) {
      kept.push(date);
    }
  }
  if (position(last) - position(kept.at(-1)!) >= minGap || kept.length === 1) {
    kept.push(last);
  } else {
    kept[kept.length - 1] = last;
  }
  return kept;
}

/**
 * The spacing (in days) past which two entries count as a gap: twice the usual
 * spacing between entries, and never less than two weeks.
 */
export function gapThreshold(dates: string[]): number {
  const days = [...new Set(dates)].sort().map(dayNumber);
  const spacing = days.slice(1).map((day, index) => day - days[index]!);
  if (!spacing.length) return Infinity;
  const sorted = [...spacing].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return Math.max(14, median * 2);
}

/** Pairs of neighbouring dates further apart than `threshold` days. */
export function gapsIn(
  dates: string[],
  threshold: number,
): Array<[string, string]> {
  const sorted = [...new Set(dates)].sort();
  const out: Array<[string, string]> = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1]!;
    const after = sorted[index]!;
    if (dayNumber(after) - dayNumber(before) > threshold) out.push([before, after]);
  }
  return out;
}

export function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const next = Math.round(node.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function defaultTick(unit: string | null) {
  return (value: number) =>
    unit
      ? `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`
      : String(value);
}

export function MetricLineChart({
  series,
  fixedDomain,
  tickLabel,
  rightAxis,
  gaps,
  label,
  height = 300,
}: Props) {
  const { ref, width } = useWidth(760);
  const leftSeries = series.filter((row) => row.axis !== "right");
  const rightSeries = rightAxis
    ? series.filter((row) => row.axis === "right")
    : [];
  const allPoints = series.flatMap((row) => row.points);
  const unit = leftSeries[0]?.unit ?? null;
  const left = valueTicks(
    leftSeries.flatMap((row) => row.points).map((point) => point.value),
    fixedDomain,
  );
  const right = rightAxis
    ? valueTicks(
        rightSeries.flatMap((row) => row.points).map((point) => point.value),
        rightAxis.fixedDomain,
      )
    : null;
  const dates = allPoints.map((point) => point.localDate);
  const firstDay = dates.length ? Math.min(...dates.map(dayNumber)) : 0;
  const lastDay = dates.length ? Math.max(...dates.map(dayNumber)) : 1;
  const padRight = right ? PAD_RIGHT_AXIS : PAD.right;
  const innerW = Math.max(40, width - PAD.left - padRight);
  const innerH = height - PAD.top - PAD.bottom;

  const x = (localDate: string) => {
    if (lastDay === firstDay) return PAD.left + innerW / 2;
    return (
      PAD.left +
      ((dayNumber(localDate) - firstDay) / (lastDay - firstDay)) * innerW
    );
  };
  const xTicks = dateTicks(dates, x, Math.max(90, innerW / 6));
  const yOn =
    (scale: { min: number; max: number }) =>
    (value: number) =>
      PAD.top +
      innerH -
      ((value - scale.min) / (scale.max - scale.min || 1)) * innerH;
  const yLeft = yOn(left);
  const yRight = right ? yOn(right) : yLeft;
  const leftTick = tickLabel ?? defaultTick(unit);
  const rightTick =
    rightAxis?.tickLabel ?? defaultTick(rightSeries[0]?.unit ?? null);

  const threshold = gaps ? gapThreshold(dates) : Infinity;
  const namedGaps = gaps?.label ? gapsIn(dates, threshold) : [];

  return (
    <div className="pg-chart" ref={ref}>
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
      >
        <g className="pg-chart-grid" aria-hidden="true">
          {left.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left + 4}
                x2={PAD.left + innerW}
                y1={yLeft(tick)}
                y2={yLeft(tick)}
              />
              <text
                x={PAD.left - 8}
                y={yLeft(tick)}
                dy="0.32em"
                textAnchor="end"
              >
                {leftTick(tick)}
              </text>
            </g>
          ))}
          {right?.ticks.map((tick) => (
            <text
              key={`r${tick}`}
              className="pg-chart-right-tick"
              x={PAD.left + innerW + 10}
              y={yRight(tick)}
              dy="0.32em"
              textAnchor="start"
            >
              {rightTick(tick)}
            </text>
          ))}
          {xTicks.map((date, index) => (
            <text
              key={date}
              x={x(date)}
              y={height - 10}
              textAnchor={
                xTicks.length > 1 && index === 0
                  ? "start"
                  : xTicks.length > 1 && index === xTicks.length - 1
                    ? "end"
                    : "middle"
              }
            >
              {formatPointDate(date)}
            </text>
          ))}
          {namedGaps.map(([before, after]) => (
            <text
              key={`gap-${before}`}
              className="pg-chart-gap"
              x={(x(before) + x(after)) / 2}
              y={PAD.top + innerH - 6}
              textAnchor="middle"
            >
              {gaps?.label}
            </text>
          ))}
        </g>
        {series.map((row) => {
          const y = row.axis === "right" && right ? yRight : yLeft;
          const path = row.points
            .map((point, index) => {
              const previous = row.points[index - 1];
              const breaks =
                !previous ||
                dayNumber(point.localDate) - dayNumber(previous.localDate) >
                  threshold;
              return `${breaks ? "M" : "L"}${x(point.localDate)},${y(point.value)}`;
            })
            .join(" ");
          return (
            <g key={row.key} data-series={row.key}>
              {row.points.length > 1 ? (
                <path
                  d={path}
                  fill="none"
                  stroke={row.style.color}
                  strokeWidth={2}
                  strokeDasharray={row.style.dash}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {row.points.map((point) => (
                <circle
                  key={point.localDate}
                  cx={x(point.localDate)}
                  cy={y(point.value)}
                  r={4}
                  fill="#ffffff"
                  stroke={row.style.color}
                  strokeWidth={2}
                >
                  <title>
                    {`${row.label} · ${formatPointDate(point.localDate)} · ${formatMetricValue(point.value, row.unit)}`}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
