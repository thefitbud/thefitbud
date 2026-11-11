import type {
  ProgressMetricKey,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import { MetricLineChart, type ChartSeries } from "./MetricLineChart";
import {
  RATING_KEYS,
  formatMetricDifference,
  formatPointDate,
  metricLabel,
  styleAt,
} from "./metricKeys";
import { ClipboardIcon } from "./WeightPanel";

type Props = {
  /** Left axis: the metric selected in the rail. */
  primary: ProgressMetricKey;
  /** Right axis: the metric picked in "Compare with…". */
  secondary: ProgressMetricKey;
  series: Partial<Record<ProgressMetricKey, ProgressMetricSeries>>;
  onRemove: () => void;
};

/** A rating answer at or below this counts toward the "2 or lower" figure (frame 160d). */
const LOW_RATING = 2;

function isRating(key: ProgressMetricKey): boolean {
  return (RATING_KEYS as readonly string[]).includes(key);
}

function unitOf(key: ProgressMetricKey, row?: ProgressMetricSeries) {
  if (row) return row.unit;
  if (key === "weight") return "kg" as const;
  return isRating(key) ? null : ("cm" as const);
}

/** "kg", "cm" or "sleep quality rating": what one axis measures. */
function scaleWords(key: ProgressMetricKey, unit: string | null): string {
  return unit ?? `${metricLabel(key).toLowerCase()} rating`;
}

function XIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Frame 160d: two metrics side by side on two labelled scales. */
export function ComparePanel({ primary, secondary, series, onRemove }: Props) {
  const rows: ChartSeries[] = [primary, secondary].map((key, index) => ({
    key,
    label: metricLabel(key),
    unit: unitOf(key, series[key]),
    points: series[key]?.points ?? [],
    style: styleAt(index),
    axis: index === 0 ? "left" : "right",
  }));
  const [left, right] = rows as [ChartSeries, ChartSeries];
  const primaryName = metricLabel(primary);
  const secondaryName = metricLabel(secondary);
  const axisText = (row: ChartSeries) =>
    row.unit ? `(${row.unit})` : "(1 to 5)";
  const ratingTick = (value: number) => `${value} of 5`;
  const dates = rows.flatMap((row) => row.points.map((point) => point.localDate)).sort();

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">
            {primaryName} compared with {secondaryName}
          </h2>
          <p className="pg-subtitle">
            <ClipboardIcon />
            Two scales: {scaleWords(primary, left.unit)} on the left,{" "}
            {scaleWords(secondary, right.unit)} on the right. Shown side by side
            only; FitBud doesn't link cause and effect.
          </p>
        </div>
        <button type="button" className="pg-outline-btn" onClick={onRemove}>
          <XIcon />
          Remove {secondaryName}
        </button>
      </div>

      <ul className="pg-legend" aria-label="Chart key">
        {rows.map((row) => (
          <li key={row.key}>
            <svg width="18" height="6" aria-hidden="true">
              <line
                x1="1"
                x2="17"
                y1="3"
                y2="3"
                stroke={row.style.color}
                strokeWidth="3"
                strokeDasharray={row.style.dash}
                strokeLinecap="round"
              />
            </svg>
            {row.label} {axisText(row)} · {row.style.name}
          </li>
        ))}
      </ul>

      {dates.length ? (
        <MetricLineChart
          label={`${primaryName} ${axisText(left)} on the left scale and ${secondaryName} ${axisText(right)} on the right scale, from ${formatPointDate(dates[0]!)} to ${formatPointDate(dates.at(-1)!)}`}
          series={rows.filter((row) => row.points.length > 0)}
          fixedDomain={left.unit === null ? [1, 5] : undefined}
          tickLabel={left.unit === null ? ratingTick : undefined}
          rightAxis={{
            fixedDomain: right.unit === null ? [1, 5] : undefined,
            tickLabel: right.unit === null ? ratingTick : undefined,
          }}
          gaps={{ label: "no check-in" }}
        />
      ) : (
        <p className="pg-empty" role="status">
          Neither question was answered in this range.
        </p>
      )}

      <dl className="pg-stats pg-stats-below">
        {rows.map((row) => {
          const start = row.points[0];
          const end = row.points.at(-1);
          if (row.unit === null) {
            const low = row.points.filter((point) => point.value <= LOW_RATING).length;
            return (
              <div key={row.key}>
                <dt>
                  Check-ins with {row.label.toLowerCase()} {LOW_RATING} or lower
                </dt>
                <dd>
                  <span className="pg-stat-num">{low}</span>{" "}
                  <span className="pg-stat-note">of {row.points.length} answered</span>
                </dd>
              </div>
            );
          }
          return (
            <div key={row.key}>
              <dt>{row.label} change</dt>
              <dd>
                {start && end && row.points.length > 1 ? (
                  <>
                    <span className="pg-stat-num">
                      {formatMetricDifference(end.value - start.value, row.unit)}
                    </span>{" "}
                    <span className="pg-stat-note">
                      since {formatPointDate(start.localDate)}
                    </span>
                  </>
                ) : (
                  <span className="pg-stat-note">
                    {row.points.length === 1
                      ? "One entry in this range"
                      : "No entries in this range"}
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </>
  );
}
