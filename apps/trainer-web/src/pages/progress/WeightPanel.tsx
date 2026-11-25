import { useState, type ReactNode } from "react";
import type {
  ProgressMetricPoint,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import { ChartLine } from "lucide-react";
import { MetricLineChart } from "./MetricLineChart";
import {
  KpiRow,
  kpiDifference,
  kpiValue,
  weeksBetween,
  workoutsKpi,
  type Kpi,
  type WorkoutsKpi,
} from "./KpiRow";
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
  /** Sparse only: where the date axis runs to (range end or next check-in, frame 160g). */
  sparseAxisEnd?: string | null;
  /** Finished and planned workouts in the range, from the logs; the KPI is left out when null. */
  workouts?: WorkoutsKpi | null;
};

const LATEST_ROWS = 3;
/** Fewer weigh-ins than this read as points, not a trend (frame 160g). */
export const SPARSE_BELOW = 3;

function countLabel(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/** Frame W-160: weight as a line, with the KPI row, and the latest entries in their own card. */
export function WeightPanel({
  series,
  renderSource,
  allTimeEntries,
  ended = false,
  coachedPeriod = null,
  sparseAxisEnd = null,
  workouts = null,
}: Props) {
  const [showTable, setShowTable] = useState(false);
  const points = series?.points ?? [];
  const unit = series?.unit ?? "kg";
  const first = points[0];
  const last = points.at(-1);
  const rows = [...points]
    .map((point, index) => ({ point, previous: points[index - 1] }))
    .reverse();
  const visibleRows = showTable ? rows : rows.slice(0, LATEST_ROWS);
  const entries = countLabel(points.length, "entry", "entries");
  const sparse = !ended && allTimeEntries > 0 && allTimeEntries < SPARSE_BELOW;
  const fromCheckins = points.filter((point) => point.checkinId).length;
  const entered = points.length - fromCheckins;

  let subtitle = `Standard question in check-ins · ${entries}`;
  if (ended) {
    subtitle = coachedPeriod
      ? `Coached period ${coachedPeriod} · ${entries}`
      : `Coaching ended · ${entries}`;
  } else if (sparse && points.length) {
    subtitle = [
      fromCheckins ? countLabel(fromCheckins, "from a check-in", "from check-ins") : null,
      entered ? countLabel(entered, "measurement entry", "measurement entries") : null,
    ]
      .filter(Boolean)
      .join(", ");
  }

  const kpis: Kpi[] = [];
  if (first && last) {
    const span = points.length > 1 && !sparse;
    if (ended || sparse) {
      kpis.push({
        key: "start",
        label: ended ? "Start" : `Start · ${formatPointDate(first.localDate)}`,
        ...kpiValue(first.value, unit),
      });
    }
    kpis.push({
      key: "latest",
      label: `${ended ? "Last" : "Latest"} · ${formatPointDate(last.localDate)}`,
      ...kpiValue(last.value, unit),
    });
    if (span) {
      kpis.push({
        key: "change",
        label: ended ? "Change" : `Since ${formatPointDate(first.localDate)}`,
        ...kpiDifference(last.value - first.value, unit),
      });
      const weeks = weeksBetween(first.localDate, last.localDate);
      if (weeks && !ended) {
        kpis.push({
          key: "average",
          label: "Average change",
          ...kpiDifference((last.value - first.value) / weeks, unit, true),
        });
      }
    }
    const done = ended ? null : workoutsKpi(workouts, "Workouts done");
    if (done) kpis.push(done);
  }

  return (
    <>
      <div className="workspace-card pg-card">
        <div className="pg-panel-head">
          <div>
            <h2 id="pg-panel-title">Weight</h2>
            <p className="pg-subtitle">{subtitle}</p>
          </div>
        </div>

        {first && last ? (
          <>
            <KpiRow items={kpis} />

            <MetricLineChart
              label={`Weight, ${entries} from ${formatPointDate(first.localDate)} to ${formatPointDate(last.localDate)}`}
              xEnd={sparse ? sparseAxisEnd : null}
              area
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
          </>
        ) : (
          <p className="pg-empty" role="status">
            No weight entries in this range.
          </p>
        )}
      </div>

      {/* Sparse: both entries are in the KPIs. Ended: the chart is the record (frame 160h). */}
      {first && last && !sparse && !ended ? (
        <div className="workspace-card pg-card">
          <div className="pg-card-head">
            <h3 id="pg-weight-table-heading">
              {showTable ? "All entries in this range" : "Latest entries"}
            </h3>
            {points.length > LATEST_ROWS ? (
              <button
                type="button"
                className="pg-text-btn"
                aria-expanded={showTable}
                aria-controls="pg-weight-table"
                onClick={() => setShowTable((current) => !current)}
              >
                {showTable ? "Show latest only" : "View all"}
              </button>
            ) : null}
          </div>
          <table
            className="pg-table"
            id="pg-weight-table"
            aria-labelledby="pg-weight-table-heading"
          >
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="is-r">
                  Weight
                </th>
                <th scope="col" className="is-r">
                  Change
                </th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ point, previous }) => (
                <tr key={point.localDate}>
                  <td>{formatPointDate(point.localDate)}</td>
                  <td className="pg-num is-r pg-strong">
                    {formatMetricValue(point.value, unit)}
                  </td>
                  <td className="pg-num is-r">
                    {previous
                      ? formatMetricDifference(point.value - previous.value, unit)
                      : "—"}
                  </td>
                  <td>{renderSource(point)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
