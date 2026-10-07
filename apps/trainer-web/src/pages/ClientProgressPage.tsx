import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Measurement, MeasurementType, ProgressEntry } from "@fitbud/contracts";
import { LinkedMedia } from "../components/LinkedMedia";
import {
  MEASUREMENT_SERIES,
  MeasurementTrend,
  formatObservedAt,
  measurementTypeLabel,
} from "../components/MeasurementTrend";
import { apiClient } from "../lib/api";

type WorkspaceOutlet = { refreshEpoch?: number };

const PAGE_SIZE = 50;

export function ClientProgressPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [measurementCursor, setMeasurementCursor] = useState<string | null>(null);
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [entryCursor, setEntryCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMeasurements, setLoadingMeasurements] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [entryError, setEntryError] = useState<string | null>(null);

  const loadMeasurements = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const appending = Boolean(cursor);
      if (appending) setLoadingMeasurements(true);
      else setMeasurementError(null);
      try {
        const result = await apiClient.listMeasurements(relationshipId, {
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        });
        setMeasurements((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setMeasurementCursor(result.nextCursor);
      } catch (err) {
        setMeasurementError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load measurements.",
        );
      } finally {
        setLoadingMeasurements(false);
      }
    },
    [relationshipId],
  );

  const loadEntries = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const appending = Boolean(cursor);
      if (appending) setLoadingEntries(true);
      else setEntryError(null);
      try {
        const result = await apiClient.listProgressEntries(relationshipId, {
          cursor: cursor ?? undefined,
          limit: PAGE_SIZE,
        });
        setEntries((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setEntryCursor(result.nextCursor);
      } catch (err) {
        setEntryError(
          err instanceof ApiClientError ? err.message : "Could not load progress entries.",
        );
      } finally {
        setLoadingEntries(false);
      }
    },
    [relationshipId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadMeasurements(), loadEntries()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadEntries, loadMeasurements, refreshEpoch]);

  const extraTypes = [
    ...new Set(
      measurements
        .map((item) => item.type)
        .filter((type) => !MEASUREMENT_SERIES.includes(type)),
    ),
  ];
  const photoEntries = entries
    .filter((item) => item.entryType === "progress_photo")
    .slice()
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const comparable = photoEntries.filter((item) => item.mediaAssetId);
  const earliest = comparable[0] ?? null;
  const latest =
    comparable.length > 1 ? (comparable[comparable.length - 1] ?? null) : null;
  const comparisonIds = new Set(
    [earliest?.id, latest?.id].filter((id): id is string => Boolean(id)),
  );
  const listedPhotos = latest
    ? photoEntries.filter((item) => !comparisonIds.has(item.id))
    : photoEntries;
  const notes = entries.filter(
    (item) => item.entryType === "note" || item.entryType === "milestone",
  );

  return (
    <div className="workspace-page">
      <section className="workspace-card">
        <p className="workspace-kicker">Stored series</p>
        <h2 className="workspace-card-title">Progress</h2>
        <p className="lede">
          Charts use the paged measurement list. The progress summary is capped at
          50 rows and is not used here. Strength, fatigue, and risk are not stored.
        </p>
      </section>

      {measurementError ? (
        <p className="form-error" role="alert">
          {measurementError}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading measurements…</p> : null}

      {!loading
        ? MEASUREMENT_SERIES.map((type) => (
            <MeasurementCard
              key={type}
              type={type}
              points={measurements.filter((item) => item.type === type)}
            />
          ))
        : null}
      {!loading
        ? extraTypes.map((type) => (
            <MeasurementCard
              key={type}
              type={type}
              points={measurements.filter((item) => item.type === type)}
            />
          ))
        : null}
      {measurementCursor ? (
        <button
          type="button"
          className="button-secondary"
          disabled={loadingMeasurements}
          onClick={() => {
            void loadMeasurements(measurementCursor);
          }}
        >
          {loadingMeasurements ? "Loading…" : "Load more measurements"}
        </button>
      ) : null}

      <section className="workspace-card" aria-labelledby="photos-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Photos</p>
            <h2 id="photos-heading" className="workspace-card-title">
              Progress photos
            </h2>
            <p className="lede">
              Ready photos linked from progress entries. Download runs only when an
              entry has a media file.
            </p>
          </div>
        </div>
        {entryError ? (
          <p className="form-error" role="alert">
            {entryError}
          </p>
        ) : null}
        {!loading && photoEntries.length === 0 && !entryError ? (
          <p className="workspace-empty" role="status">
            No progress photos yet
          </p>
        ) : null}
        {earliest?.mediaAssetId && latest?.mediaAssetId ? (
          <div className="progress-compare">
            <figure className="progress-photo">
              <figcaption>Earlier photo · {formatObservedAt(earliest.observedAt)}</figcaption>
              <LinkedMedia
                mediaAssetId={earliest.mediaAssetId}
                label={`Earlier progress photo ${formatObservedAt(earliest.observedAt)}`}
              />
            </figure>
            <figure className="progress-photo">
              <figcaption>Latest photo · {formatObservedAt(latest.observedAt)}</figcaption>
              <LinkedMedia
                mediaAssetId={latest.mediaAssetId}
                label={`Latest progress photo ${formatObservedAt(latest.observedAt)}`}
              />
            </figure>
          </div>
        ) : null}
        {listedPhotos.length > 0 ? (
          <ul className="workspace-list">
            {listedPhotos.map((item) => (
              <li key={item.id} className="workspace-row progress-photo-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {item.title?.trim() || "Progress photo"}
                  </p>
                  <p className="workspace-row-meta">
                    <time dateTime={item.observedAt}>{formatObservedAt(item.observedAt)}</time>
                  </p>
                  {item.body ? <p className="muted">{item.body}</p> : null}
                  {item.mediaAssetId ? (
                    <LinkedMedia
                      mediaAssetId={item.mediaAssetId}
                      label={item.title?.trim() || "Progress photo"}
                    />
                  ) : (
                    <p className="muted">This progress photo has no media file.</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="workspace-card" aria-labelledby="notes-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Notes</p>
            <h2 id="notes-heading" className="workspace-card-title">
              Notes
            </h2>
          </div>
        </div>
        {!loading && notes.length === 0 && !entryError ? (
          <p className="workspace-empty" role="status">
            No notes yet
          </p>
        ) : null}
        {notes.length > 0 ? (
          <ul className="workspace-list">
            {notes.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {item.title?.trim() || measurementTypeLabel(item.entryType)}
                  </p>
                  <p className="workspace-row-meta">
                    <span className="workspace-kind">
                      {measurementTypeLabel(item.entryType)}
                    </span>
                    <time dateTime={item.observedAt}>{formatObservedAt(item.observedAt)}</time>
                  </p>
                  {item.body ? <p className="muted">{item.body}</p> : null}
                  {item.mediaAssetId ? (
                    <LinkedMedia
                      mediaAssetId={item.mediaAssetId}
                      label={item.title?.trim() || "Progress note photo"}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {entryCursor ? (
          <button
            type="button"
            className="button-secondary"
            disabled={loadingEntries}
            onClick={() => {
              void loadEntries(entryCursor);
            }}
          >
            {loadingEntries ? "Loading…" : "Load more entries"}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function MeasurementCard({
  type,
  points,
}: {
  type: MeasurementType | string;
  points: Measurement[];
}) {
  const label = measurementTypeLabel(type);
  return (
    <section className="workspace-card" aria-labelledby={`measurement-${type}`}>
      <h2 id={`measurement-${type}`} className="workspace-card-title">
        {label}
      </h2>
      {points.length === 0 ? (
        <p className="workspace-empty" role="status">
          No stored {label.toLowerCase()} measurements.
        </p>
      ) : (
        <MeasurementTrend
          label={label}
          points={points.map((item) => ({
            id: item.id,
            value: item.value,
            unit: item.unit,
            observedAt: item.observedAt,
          }))}
        />
      )}
    </section>
  );
}
