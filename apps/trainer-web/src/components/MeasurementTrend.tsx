import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatLocalDate,
  formatNumber,
} from "@fitbud/core";

export type TrendPoint = {
  id: string;
  value: number;
  unit: string;
  observedAt: string;
  localDate?: string;
};

type Range = "6w" | "3m";

const RANGE_DAYS: Record<Range, number> = { "6w": 42, "3m": 90 };
const RANGE_LABEL: Record<Range, string> = { "6w": "6 wk", "3m": "3 mo" };
const PLOT_W = 300;
const PLOT_H = 120;

function civil(point: TrendPoint): string {
  return point.localDate ?? formatLocalDate(new Date(point.observedAt), "UTC");
}

function byTime(points: TrendPoint[]): TrendPoint[] {
  return [...points].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Whole-kilogram value axis with four labels so the scale reads cleanly. */
function axis(values: number[]): { min: number; max: number; ticks: number[] } {
  const lo = Math.floor(Math.min(...values));
  const hi = Math.ceil(Math.max(...values));
  const step = Math.max(1, Math.ceil((hi - lo) / 3));
  const ticks: number[] = [];
  for (let i = 0; i <= 3; i += 1) ticks.push(lo + step * i);
  return { min: lo, max: lo + step * 3, ticks };
}

/**
 * Weight card on the client Overview (frame W-03): latest value, the change
 * over the shown range, a line chart with value and date labels, and the date
 * of the last weigh-in. Change copy is neutral (no good or bad colouring). A
 * plan carries no numeric goal weight, so no goal line is drawn.
 */
export function WeightCard({
  points,
  progressHref,
}: {
  points: TrendPoint[];
  progressHref: string;
}) {
  const [range, setRange] = useState<Range>("6w");
  const all = byTime(points);
  const last = all[all.length - 1];
  const from = last ? addDaysToLocalDate(civil(last), -RANGE_DAYS[range]) : "";
  const shown = all.filter((p) => civil(p) >= from);
  const first = shown[0];

  return (
    <section className="ov-card ov-weight" data-testid="ov-weight">
      <div className="ov-weight-h">
        <h3>Weight</h3>
        {last ? (
          <div className="ov-range" role="group" aria-label="Range">
            {(Object.keys(RANGE_LABEL) as Range[]).map((key) => (
              <button
                key={key}
                type="button"
                className="ov-range-btn"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
              >
                {RANGE_LABEL[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!last ? (
        <p className="muted ov-pad">No weigh-ins yet</p>
      ) : (
        <>
          <div className="ov-weight-v">
            <b>{formatNumber(round1(last.value))}</b>
            <span>kg</span>
            {first && shown.length >= 2 ? (
              <DeltaLine first={first} last={last} />
            ) : null}
          </div>
          {shown.length >= 2 ? (
            <Chart points={shown} />
          ) : (
            <p className="muted ov-pad" data-testid="trend-single">
              Add more weigh-ins to see a trend
            </p>
          )}
          <div className="ov-weight-f">
            <span>Last weigh-in {formatCivilDate(civil(last))}</span>
            <Link className="text-link" to={progressHref}>
              Progress
              <ChevronRight size={14} strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function DeltaLine({ first, last }: { first: TrendPoint; last: TrendPoint }) {
  const delta = round1(last.value - first.value);
  const sign = delta < 0 ? "−" : delta > 0 ? "+" : "";
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="ov-weight-d">
      {delta !== 0 ? <Icon size={16} strokeWidth={1.75} aria-hidden /> : null}
      <b>
        {sign}
        {formatNumber(Math.abs(delta))} kg
      </b>{" "}
      since {formatCivilDate(civil(first))}
    </span>
  );
}

function Chart({ points }: { points: TrendPoint[] }) {
  const { min, max, ticks } = axis(points.map((p) => p.value));
  const span = max - min || 1;
  const t0 = Date.parse(`${civil(points[0]!)}T00:00:00Z`);
  const t1 = Date.parse(`${civil(points[points.length - 1]!)}T00:00:00Z`);
  const tSpan = t1 - t0 || 1;
  const coords = points.map((p) => ({
    x: ((Date.parse(`${civil(p)}T00:00:00Z`) - t0) / tSpan) * PLOT_W,
    y: (1 - (p.value - min) / span) * PLOT_H,
  }));
  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${PLOT_W} ${PLOT_H} L0 ${PLOT_H} Z`;
  const end = coords[coords.length - 1]!;
  const midDate = formatCivilDate(
    formatLocalDate(new Date((t0 + t1) / 2), "UTC"),
  );
  return (
    <figure className="ov-chart" data-testid="trend-chart">
      <div className="ov-chart-y" aria-hidden="true">
        {[...ticks].reverse().map((v) => (
          <span key={v}>{v}</span>
        ))}
      </div>
      <div className="ov-chart-plot">
        <svg
          viewBox={`0 0 ${PLOT_W} ${PLOT_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Weight trend"
        >
          {ticks.map((v) => (
            <line
              key={v}
              className="ov-chart-grid"
              x1="0"
              x2={PLOT_W}
              y1={(1 - (v - min) / span) * PLOT_H}
              y2={(1 - (v - min) / span) * PLOT_H}
            />
          ))}
          <path className="ov-chart-area" d={area} />
          <path className="ov-chart-line" d={line} />
        </svg>
        <i
          className="ov-chart-dot"
          style={{
            left: `${(end.x / PLOT_W) * 100}%`,
            top: `${(end.y / PLOT_H) * 100}%`,
          }}
        />
      </div>
      <figcaption className="ov-chart-x">
        <span>{formatCivilDate(civil(points[0]!))}</span>
        <span>{midDate}</span>
        <span>{formatCivilDate(civil(points[points.length - 1]!))}</span>
      </figcaption>
    </figure>
  );
}
