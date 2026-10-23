import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Measurement, MeasurementType, ProgressEntry } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { LinkedMedia } from "../components/LinkedMedia";
import {
  MEASUREMENT_SERIES,
  TrendChart,
  type TrendPoint,
  type TrendRange,
  measurementTypeLabel,
} from "../components/MeasurementTrend";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import { isWorkspaceReadOnly } from "../hooks/useWorkspaceReadOnly";
import { apiClient } from "../lib/api";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import { todayInTimezone } from "../components/activity/activityUtils";
import type { WorkspaceOutletContext } from "./workspaceContext";

const TAB_LABELS: Record<MeasurementType | "other", string> = {
  body_weight_kg: "Weight",
  waist_cm: "Waist",
  hip_cm: "Hip",
  chest_cm: "Chest",
  other: "Other",
};

export function ClientProgressPage() {
  const { relationshipId = "" } = useParams();
  const { workspace, refreshEpoch = 0, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const ended = isWorkspaceReadOnly(workspace);
  const clientTz = resolveTraineeTimezone(
    workspace?.header ?? {
      relationshipId,
      traineeDisplayName: "Client",
      onboardingStatus: "coaching_ready",
      effectivePlan: null,
      goalShort: null,
      renewalState: null,
      adherenceState: "on_track",
      traineeProfile: { displayName: "Client", age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
    },
  ).timezone;

  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<MeasurementType>("body_weight_kg");
  const [range, setRange] = useState<TrendRange>("12w");
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    try {
      const [measurementPage, entryPage] = await Promise.all([
        apiClient.listMeasurements(relationshipId, { limit: 200 }),
        apiClient.listProgressEntries(relationshipId, { limit: 100 }),
      ]);
      setMeasurements(measurementPage.items);
      setEntries(entryPage.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load progress.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  const today = useMemo(() => todayInTimezone(clientTz), [clientTz]);

  const metricsWithData = useMemo(() => {
    const types = new Set(measurements.map((row) => row.type));
    const tabs: Array<MeasurementType | "other"> = ["body_weight_kg"];
    for (const type of MEASUREMENT_SERIES) {
      if (type !== "body_weight_kg" && types.has(type)) tabs.push(type);
    }
    if (types.has("other")) tabs.push("other");
    return tabs;
  }, [measurements]);

  useEffect(() => {
    if (!metricsWithData.includes(metric)) {
      setMetric(metricsWithData[0] ?? "body_weight_kg");
    }
  }, [metric, metricsWithData]);

  const pointsForMetric = useMemo((): TrendPoint[] => {
    return measurements
      .filter((row) => row.type === metric)
      .map((row) => ({
        id: row.id,
        value: row.value,
        unit: row.unit,
        observedAt: row.observedAt,
        source: row.source,
        checkinId: row.checkinId,
        localDate: row.observedAt.slice(0, 10),
      }));
  }, [measurements, metric]);

  const photoEntries = entries
    .filter((row) => row.entryType === "progress_photo" && row.mediaAssetId)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));

  const compareLeft = photoEntries.find((row) => row.id === compareA) ?? null;
  const compareRight = photoEntries.find((row) => row.id === compareB) ?? null;

  const weightEmpty =
    metric === "body_weight_kg" && pointsForMetric.length === 0 && !loading;

  return (
    <div className="workspace-page progress-page" data-testid="screen-TW-18">
      <header className="workspace-page-head">
        <h1>Progress</h1>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} screenId="TW-18" />
      ) : null}
      {loading ? <LoadingBlock label="Loading progress…" /> : null}

      {!loading && weightEmpty ? (
        <EmptyState title="No weigh-ins yet. Weight is collected in check-ins.">
          {/* Ended: Configure is read-only (CE1), so label as view-only (CE3). */}
          <Link to={`/clients/${relationshipId}/configure`}>
            {ended ? "View coaching setup" : "Open check-in settings"}
          </Link>
        </EmptyState>
      ) : null}

      {!loading && !weightEmpty ? (
        <>
          <div
            className="progress-metric-tabs"
            role="tablist"
            aria-label="Measurement"
          >
            {metricsWithData.map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={metric === type}
                className={
                  metric === type ? "segment-btn is-on" : "segment-btn"
                }
                onClick={() => setMetric(type)}
              >
                {TAB_LABELS[type]}
              </button>
            ))}
          </div>

          <div
            className="progress-range-tabs segment"
            role="group"
            aria-label="Trend range"
          >
            {(
              [
                ["4w", "4 w"],
                ["12w", "12 w"],
                ["all", "All"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={range === value ? "segment-btn is-on" : "segment-btn"}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <TrendChart
            label={measurementTypeLabel(metric)}
            points={pointsForMetric}
            range={range}
            today={today}
            timeZone={clientTz}
          />

          <details className="progress-data-table">
            <summary>Measurement history</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Value</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {pointsForMetric.map((row) => (
                  <tr key={row.id}>
                    <td>{formatCivilDate(row.localDate ?? row.observedAt.slice(0, 10))}</td>
                    <td>
                      {row.value} {row.unit}
                    </td>
                    <td>
                      {row.source === "checkin" && row.checkinId ? (
                        <Link
                          to={`/clients/${relationshipId}/check-ins/${row.checkinId}`}
                        >
                          From check-in ·{" "}
                          {formatCivilDate(row.localDate ?? row.observedAt.slice(0, 10))}
                        </Link>
                      ) : (
                        labelFor("measurement_source", row.source ?? "trainee_entry")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : null}

      <section className="workspace-card" aria-labelledby="photos-heading">
        <div className="workspace-card-head">
          <h2 id="photos-heading">Photos</h2>
          <div className="progress-compare-controls">
            <label className="field">
              <span>Compare</span>
              <select
                value={compareA}
                onChange={(event) => setCompareA(event.target.value)}
              >
                <option value="">Pick a date</option>
                {photoEntries.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatCivilDate(row.observedAt.slice(0, 10))}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>With</span>
              <select
                value={compareB}
                onChange={(event) => setCompareB(event.target.value)}
              >
                <option value="">Pick a date</option>
                {photoEntries.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatCivilDate(row.observedAt.slice(0, 10))}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {compareLeft?.mediaAssetId && compareRight?.mediaAssetId ? (
          <div className="progress-compare" data-testid="photo-compare">
            <figure className="progress-photo">
              <figcaption>
                {formatCivilDate(compareLeft.observedAt.slice(0, 10))}
              </figcaption>
              <LinkedMedia
                mediaAssetId={compareLeft.mediaAssetId}
                label="Earlier progress photo"
              />
            </figure>
            <figure className="progress-photo">
              <figcaption>
                {formatCivilDate(compareRight.observedAt.slice(0, 10))}
              </figcaption>
              <LinkedMedia
                mediaAssetId={compareRight.mediaAssetId}
                label="Later progress photo"
              />
            </figure>
          </div>
        ) : null}

        <ul className="progress-photo-grid">
          {photoEntries.map((row) => (
            <li key={row.id}>
              <p>{formatCivilDate(row.observedAt.slice(0, 10))}</p>
              {row.mediaAssetId ? (
                <LinkedMedia
                  mediaAssetId={row.mediaAssetId}
                  label={row.title?.trim() || "Progress photo"}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {!loading && photoEntries.length === 0 ? (
          <p className="workspace-empty" role="status">No progress photos yet</p>
        ) : null}
      </section>

      {!online ? (
        <p className="muted" role="status">
          Offline — progress data may be stale.
        </p>
      ) : null}
    </div>
  );
}
