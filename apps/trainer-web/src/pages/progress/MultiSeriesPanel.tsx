import type {
  ProgressMetricKey,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import { MetricLineChart, type ChartSeries } from "./MetricLineChart";
import {
  formatMetricDifference,
  formatMetricValue,
  formatPointDate,
  metricLabel,
  styleAt,
} from "./metricKeys";
import { ClipboardIcon } from "./WeightPanel";

type Props = {
  kind: "body" | "ratings";
  /** Keys in legend order: the focused key first. */
  keys: ProgressMetricKey[];
  series: Partial<Record<ProgressMetricKey, ProgressMetricSeries>>;
  clientFirstName: string;
};

function entriesText(count: number): string {
  return count === 1 ? "1 entry" : `${count} entries`;
}

function Legend({ rows }: { rows: ChartSeries[] }) {
  return (
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
          {row.label} · {row.style.name}
        </li>
      ))}
    </ul>
  );
}

/** Frames 160b (ratings on a 1 to 5 axis) and 160c (several measurements together). */
export function MultiSeriesPanel({
  kind,
  keys,
  series,
  clientFirstName,
}: Props) {
  const rows: ChartSeries[] = keys.map((key, index) => ({
    key,
    label: metricLabel(key),
    unit: series[key]?.unit ?? (kind === "ratings" ? null : "cm"),
    points: series[key]?.points ?? [],
    style: styleAt(index),
  }));
  const withData = rows.filter((row) => row.points.length > 0);
  const counts = new Set(rows.map((row) => row.points.length));
  const names = rows.map((row) => row.label.toLowerCase()).join(", ");

  const title = kind === "ratings" ? "Ratings, 1 to 5" : "Body measurements";
  const subtitle =
    kind === "ratings"
      ? `Standard rating questions (energy, sleep quality, stress, hunger) · ${clientFirstName}'s own answers · 1 very low, 5 very high · ratings, not hours or device data`
      : `Body measurements question · ${names} · ${
          counts.size === 1
            ? `${entriesText(rows[0]?.points.length ?? 0)} each`
            : `entries: ${rows.map((row) => `${row.label.toLowerCase()} ${row.points.length}`).join(", ")}`
        }`;

  const first = withData
    .flatMap((row) => row.points)
    .map((point) => point.localDate)
    .sort()[0];
  const last = withData
    .flatMap((row) => row.points)
    .map((point) => point.localDate)
    .sort()
    .at(-1);

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">{title}</h2>
          <p className="pg-subtitle">
            <ClipboardIcon />
            {subtitle}
          </p>
        </div>
      </div>

      {withData.length && first && last ? (
        <>
          <Legend rows={rows} />
          <MetricLineChart
            label={`${title}: ${rows.map((row) => row.label).join(", ")}, from ${formatPointDate(first)} to ${formatPointDate(last)}`}
            series={withData}
            fixedDomain={kind === "ratings" ? [1, 5] : undefined}
          />
          {kind === "ratings" ? (
            <dl className="pg-stats pg-stats-below">
              {rows.map((row) => {
                const latest = row.points.at(-1);
                return (
                  <div key={row.key}>
                    <dt>{row.label} · latest</dt>
                    <dd>
                      {latest ? (
                        <>
                          <span className="pg-stat-num">{latest.value}</span>{" "}
                          <span className="pg-stat-note">
                            of 5 · {formatPointDate(latest.localDate)}
                          </span>
                        </>
                      ) : (
                        <span className="pg-stat-note">
                          Not answered in this range
                        </span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          ) : (
            <table className="pg-table pg-change-table">
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Measurement</span>
                  </th>
                  <th scope="col">Start</th>
                  <th scope="col">Latest</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const start = row.points[0];
                  const end = row.points.at(-1);
                  return (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      <td className="pg-num">
                        {start ? (
                          <>
                            {formatMetricValue(start.value, row.unit)}
                            <span className="pg-cell-date">
                              {" "}
                              · {formatPointDate(start.localDate)}
                            </span>
                          </>
                        ) : (
                          "No entries"
                        )}
                      </td>
                      <td className="pg-num">
                        {end ? (
                          <>
                            {formatMetricValue(end.value, row.unit)}
                            <span className="pg-cell-date">
                              {" "}
                              · {formatPointDate(end.localDate)}
                            </span>
                          </>
                        ) : (
                          "No entries"
                        )}
                      </td>
                      <td className="pg-num">
                        {start && end && row.points.length > 1
                          ? formatMetricDifference(
                              end.value - start.value,
                              row.unit,
                            )
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <p className="pg-empty" role="status">
          {kind === "ratings"
            ? "No ratings answered in this range."
            : "No measurements entered in this range."}
        </p>
      )}
    </>
  );
}
