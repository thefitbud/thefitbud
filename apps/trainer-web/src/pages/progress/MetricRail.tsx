import { Link } from "react-router-dom";
import type {
  ProgressMetricKey,
  ProgressMetricSeries,
} from "@fitbud/contracts";
import {
  BODY_KEYS,
  RATING_KEYS,
  WEIGHT_KEYS,
  formatMetricDifference,
  formatMetricValue,
  metricLabel,
  type MetricGroup,
} from "./metricKeys";

export type RailView = { group: MetricGroup; focus: ProgressMetricKey };

/** The two "Training" rows, from the workout logs (frame 160e). */
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
  /** Lists the two workouts rows as "No entries" when there is no summary (frame 161). */
  showEmptyWorkouts: boolean;
  /** Keys the client's check-in form asks: listed as "No entries" until answered (frames 160g, 161). */
  formKeys: readonly ProgressMetricKey[];
  photoDates: number;
  /** The photos view (frame 160f) is open; no other row is selected. */
  photosOpen: boolean;
  relationshipId: string;
  onSelect: (group: MetricGroup, key: ProgressMetricKey) => void;
  onToggle: (group: "body" | "ratings", key: ProgressMetricKey) => void;
  onWorkouts: (row: WorkoutsRow) => void;
  onPhotos: () => void;
};

const NO_ENTRIES = "No entries";

function latestValue(
  key: ProgressMetricKey,
  row: ProgressMetricSeries | undefined,
): string {
  const last = row?.points.at(-1);
  if (!last) return NO_ENTRIES;
  // One body measurement is a single reading, not a latest value (frame 160g).
  if (row!.points.length === 1 && row!.unit === "cm" && key !== "weight") {
    return "1 entry";
  }
  return formatMetricValue(last.value, row!.unit);
}

/**
 * The change under a rail value: a measurement against the first entry, a 1 to 5 rating
 * against the entry before it. Nothing when there is one entry or no change to show.
 */
function changeText(row: ProgressMetricSeries | undefined): string | null {
  const points = row?.points ?? [];
  if (points.length < 2) return null;
  const last = points.at(-1)!;
  const base = row!.unit === null ? points.at(-2)! : points[0]!;
  return formatMetricDifference(last.value - base.value, row!.unit);
}

export function hasPoints(row: ProgressMetricSeries | undefined): boolean {
  return (row?.points.length ?? 0) > 0;
}

type RailEntry = { group: MetricGroup; key: ProgressMetricKey };

/**
 * Left rail of frames 160 to 160i. Groups (Body, Training, Check-in answers, Photos) are
 * tab lists holding only tabs; the "show on the chart" checkboxes sit in a separate group
 * beside the list, so no checkbox is inside a tab list (ARIA: a tablist owns tabs only).
 */
export function MetricRail({
  series,
  view,
  checked,
  compare,
  workouts,
  workoutsRow,
  showEmptyWorkouts,
  formKeys,
  photoDates,
  photosOpen,
  relationshipId,
  onSelect,
  onToggle,
  onWorkouts,
  onPhotos,
}: Props) {
  const listed = (key: ProgressMetricKey) =>
    hasPoints(series[key]) || formKeys.includes(key);
  const bodyEntries: RailEntry[] = [
    ...WEIGHT_KEYS.map((key) => ({ group: "weight" as const, key })),
    ...BODY_KEYS.filter(listed).map((key) => ({ group: "body" as const, key })),
  ];
  const ratingEntries: RailEntry[] = RATING_KEYS.filter(listed).map((key) => ({
    group: "ratings" as const,
    key,
  }));

  const isSelected = (group: MetricGroup, key: ProgressMetricKey) =>
    workoutsRow === null &&
    !photosOpen &&
    view.group === group &&
    view.focus === key;

  function rowClass(base: string, selected: boolean, compared: boolean) {
    return `${base}${selected ? " is-selected" : ""}${compared ? " is-compared" : ""}`;
  }

  function heading(id: string, text: string) {
    return (
      <p className="pg-rail-heading" id={id}>
        {text}
      </p>
    );
  }

  /** Body or Check-in answers: metric rows, with line checkboxes beside the focused group. */
  function metricGroup(id: string, text: string, entries: RailEntry[]) {
    const checkGroup: "body" | "ratings" | null = entries.some(
      (entry) => entry.group === "ratings",
    )
      ? "ratings"
      : entries.some((entry) => entry.group === "body")
        ? "body"
        : null;
    const showChecks =
      checkGroup !== null &&
      workoutsRow === null &&
      !photosOpen &&
      compare === null &&
      view.group === checkGroup;
    const ticked = checkGroup ? checked[checkGroup] : [];
    return (
      <div className="pg-rail-group">
        {heading(id, text)}
        <div className={showChecks ? "pg-rail-grid has-checks" : "pg-rail-grid"}>
          {showChecks ? (
            <div
              className="pg-rail-checks"
              role="group"
              aria-label={`${text}: lines on the chart`}
            >
              {entries.map(({ group, key }) => {
                const isChecked = ticked.includes(key);
                // Weight has one line of its own; an unanswered question has no line to show.
                // Both keep the rows aligned.
                if (group === "weight" || !hasPoints(series[key])) {
                  return (
                    <span key={key} className="pg-rail-checkwrap" aria-hidden="true" />
                  );
                }
                return (
                  <label
                    key={key}
                    className={rowClass(
                      "pg-rail-checkwrap",
                      isSelected(group, key),
                      false,
                    )}
                  >
                    <input
                      type="checkbox"
                      className="pg-rail-check"
                      checked={isChecked}
                      disabled={isChecked && ticked.length === 1}
                      aria-label={`Show ${metricLabel(key)} on the chart`}
                      onChange={() => onToggle(checkGroup!, key)}
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
            {entries.map(({ group, key }) => {
              const selected = isSelected(group, key);
              const compared = compare === key && workoutsRow === null;
              // Weight stays selectable with no entries: it is the default view.
              if (group !== "weight" && !hasPoints(series[key])) {
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={false}
                    aria-disabled="true"
                    disabled
                    className="pg-rail-tab is-empty"
                  >
                    <span className="pg-rail-label">{metricLabel(key)}</span>
                    <span className="pg-rail-value">{NO_ENTRIES}</span>
                  </button>
                );
              }
              const change = changeText(series[key]);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="pg-panel"
                  className={rowClass("pg-rail-tab", selected, compared)}
                  onClick={() => onSelect(group, key)}
                >
                  <span className="pg-rail-label">
                    {metricLabel(key)}
                    {compared ? (
                      <span className="sr-only"> (compared)</span>
                    ) : null}
                  </span>
                  <span className="pg-rail-figures">
                    <span className="pg-rail-value">
                      {latestValue(key, series[key])}
                    </span>
                    {change ? (
                      <span className="pg-rail-change">
                        <span className="sr-only">Change </span>
                        {change}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const workoutRows = [
    [
      "completed",
      "Workouts done",
      workouts ? `${workouts.completed} of ${workouts.planned}` : null,
    ],
    [
      "exercises",
      "Exercise progress",
      workouts
        ? workouts.lifts === 1
          ? "1 lift"
          : `${workouts.lifts} lifts`
        : null,
    ],
  ] as const;

  return (
    <aside className="pg-rail workspace-card" aria-label="Metrics">
      {metricGroup("pg-rail-body", "Body", bodyEntries)}
      {workouts || showEmptyWorkouts ? (
        <div className="pg-rail-group">
          {heading("pg-rail-workouts", "Training")}
          <div
            role="tablist"
            aria-orientation="vertical"
            aria-labelledby="pg-rail-workouts"
            className="pg-rail-tabs"
          >
            {workoutRows.map(([row, label, value]) =>
              value === null ? (
                <button
                  key={row}
                  type="button"
                  role="tab"
                  aria-selected={false}
                  aria-disabled="true"
                  disabled
                  className="pg-rail-tab is-empty"
                >
                  <span className="pg-rail-label">{label}</span>
                  <span className="pg-rail-value">{NO_ENTRIES}</span>
                </button>
              ) : (
                <button
                  key={row}
                  type="button"
                  role="tab"
                  aria-selected={workoutsRow === row && !photosOpen}
                  aria-controls="pg-panel"
                  className={rowClass(
                    "pg-rail-tab",
                    workoutsRow === row && !photosOpen,
                    false,
                  )}
                  onClick={() => onWorkouts(row)}
                >
                  <span className="pg-rail-label">{label}</span>
                  <span className="pg-rail-figures">
                    <span className="pg-rail-value">{value}</span>
                  </span>
                </button>
              ),
            )}
          </div>
        </div>
      ) : null}
      {ratingEntries.length
        ? metricGroup("pg-rail-ratings", "Check-in answers", ratingEntries)
        : null}
      <div className="pg-rail-group">
        {heading("pg-rail-photos", "Photos")}
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-labelledby="pg-rail-photos"
          className="pg-rail-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={photosOpen}
            aria-controls="pg-panel"
            aria-disabled={photoDates === 0 ? "true" : undefined}
            disabled={photoDates === 0}
            className={
              photoDates === 0
                ? "pg-rail-tab is-empty"
                : rowClass("pg-rail-tab", photosOpen, false)
            }
            onClick={onPhotos}
          >
            <span className="pg-rail-label">Progress photos</span>
            <span className="pg-rail-figures">
              <span className="pg-rail-value">
                {photoDates === 0
                  ? NO_ENTRIES
                  : photoDates === 1
                    ? "1 date"
                    : `${photoDates} dates`}
              </span>
            </span>
          </button>
        </div>
      </div>
      <div className="pg-rail-foot">
        <p className="pg-rail-foot-note">Your own questions are not charted.</p>
        <Link to={`/clients/${relationshipId}/check-ins`}>
          See answers in Check-ins
        </Link>
      </div>
    </aside>
  );
}
