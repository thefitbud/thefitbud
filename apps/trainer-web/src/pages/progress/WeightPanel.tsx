import { useState, type ReactNode } from "react";
import type {
  ProgressMetricPoint,
  ProgressMetricSeries,
} from "@fitbud/contracts";
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
};

const LATEST_ROWS = 3;

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
export function WeightPanel({ series, renderSource }: Props) {
  const [showTable, setShowTable] = useState(false);
  const points = series?.points ?? [];
  const unit = series?.unit ?? "kg";
  const first = points[0];
  const last = points.at(-1);
  const rows = [...points].reverse();
  const visibleRows = showTable ? rows : rows.slice(0, LATEST_ROWS);
  const entries = points.length === 1 ? "1 entry" : `${points.length} entries`;

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">Weight</h2>
          <p className="pg-subtitle">
            <ClipboardIcon />
            Weight · standard question in check-ins · {entries}
          </p>
        </div>
        {points.length ? (
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
              <dt>Start · {formatPointDate(first.localDate)}</dt>
              <dd className="pg-stat-num">
                {formatMetricValue(first.value, unit)}
              </dd>
            </div>
            <div>
              <dt>Latest · {formatPointDate(last.localDate)}</dt>
              <dd className="pg-stat-num">
                {formatMetricValue(last.value, unit)}
              </dd>
            </div>
            {points.length > 1 ? (
              <div>
                <dt>Change</dt>
                <dd>
                  <span className="pg-stat-num">
                    {formatMetricDifference(last.value - first.value, unit)}
                  </span>{" "}
                  <span className="pg-stat-note">
                    since {formatPointDate(first.localDate)}
                  </span>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Entries</dt>
              <dd className="pg-stat-num">{points.length}</dd>
            </div>
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
      ) : (
        <p className="pg-empty" role="status">
          No weight entries in this range.
        </p>
      )}
    </>
  );
}
