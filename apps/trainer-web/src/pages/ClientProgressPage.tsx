import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ProgressEntry, ProgressMetricKey } from "@fitbud/contracts";
import { ChartLine, Lock } from "lucide-react";
import {
  formatCivilDate,
  formatLocalDate,
  possessivePronoun,
} from "@fitbud/core";
import { ErrorState } from "../components/StatePanels";
import { isWorkspaceReadOnly } from "../hooks/useWorkspaceReadOnly";
import { apiClient } from "../lib/api";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import { todayInTimezone } from "../components/activity/activityUtils";
import type { WorkspaceOutletContext } from "./workspaceContext";
import {
  ALL_METRIC_KEYS,
  BODY_KEYS,
  RATING_KEYS,
  type MetricGroup,
} from "./progress/metricKeys";
import {
  MetricRail,
  hasPoints,
  type RailView,
  type WorkoutsRow,
  type WorkoutsSummary,
} from "./progress/MetricRail";
import { ComparePanel } from "./progress/ComparePanel";
import { CompareControl } from "./progress/CompareControl";
import { MultiSeriesPanel } from "./progress/MultiSeriesPanel";
import { PhotosPanel, groupPhotoDates } from "./progress/PhotosPanel";
import { PanelSkeleton, ProgressSkeleton } from "./progress/ProgressSkeleton";
import { RangeControl } from "./progress/RangeControl";
import { StrengthPanel } from "./progress/StrengthPanel";
import { WeightPanel } from "./progress/WeightPanel";
import { useFormMetricKeys } from "./progress/useFormMetricKeys";
import {
  useProgressMetrics,
  type MetricRange,
} from "./progress/useProgressMetrics";
import { useStrength } from "./progress/useStrength";
import "./progress/progress.css";

const ALL_TIME: MetricRange = { range: "all" };
/** How many lines a multi-series chart starts with (frames 160b, 160c show three). */
const DEFAULT_LINES = 3;

type Checked = Record<"body" | "ratings", ProgressMetricKey[]>;

export function ClientProgressPage() {
  const { relationshipId = "" } = useParams();
  const {
    workspace,
    refreshEpoch = 0,
    online = true,
  } = useOutletContext<WorkspaceOutletContext>();
  const ended = isWorkspaceReadOnly(workspace);
  const header = workspace?.header;
  const clientTz = header
    ? resolveTraineeTimezone(header).timezone
    : "Asia/Kolkata";
  const clientFirstName =
    (header?.traineeDisplayName ?? "Client").trim().split(/\s+/)[0] || "Client";
  const today = useMemo(() => todayInTimezone(clientTz), [clientTz]);
  const pronoun = possessivePronoun(header?.traineeProfile?.gender);
  const Pronoun = pronoun.charAt(0).toUpperCase() + pronoun.slice(1);
  const nextCheckin = workspace?.overview?.nextCheckin ?? null;
  const formMetrics = useFormMetricKeys(nextCheckin?.id ?? null, refreshEpoch);
  const startedOn = header?.startedAt
    ? formatLocalDate(new Date(header.startedAt), clientTz)
    : null;
  const endedOn = header?.endedAt
    ? formatLocalDate(new Date(header.endedAt), clientTz)
    : null;

  const [range, setRange] = useState<MetricRange>(() =>
    ended ? ALL_TIME : { range: "12w" },
  );
  // Ended coaching reads as the whole coached period (frame 160h). The workspace
  // can arrive after the first render, so switch once unless the trainer picked a range.
  const rangeTouched = useRef(false);
  useEffect(() => {
    if (ended && !rangeTouched.current) setRange(ALL_TIME);
  }, [ended]);
  function chooseRange(next: MetricRange) {
    rangeTouched.current = true;
    setRange(next);
  }
  const [view, setView] = useState<RailView | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  /** The metric on the right-hand scale (frame 160d). */
  const [compareKey, setCompareKey] = useState<ProgressMetricKey | null>(null);
  /** Set while the workouts panel (frame 160e) is open. */
  const [workoutsRow, setWorkoutsRow] = useState<WorkoutsRow | null>(null);
  /** Set while the photos view (frame 160f) is open. */
  const [photosOpen, setPhotosOpen] = useState(false);
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  // All-time series for every standard key: the rail's latest values and which keys have data.
  const rail = useProgressMetrics({
    relationshipId,
    keys: ALL_METRIC_KEYS,
    range: ALL_TIME,
    refreshEpoch,
  });
  const railSeries = useMemo(() => rail.data?.series ?? {}, [rail.data]);
  const metricsWithData = ALL_METRIC_KEYS.filter((key) =>
    hasPoints(railSeries[key]),
  );

  // All-time strength: the rail's "Workouts · from logs" rows.
  const strengthAll = useStrength({
    relationshipId,
    range: ALL_TIME,
    refreshEpoch,
  });
  const workouts = useMemo((): WorkoutsSummary | null => {
    const model = strengthAll.data;
    if (!model) return null;
    const completed = model.workoutsPerWeek.reduce((sum, w) => sum + w.count, 0);
    const planned = model.workoutsPerWeek.reduce((sum, w) => sum + w.planned, 0);
    const lifts = model.exercises.length;
    return completed || planned || lifts ? { completed, planned, lifts } : null;
  }, [strengthAll.data]);

  // Photos come from the progress entries list (stored progress photos).
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const loadEntries = useCallback(async () => {
    if (!relationshipId) return;
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const page = await apiClient.listProgressEntries(relationshipId, {
        limit: 100,
      });
      setEntries(page.items);
    } catch (err) {
      setEntriesError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load progress.",
      );
    } finally {
      setEntriesLoading(false);
    }
  }, [relationshipId]);
  useEffect(() => {
    void loadEntries();
  }, [loadEntries, refreshEpoch]);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  useEffect(() => {
    if (!entriesLoading) setEntriesLoaded(true);
  }, [entriesLoading]);

  // Photo dates are the client's calendar days, not UTC days.
  const photoDates = useMemo(
    () => groupPhotoDates(entries, clientTz),
    [entries, clientTz],
  );
  const anyData =
    metricsWithData.length > 0 || workouts !== null || photoDates.length > 0;

  // First load: start on weight (or the first group with data) and tick up to three lines per group.
  useEffect(() => {
    if (!rail.data) return;
    const series = rail.data.series;
    const body = BODY_KEYS.filter((key) => hasPoints(series[key]));
    const ratings = RATING_KEYS.filter((key) => hasPoints(series[key]));
    setChecked(
      (current) =>
        current ?? {
          body: body.slice(0, DEFAULT_LINES),
          ratings: ratings.slice(0, DEFAULT_LINES),
        },
    );
    setView((current) => {
      if (current) return current;
      if (hasPoints(series.weight) || (!body.length && !ratings.length)) {
        return { group: "weight", focus: "weight" };
      }
      if (body.length) return { group: "body", focus: body[0]! };
      return { group: "ratings", focus: ratings[0]! };
    });
  }, [rail.data]);

  // No check-in metrics: open on workouts from logs, else on the photos.
  const openedElsewhere = useRef(false);
  useEffect(() => {
    if (
      openedElsewhere.current ||
      !rail.data ||
      !strengthAll.data ||
      !entriesLoaded
    ) {
      return;
    }
    openedElsewhere.current = true;
    if (metricsWithData.length) return;
    if (workouts) setWorkoutsRow("exercises");
    else if (photoDates.length) setPhotosOpen(true);
  }, [
    rail.data,
    strengthAll.data,
    entriesLoaded,
    metricsWithData.length,
    workouts,
    photoDates.length,
  ]);

  const activeView: RailView = view ?? { group: "weight", focus: "weight" };
  const comparing =
    compareKey !== null && workoutsRow === null && !photosOpen;
  const chartKeys = useMemo((): ProgressMetricKey[] => {
    if (comparing && compareKey) return [activeView.focus, compareKey];
    if (activeView.group === "weight" || !checked) return ["weight"];
    const ticked = checked[activeView.group];
    return [
      activeView.focus,
      ...ticked.filter((key) => key !== activeView.focus),
    ];
  }, [activeView.group, activeView.focus, checked, comparing, compareKey]);

  const chart = useProgressMetrics({
    relationshipId,
    keys: chartKeys,
    range,
    refreshEpoch,
    enabled:
      workoutsRow === null &&
      !photosOpen &&
      range.range !== "all" &&
      Boolean(rail.data),
  });
  const chartSeries =
    range.range === "all" ? railSeries : (chart.data?.series ?? {});

  const strengthRange = useStrength({
    relationshipId,
    range,
    refreshEpoch,
    enabled: workoutsRow !== null && !photosOpen && range.range !== "all",
  });
  const strength =
    range.range === "all" ? strengthAll.data : strengthRange.data;
  const strengthLoading =
    range.range === "all" ? strengthAll.loading : strengthRange.loading;

  useEffect(() => {
    if (workoutsRow !== "completed") return;
    document.getElementById("pg-weeks")?.scrollIntoView?.({ block: "nearest" });
  }, [workoutsRow, strength]);

  function selectKey(group: MetricGroup, key: ProgressMetricKey) {
    setWorkoutsRow(null);
    setPhotosOpen(false);
    setView({ group, focus: key });
    if (key === compareKey) setCompareKey(null);
    if (group === "weight") return;
    setChecked((current) => {
      const base = current ?? { body: [], ratings: [] };
      if (base[group].includes(key)) return base;
      return { ...base, [group]: [...base[group], key] };
    });
  }

  function toggleKey(group: "body" | "ratings", key: ProgressMetricKey) {
    const base = checked ?? { body: [], ratings: [] };
    const ticked = base[group];
    if (ticked.includes(key)) {
      if (ticked.length === 1) return; // a chart always keeps one line
      const next = ticked.filter((item) => item !== key);
      setChecked({ ...base, [group]: next });
      if (activeView.group === group && activeView.focus === key) {
        setView({ group, focus: next[0]! });
      }
    } else {
      setChecked({ ...base, [group]: [...ticked, key] });
    }
  }

  function chooseCompare(key: ProgressMetricKey) {
    setWorkoutsRow(null);
    setPhotosOpen(false);
    setCompareKey(key);
  }

  function chooseWorkouts(row: WorkoutsRow) {
    setPhotosOpen(false);
    setWorkoutsRow(row);
  }

  function choosePhotos() {
    setWorkoutsRow(null);
    setPhotosOpen(true);
  }

  const compareOptions = metricsWithData.filter(
    (key) => key !== activeView.focus,
  );


  const error =
    rail.error ??
    chart.error ??
    strengthAll.error ??
    strengthRange.error ??
    entriesError;
  const loading =
    (rail.loading && !rail.data) ||
    (strengthAll.loading && !strengthAll.data) ||
    !entriesLoaded;
  const ready = !loading && rail.data && strengthAll.data && checked;

  function emptyPanel() {
    return (
      <div className="pg-empty-state">
        <span className="pg-empty-icon" aria-hidden="true">
          <ChartLine size={18} strokeWidth={1.6} />
        </span>
        <h2 id="pg-panel-title">No progress data yet</h2>
        {ended ? (
          <p>
            No check-in answers, workouts or photos were logged while coaching
            ran.
          </p>
        ) : (
          <p>
            Charts follow the standard questions in {pronoun} check-in form:
            weight, the measurements you picked, ratings and photos.
            {nextCheckin
              ? ` ${Pronoun} next check-in opens ${formatCivilDate(
                  formatLocalDate(new Date(nextCheckin.windowStartsAt), clientTz),
                )}.`
              : null}{" "}
            Workout progress appears after {clientFirstName} logs a workout.
          </p>
        )}
        <div className="pg-empty-actions">
          {/* Ended: Configure is read-only (CE1), so label as view-only (CE3). */}
          <Link
            className="pg-outline-btn"
            to={`/clients/${relationshipId}/configure`}
          >
            {ended ? "View coaching setup" : "Open check-in settings"}
          </Link>
          {!ended && formMetrics.templateId ? (
            <Link
              className="pg-soft-btn"
              to={`/templates/checkins/${formMetrics.templateId}`}
            >
              See {pronoun} check-in form
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  function panelBody() {
    if (!anyData) return emptyPanel();
    if (photosOpen) {
      return (
        <PhotosPanel
          dates={photoDates}
          weight={railSeries.weight}
          clientFirstName={clientFirstName}
        />
      );
    }
    if (workoutsRow !== null) {
      if (!strength) {
        return strengthLoading ? <PanelSkeleton /> : null;
      }
      return (
        <StrengthPanel
          model={strength}
          range={range}
          today={today}
          exerciseId={exerciseId}
          onExercise={setExerciseId}
        />
      );
    }
    if (range.range !== "all" && !chart.data && chart.loading) {
      return <PanelSkeleton />;
    }
    if (comparing && compareKey) {
      return (
        <ComparePanel
          primary={activeView.focus}
          secondary={compareKey}
          series={chartSeries}
          onRemove={() => setCompareKey(null)}
        />
      );
    }
    if (activeView.group === "weight") {
      return (
        <WeightPanel
          series={chartSeries.weight}
          allTimeEntries={railSeries.weight?.points.length ?? 0}
          ended={ended}
          coachedPeriod={
            startedOn && endedOn
              ? `${formatCivilDate(startedOn)} — ${formatCivilDate(endedOn)}`
              : null
          }
          renderSource={(point) =>
            point.checkinId ? (
              <Link
                className="progress-checkin-link"
                to={`/clients/${relationshipId}/check-ins/${point.checkinId}`}
              >
                From check-in
              </Link>
            ) : (
              "Measurement entry"
            )
          }
        />
      );
    }
    return (
      <MultiSeriesPanel
        kind={activeView.group}
        keys={chartKeys}
        series={chartSeries}
        clientFirstName={clientFirstName}
      />
    );
  }

  return (
    <div
      className="workspace-page progress-page pg-page"
      data-testid="screen-TW-18"
    >
      <h1 className="sr-only">Progress</h1>

      {error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            rail.reload();
            chart.reload();
            strengthAll.reload();
            strengthRange.reload();
            void loadEntries();
          }}
          screenId="TW-18"
        />
      ) : null}
      {ended ? (
        <p className="pg-ended-banner" role="note">
          <Lock size={16} strokeWidth={1.6} aria-hidden />
          <span>
            {endedOn
              ? `Coaching with ${clientFirstName} ended ${formatCivilDate(endedOn)}. `
              : `Coaching with ${clientFirstName} has ended. `}
            {Pronoun} progress is read-only and stays here for {pronoun}{" "}
            records.
          </span>
        </p>
      ) : null}

      <div className="pg-toolbar">
        <div className="pg-toolbar-left">
          <RangeControl value={range} today={today} onChange={chooseRange} />
          <CompareControl
            options={ready ? compareOptions : []}
            value={comparing ? compareKey : null}
            onChange={chooseCompare}
          />
        </div>
        <p className="pg-toolbar-note">Check-in dates · values as entered</p>
      </div>

      {loading && !error ? <ProgressSkeleton /> : null}

      {ready ? (
        <div className="pg-layout">
          <MetricRail
            series={railSeries}
            view={activeView}
            checked={checked}
            compare={comparing ? compareKey : null}
            workouts={workouts}
            workoutsRow={photosOpen ? null : workoutsRow}
            showEmptyWorkouts={Boolean(header?.effectivePlan) || !anyData}
            formKeys={formMetrics.keys}
            photoDates={photoDates.length}
            photosOpen={photosOpen}
            relationshipId={relationshipId}
            onSelect={selectKey}
            onToggle={toggleKey}
            onWorkouts={chooseWorkouts}
            onPhotos={choosePhotos}
          />
          <section
            id="pg-panel"
            role={anyData ? "tabpanel" : "region"}
            className="pg-panel workspace-card"
            aria-labelledby="pg-panel-title"
            aria-busy={
              photosOpen || !anyData
                ? false
                : workoutsRow !== null
                  ? strengthLoading
                  : chart.loading
            }
          >
            {panelBody()}
          </section>
        </div>
      ) : null}

      {!online ? (
        <p className="muted" role="status">
          Offline — progress data may be stale.
        </p>
      ) : null}
    </div>
  );
}
