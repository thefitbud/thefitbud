import { Link } from "react-router-dom";
import type {
  ProgressMetricKey,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import {
  BODY_KEYS,
  RATING_KEYS,
  formatMetricValue,
  metricLabel,
  type MetricGroup,
} from "./metricKeys";

export type RailView = { group: MetricGroup; focus: ProgressMetricKey };

/** The two "Workouts · from logs" rows (frame 160e). */
export type WorkoutsRow = "completed" | "exercises";

export type WorkoutsSummary = {
  /** Finished workouts since start. */
  completed: number;
  /** Planned workouts since start. */
  planned: number;
  /** Lifts with charted sets. */
  lifts: number;
};

type Props = {
  /** All-time series per key: the rail shows each key's latest entered value. */
  series: Partial<Record<ProgressMetricKey, ProgressMetricSeries>>;
  view: RailView;
  checked: Record<"body" | "ratings", ProgressMetricKey[]>;
  /** The metric on the right-hand scale (frame 160d), shown in the compare colour. */
  compare: ProgressMetricKey | null;
  /** Shown when the client has planned or logged workouts. */
  workouts: WorkoutsSummary | null;
  /** The selected workouts row; when set, no metric row is selected. */
  workoutsRow: WorkoutsRow | null;
  photoDates: number;
  relationshipId: string;
  onSelect: (group: MetricGroup, key: ProgressMetricKey) => void;
  onToggle: (group: "body" | "ratings", key: ProgressMetricKey) => void;
  onWorkouts: (row: WorkoutsRow) => void;
};

function latestValue(row: ProgressMetricSeries | undefined): string {
  const last = row?.points.at(-1);
  return last ? formatMetricValue(last.value, row!.unit) : "No entries";
}

export function hasPoints(row: ProgressMetricSeries | undefined): boolean {
  return (row?.points.length ?? 0) > 0;
}

/**
 * Left rail of frames 160 to 160e. Each group is its own tab list holding only tabs;
 * the "show on the chart" checkboxes sit in a separate group beside it, so no
 * checkbox is inside a tab list (ARIA: a tablist owns tabs only).
 */
export function MetricRail({
  series,
  view,
  checked,
  compare,
  workouts,
  workoutsRow,
  photoDates,
  relationshipId,
  onSelect,
  onToggle,
  onWorkouts,
}: Props) {
  const bodyKeys = BODY_KEYS.filter((key) => hasPoints(series[key]));
  const ratingKeys = RATING_KEYS.filter((key) => hasPoints(series[key]));

  const isSelected = (group: MetricGroup, key: ProgressMetricKey) =>
    workoutsRow === null && view.group === group && view.focus === key;

  function rowClass(base: string, selected: boolean, compared: boolean) {
    return `${base}${selected ? " is-selected" : ""}${compared ? " is-compared" : ""}`;
  }

  function group(
    id: string,
    heading: string,
    groupName: MetricGroup,
    keys: readonly ProgressMetricKey[],
  ) {
    const showChecks =
      groupName !== "weight" &&
      workoutsRow === null &&
      compare === null &&
      view.group === groupName;
    const ticked = groupName === "weight" ? [] : checked[groupName];
    return (
      <div className="pg-rail-group">
        <p className="pg-rail-heading" id={id}>
          {heading}
        </p>
        <div className={showChecks ? "pg-rail-grid has-checks" : "pg-rail-grid"}>
          {showChecks ? (
            <div
              className="pg-rail-checks"
              role="group"
              aria-label={`${heading}: lines on the chart`}
            >
              {keys.map((key) => {
                const isChecked = ticked.includes(key);
                return (
                  <label
                    key={key}
                    className={rowClass(
                      "pg-rail-checkwrap",
                      isSelected(groupName, key),
                      false,
                    )}
                  >
                    <input
                      type="checkbox"
                      className="pg-rail-check"
                      checked={isChecked}
                      disabled={isChecked && ticked.length === 1}
                      aria-label={`Show ${metricLabel(key)} on the chart`}
                      onChange={() =>
                        onToggle(groupName as "body" | "ratings", key)
                      }
                    />
                  </label>
                );
              })}
            </div>
          ) : null}
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby={id}
            className="pg-rail-tabs"
          >
            {keys.map((key) => {
              const selected = isSelected(groupName, key);
              const compared = compare === key && workoutsRow === null;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="pg-panel"
                  className={rowClass("pg-rail-tab", selected, compared)}
                  onClick={() => onSelect(groupName, key)}
                >
                  <span className="pg-rail-label">
                    {metricLabel(key)}
                    {compared ? (
                      <span className="sr-only"> (compared)</span>
                    ) : null}
                  </span>
                  <span className="pg-rail-value">
                    {latestValue(series[key])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside className="pg-rail workspace-card" aria-label="Metrics">
      {group("pg-rail-weight", "Weight · standard question", "weight", ["weight"])}
      {bodyKeys.length
        ? group("pg-rail-body", "Body measurements · picked in form", "body", bodyKeys)
        : null}
      {ratingKeys.length
        ? group("pg-rail-ratings", "Ratings 1 to 5 · standard", "ratings", ratingKeys)
        : null}
      {workouts ? (
        <div className="pg-rail-group">
          <p className="pg-rail-heading" id="pg-rail-workouts">
            Workouts · from logs
          </p>
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby="pg-rail-workouts"
            className="pg-rail-tabs"
          >
            {(
              [
                [
                  "completed",
                  "Workouts completed",
                  `${workouts.completed} of ${workouts.planned}`,
                ],
                [
                  "exercises",
                  "Exercise progress",
                  workouts.lifts === 1 ? "1 lift" : `${workouts.lifts} lifts`,
                ],
              ] as const
            ).map(([row, label, value]) => (
              <button
                key={row}
                type="button"
                role="tab"
                aria-selected={workoutsRow === row}
                aria-controls="pg-panel"
                className={rowClass("pg-rail-tab", workoutsRow === row, false)}
                onClick={() => onWorkouts(row)}
              >
                <span className="pg-rail-label">{label}</span>
                <span className="pg-rail-value">{value}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="pg-rail-heading">Photos · standard question</p>
      <a className="pg-rail-link-row" href="#progress-photos">
        <span>Progress photos</span>
        <span className="pg-rail-value">
          {photoDates === 0
            ? "None yet"
            : photoDates === 1
              ? "1 date"
              : `${photoDates} dates`}
        </span>
      </a>
      <div className="pg-rail-foot">
        <p className="pg-rail-heading">Your own questions · not charted</p>
        <Link to={`/clients/${relationshipId}/check-ins`}>
          See answers in Check-ins
        </Link>
      </div>
    </aside>
  );
}
