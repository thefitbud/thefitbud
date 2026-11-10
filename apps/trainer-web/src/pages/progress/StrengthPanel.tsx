import { useState } from "react";
import type {
  StrengthExercise,
  StrengthPoint,
  StrengthReadModel,
  StrengthWeekCount,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { MetricLineChart, useWidth, type ChartPoint } from "./MetricLineChart";
import { formatPointDate, styleAt } from "./metricKeys";
import type { MetricRange } from "./useProgressMetrics";

type Mode = "top" | "total";

type Props = {
  model: StrengthReadModel;
  range: MetricRange;
  /** Client-local today, YYYY-MM-DD. */
  today: string;
  exerciseId: string | null;
  onExercise: (exerciseId: string) => void;
};

// Loads keep their hundredths ("18.75 kg"): logged kg are stored to two decimals.
const NUMBER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** "67.5 kg × 6", "Bodyweight × 9", "12 reps". */
export function formatSet(point: StrengthPoint, exercise: StrengthExercise): string {
  if (exercise.chartBy === "reps") {
    return point.reps === 1 ? "1 rep" : `${point.reps ?? 0} reps`;
  }
  const load =
    point.topLoadKg === null
      ? "Bodyweight"
      : `${NUMBER.format(point.topLoadKg)} kg`;
  return point.reps === null ? load : `${load} × ${point.reps}`;
}

/** Monday of the week that holds `localDate`. */
export function weekStartOf(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  const back = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - back * 86_400_000).toISOString().slice(0, 10);
}

/** The exercise to open first: the one with the most charted sessions, then by name. */
export function defaultExercise(exercises: StrengthExercise[]): string | null {
  const sorted = [...exercises].sort(
    (a, b) => b.points.length - a.points.length || a.name.localeCompare(b.name),
  );
  return sorted[0]?.exerciseId ?? null;
}

function chartPoints(
  exercise: StrengthExercise,
  mode: Mode,
): { points: ChartPoint[]; unit: "kg" | "reps"; left: number } {
  const unit = exercise.chartBy === "reps" ? "reps" : "kg";
  const points: ChartPoint[] = [];
  let left = 0;
  for (const point of exercise.points) {
    const value =
      exercise.chartBy === "reps"
        ? mode === "top"
          ? point.reps
          : point.totalReps
        : mode === "top"
          ? point.topLoadKg
          : point.volumeKg;
    if (value === null) left += 1;
    else points.push({ localDate: point.localDate, value });
  }
  return { points, unit, left };
}

function subtitleFor(exercise: StrengthExercise, mode: Mode): string {
  if (exercise.chartBy === "reps") {
    return mode === "top"
      ? "Most reps in one set per session · bodyweight lift, charted by reps"
      : "Reps added up per session · bodyweight lift, charted by reps";
  }
  return mode === "top"
    ? "Heaviest logged set per session · kg read from the logged load"
    : "Reps × kg added up per session · kg read from the logged load";
}

function rangeWords(range: MetricRange): string {
  if (range.range === "all") return "since start";
  if (range.range === "4w") return "in 4 weeks";
  if (range.range === "12w") return "in 12 weeks";
  return "in this range";
}

function DumbbellIcon() {
  return (
    <svg
      className="pg-subtitle-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M2.5 10.5l3 3M4 9l3 3M10.5 2.5l3 3M9 4l3 3M5.5 10.5l5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4M8 4.9v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Frame 160e lower half: completed (solid) against planned (pale) workouts per week. */
export function WeeklyBars({
  weeks,
  today,
}: {
  weeks: StrengthWeekCount[];
  today: string;
}) {
  const { ref, width } = useWidth(720);
  const thisWeek = weekStartOf(today);
  const top = Math.max(2, ...weeks.map((week) => Math.max(week.planned, week.count)));
  const max = top % 2 === 0 ? top : top + 1;
  const height = 150;
  const pad = { top: 22, right: 8, bottom: 26, left: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const slot = innerW / Math.max(1, weeks.length);
  const barW = Math.min(40, slot * 0.6);
  const y = (value: number) => pad.top + innerH - (value / max) * innerH;
  const showCounts = slot >= 44;
  const label = (week: StrengthWeekCount) =>
    week.weekStart === thisWeek
      ? "This week"
      : `w/c ${formatCivilDate(week.weekStart, { includeWeekday: false })}`;

  // Week labels: the first, the last, and others no closer than about 150 px.
  const labelled = new Set<number>();
  const minGap = Math.max(1, Math.ceil(150 / slot));
  weeks.forEach((_, index) => {
    const last = weeks.length - 1;
    if (index === 0 || index === last) labelled.add(index);
    else if (index % minGap === 0 && last - index >= minGap / 2) labelled.add(index);
  });

  return (
    <div className="pg-chart pg-bars" ref={ref}>
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Workouts completed per week, ${weeks.length} ${weeks.length === 1 ? "week" : "weeks"}`}
    >
      <g className="pg-chart-grid" aria-hidden="true">
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} />
            <text x={pad.left - 10} y={y(tick)} dy="0.32em" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
      </g>
      {weeks.map((week, index) => {
        const cx = pad.left + slot * index + slot / 2;
        const isLast = index === weeks.length - 1;
        return (
          <g key={week.weekStart}>
            <title>{`${label(week)}: ${week.count} of ${week.planned} planned workouts completed`}</title>
            {week.planned > 0 ? (
              <rect
                className="pg-bar-planned"
                x={cx - barW / 2}
                width={barW}
                y={y(week.planned)}
                height={y(0) - y(week.planned)}
                rx={4}
              />
            ) : null}
            {week.count > 0 ? (
              <rect
                className="pg-bar-done"
                x={cx - barW / 2}
                width={barW}
                y={y(week.count)}
                height={y(0) - y(week.count)}
                rx={4}
              />
            ) : null}
            {showCounts && week.planned > 0 ? (
              <text
                className="pg-bar-count"
                x={cx}
                y={y(Math.max(week.planned, week.count)) - 6}
                textAnchor="middle"
              >
                {`${week.count} of ${week.planned}`}
              </text>
            ) : null}
            {labelled.has(index) ? (
              <text
                className="pg-bar-week"
                x={cx}
                y={height - 6}
                textAnchor={index === 0 && !isLast ? "start" : isLast && index !== 0 ? "end" : "middle"}
                dx={index === 0 && !isLast ? -barW / 2 : isLast && index !== 0 ? barW / 2 : 0}
              >
                {label(week)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

/** Frame 160e: exercise progress from logged sets, and workouts completed per week. */
export function StrengthPanel({ model, range, today, exerciseId, onExercise }: Props) {
  const [mode, setMode] = useState<Mode>("top");
  const [showSets, setShowSets] = useState(false);
  const exercise =
    model.exercises.find((row) => row.exerciseId === exerciseId) ??
    model.exercises.find((row) => row.exerciseId === defaultExercise(model.exercises));
  const chart = exercise ? chartPoints(exercise, mode) : null;
  const first = exercise?.points[0];
  const latest = exercise?.points.at(-1);

  const weeks = model.workoutsPerWeek;
  const done = weeks.reduce((sum, week) => sum + week.count, 0);
  const planned = weeks.reduce((sum, week) => sum + week.planned, 0);
  const current = weeks.at(-1)?.weekStart === weekStartOf(today) ? weeks.at(-1) : undefined;
  const uncharted = model.notCharted;

  return (
    <>
      <div className="pg-panel-head">
        <div>
          <h2 id="pg-panel-title">Exercise progress</h2>
          {exercise ? (
            <p className="pg-subtitle">
              <DumbbellIcon />
              {subtitleFor(exercise, mode)}
            </p>
          ) : null}
        </div>
        {exercise ? (
          <div className="pg-head-controls">
            <label className="pg-select">
              <span className="sr-only">Exercise</span>
              <select
                value={exercise.exerciseId}
                onChange={(event) => onExercise(event.target.value)}
              >
                {model.exercises.map((row) => (
                  <option key={row.exerciseId} value={row.exerciseId}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="pg-segment" role="group" aria-label="Chart value">
              <button
                type="button"
                className={mode === "top" ? "pg-segment-btn is-on" : "pg-segment-btn"}
                aria-pressed={mode === "top"}
                onClick={() => setMode("top")}
              >
                Top set
              </button>
              <button
                type="button"
                className={mode === "total" ? "pg-segment-btn is-on" : "pg-segment-btn"}
                aria-pressed={mode === "total"}
                onClick={() => setMode("total")}
              >
                {exercise.chartBy === "reps" ? "Total reps" : "Total reps × kg"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {exercise && first && latest && chart ? (
        <>
          <dl className="pg-stats">
            <div>
              <dt>
                {range.range === "all" ? "First logged" : "First in range"} ·{" "}
                {formatPointDate(first.localDate)}
              </dt>
              <dd className="pg-stat-num">{formatSet(first, exercise)}</dd>
            </div>
            <div>
              <dt>Latest · {formatPointDate(latest.localDate)}</dt>
              <dd className="pg-stat-num">{formatSet(latest, exercise)}</dd>
            </div>
            <div>
              <dt>Sessions with this lift</dt>
              <dd>
                <span className="pg-stat-num">{exercise.sessions}</span>{" "}
                <span className="pg-stat-note">of {exercise.plannedSessions} planned</span>
              </dd>
            </div>
          </dl>
          {chart.points.length ? (
            <MetricLineChart
              label={`${exercise.name}, ${mode === "top" ? "top set" : "total"} in ${chart.unit} per session, from ${formatPointDate(chart.points[0]!.localDate)} to ${formatPointDate(chart.points.at(-1)!.localDate)}`}
              series={[
                {
                  key: exercise.exerciseId,
                  label: exercise.name,
                  unit: chart.unit,
                  points: chart.points,
                  style: styleAt(0),
                },
              ]}
              gaps={{}}
              height={200}
            />
          ) : null}
          {chart.left > 0 ? (
            <p className="pg-chart-note">
              {chart.left === 1
                ? "1 session with bodyweight sets only is not on this kg chart."
                : `${chart.left} sessions with bodyweight sets only are not on this kg chart.`}
            </p>
          ) : null}
        </>
      ) : (
        <p className="pg-empty" role="status">
          No lifts logged in this range.
        </p>
      )}

      {uncharted.sets > 0 ? (
        <div className="pg-banner">
          <div className="pg-banner-row">
            <InfoIcon />
            <p>
              {uncharted.sets === 1 ? "1 set" : `${uncharted.sets} sets`} not charted: load
              logged as text ("RPE 8", "red band"). Bodyweight lifts chart reps instead.
            </p>
            <button
              type="button"
              className="pg-link-btn"
              aria-expanded={showSets}
              aria-controls="pg-uncharted"
              onClick={() => setShowSets((open) => !open)}
            >
              {showSets ? "Hide sets" : "See sets"}
            </button>
          </div>
          {showSets ? (
            <ul id="pg-uncharted" className="pg-uncharted">
              {uncharted.items.map((item, index) => (
                <li key={`${item.localDate}-${index}`}>
                  <span>{formatPointDate(item.localDate)}</span>
                  <span>{item.exerciseName}</span>
                  <span>
                    {item.loadLabel}
                    {item.reps !== null ? ` × ${item.reps}` : ""}
                  </span>
                </li>
              ))}
              {uncharted.items.length < uncharted.sets ? (
                <li className="pg-uncharted-more">
                  Showing the latest {uncharted.items.length}.
                </li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="pg-weeks-head" id="pg-weeks">
        <h3>Workouts completed per week</h3>
        <p className="pg-weeks-total">
          {done} of {planned} {rangeWords(range)}
          {current ? ` · ${current.count} of ${current.planned} this week` : ""}
        </p>
      </div>
      {weeks.length ? (
        <WeeklyBars weeks={weeks} today={today} />
      ) : (
        <p className="pg-empty" role="status">
          No workouts planned or logged in this range.
        </p>
      )}
    </>
  );
}
