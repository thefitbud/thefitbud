import { useState, type ReactNode } from "react";
import type {
  ProgressMetricPoint,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import { ChartLine } from "lucide-react";
import { MetricLineChart } from "./MetricLineChart";
import {
  formatMetricDifference,
  formatMetricValue,
  formatPointDate,
  styleAt,
} from "./metricKeys";

type Props = {
  series: ProgressMetricSeries | undefined;
  /** The Source cell: a link to the check-in the value came from (owned by the page). */
  renderSource: (point: ProgressMetricPoint) => ReactNode;
  /** Weigh-ins the client has in all, any range. Under three, the panel says so instead of a change (frame 160g). */
  allTimeEntries: number;
  /** Ended coaching (frame 160h): read as the coached period, with the last entry. */
  ended?: boolean;
  /** The coached period, e.g. "Mon 6 Jul — Sat 3 Oct", when both dates are known. */
  coachedPeriod?: string | null;
};

const LATEST_ROWS = 3;
/** Fewer weigh-ins than this read as points, not a trend (frame 160g). */
export const SPARSE_BELOW = 3;

function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function ClipboardIcon() {
  return (
    <svg
      className="pg-subtitle-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      width="14"
      height="14"
    >
      <rect
        x="3"
        y="2.5"
        width="10"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="5.5"
        y="1.5"
        width="5"
        height="2.5"
        rx="1"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5.5 9l1.8 1.8L10.5 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Frame 160: weight as a line, with start, latest, change and entries. */
export function WeightPanel({
  series,
  renderSource,
  allTimeEntries,
  ended = false,
  coachedPeriod = null,
}: Props) {
  const [showTable, setShowTable] = useState(false);
  const points = series?.points ?? [];
  const unit = series?.unit ?? "kg";
  const first = points[0];
  const last = points.at(-1);
  const rows = [...points].reverse();
  const visibleRows = showTable ? rows : rows.slice(0, LATEST_ROWS);
  const entries = countLabel(points.length, "entry", "entries");
  const sparse = !ended && allTimeEntries > 0 && allTimeEntries < SPARSE_BELOW;
  const fromCheckins = points.filter((point) => point.checkinId).length;
  const entered = points.length - fromCheckins;

  let subtitle = `Weight · standard question in check-ins · ${entries}`;
  if (ended) {
    subtitle = coachedPeriod
      ? `Coached period ${coachedPeriod} · ${entries}`
      : `Coaching ended · ${entries}`;
  }
  else if (sparse && points.length) {
    subtitle = [
      fromCheckins ? countLabel(fromCheckins, "from a check-in", "from check-ins") : null,
      entered ? countLabel(entered, "measurement entry", "measurement entries") : null,
    ]
      .filter(Boolean)
      .join(", ");
  }

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">Weight</h2>
          <p className="pg-subtitle">
            <ClipboardIcon />
            {subtitle}
          </p>
        </div>
        {points.length && !sparse && !ended ? (
          <button
            type="button"
            className="pg-outline-btn"
            aria-expanded={showTable}
            aria-controls="pg-weight-table"
            onClick={() => setShowTable((current) => !current)}
          >
            <span
              aria-hidden="true"
              className={showTable ? "pg-chevron is-up" : "pg-chevron"}
            />
            {showTable ? "Hide data table" : "Show data table"}
          </button>
        ) : null}
      </div>

      {first && last ? (
        <>
          <dl className="pg-stats">
            <div>
              <dt>
                {ended ? "Start" : `Start · ${formatPointDate(first.localDate)}`}
              </dt>
              <dd className="pg-stat-num">
                {formatMetricValue(first.value, unit)}
              </dd>
            </div>
            <div>
              <dt>
                {ended ? "Last" : "Latest"} · {formatPointDate(last.localDate)}
              </dt>
              <dd className="pg-stat-num">
                {formatMetricValue(last.value, unit)}
              </dd>
            </div>
            {points.length > 1 && !sparse ? (
              <div>
                <dt>Change</dt>
                <dd>
                  <span className="pg-stat-num">
                    {formatMetricDifference(last.value - first.value, unit)}
                  </span>
                  {ended ? null : (
                    <>
                      {" "}
                      <span className="pg-stat-note">
                        since {formatPointDate(first.localDate)}
                      </span>
                    </>
                  )}
                </dd>
              </div>
            ) : null}
            {ended ? null : (
              <div>
                <dt>Entries</dt>
                <dd className="pg-stat-num">{points.length}</dd>
              </div>
            )}
          </dl>

          <MetricLineChart
            label={`Weight, ${entries} from ${formatPointDate(first.localDate)} to ${formatPointDate(last.localDate)}`}
            series={[
              {
                key: "weight",
                label: "Weight",
                unit,
                points,
                style: styleAt(0),
              },
            ]}
          />

          {sparse ? (
            <div className="pg-banner pg-banner-row" role="note">
              <ChartLine size={16} strokeWidth={1.6} aria-hidden />
              <p>
                {allTimeEntries === 1 ? "One weigh-in" : "Two weigh-ins"} so
                far. The trend line gets useful after a few more check-ins.
              </p>
            </div>
          ) : null}

          {sparse ? null : (
            <>
              <p className="pg-table-heading" id="pg-weight-table-heading">
                {showTable ? "All entries in this range" : "Latest entries"}
              </p>
              <table
                className="pg-table"
                id="pg-weight-table"
                aria-labelledby="pg-weight-table-heading"
              >
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Weight</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((point) => (
                    <tr key={point.localDate}>
                      <td>{formatPointDate(point.localDate)}</td>
                      <td className="pg-num">
                        {formatMetricValue(point.value, unit)}
                      </td>
                      <td>{renderSource(point)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <p className="pg-empty" role="status">
          No weight entries in this range.
        </p>
      )}
    </>
  );
}
