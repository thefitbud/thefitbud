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

type Props = {
  /** All-time series per key: the rail shows each key's latest entered value. */
  series: Partial<Record<ProgressMetricKey, ProgressMetricSeries>>;
  view: RailView;
  checked: Record<"body" | "ratings", ProgressMetricKey[]>;
  photoDates: number;
  relationshipId: string;
  onSelect: (group: MetricGroup, key: ProgressMetricKey) => void;
  onToggle: (group: "body" | "ratings", key: ProgressMetricKey) => void;
};

function latestValue(row: ProgressMetricSeries | undefined): string {
  const last = row?.points.at(-1);
  return last ? formatMetricValue(last.value, row!.unit) : "No entries";
}

export function hasPoints(row: ProgressMetricSeries | undefined): boolean {
  return (row?.points.length ?? 0) > 0;
}

/** Left rail of frames 160, 160b and 160c: one row per standard key with data. */
export function MetricRail({
  series,
  view,
  checked,
  photoDates,
  relationshipId,
  onSelect,
  onToggle,
}: Props) {
  const bodyKeys = BODY_KEYS.filter((key) => hasPoints(series[key]));
  const ratingKeys = RATING_KEYS.filter((key) => hasPoints(series[key]));

  function row(group: MetricGroup, key: ProgressMetricKey) {
    const selected = view.group === group && view.focus === key;
    const ticked = group === "weight" ? [] : checked[group];
    const showCheck = group !== "weight" && view.group === group;
    const isChecked = ticked.includes(key);
    const onlyChecked = isChecked && ticked.length === 1;
    return (
      <div
        key={key}
        role="presentation"
        className={selected ? "pg-rail-row is-selected" : "pg-rail-row"}
      >
        {showCheck ? (
          <label className="pg-rail-checkwrap">
            <input
              type="checkbox"
              className="pg-rail-check"
              checked={isChecked}
              disabled={onlyChecked}
              aria-label={`Show ${metricLabel(key)} on the chart`}
              onChange={() => onToggle(group as "body" | "ratings", key)}
            />
          </label>
        ) : null}
        <button
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls="pg-panel"
          className="pg-rail-tab"
          onClick={() => onSelect(group, key)}
        >
          <span className="pg-rail-label">{metricLabel(key)}</span>
          <span className="pg-rail-value">{latestValue(series[key])}</span>
        </button>
      </div>
    );
  }

  return (
    <aside className="pg-rail workspace-card" aria-label="Metrics">
      <div role="tablist" aria-orientation="vertical" aria-label="Metric">
        <p className="pg-rail-heading">Weight · standard question</p>
        {row("weight", "weight")}
        {bodyKeys.length ? (
          <>
            <p className="pg-rail-heading">
              Body measurements · picked in form
            </p>
            {bodyKeys.map((key) => row("body", key))}
          </>
        ) : null}
        {ratingKeys.length ? (
          <>
            <p className="pg-rail-heading">Ratings 1 to 5 · standard</p>
            {ratingKeys.map((key) => row("ratings", key))}
          </>
        ) : null}
      </div>
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
