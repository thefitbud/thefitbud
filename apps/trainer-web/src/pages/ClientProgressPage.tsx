import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ProgressSummary } from "@fitbud/contracts";
import { apiClient } from "../lib/api";

function formatType(value: string): string {
  return value.replace(/_/g, " ");
}

export function ClientProgressPage() {
  const { relationshipId = "" } = useParams();
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getProgressSummary(relationshipId);
      setSummary(result);
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
  }, [load]);

  const measurements = summary?.measurements ?? [];
  const entries = summary?.entries ?? [];
  const media = summary?.media ?? [];

  return (
    <div className="workspace-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="muted">Loading…</p> : null}

      {!loading && summary ? (
        <>
          <section className="workspace-card" aria-labelledby="measurements-heading">
            <div className="workspace-card-head">
              <div>
                <h2 id="measurements-heading" className="workspace-card-title">
                  Measurements
                </h2>
                <p className="lede">Stored measurements for this client.</p>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void load();
                }}
              >
                Refresh
              </button>
            </div>
            {measurements.length === 0 ? (
              <p className="workspace-empty" role="status">
                No measurements yet
              </p>
            ) : (
              <ul className="workspace-list">
                {measurements.map((item) => (
                  <li key={item.id} className="workspace-row">
                    <div className="workspace-row-copy">
                      <p className="workspace-row-title">
                        {formatType(item.type)} · {item.value} {item.unit}
                      </p>
                      <p className="workspace-row-meta">
                        <span>{new Date(item.observedAt).toLocaleString()}</span>
                        <span className="workspace-kind">{item.source}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="entries-heading">
            <div className="workspace-card-head">
              <div>
                <h2 id="entries-heading" className="workspace-card-title">
                  Progress entries
                </h2>
                <p className="lede">Stored progress notes for this client.</p>
              </div>
            </div>
            {entries.length === 0 ? (
              <p className="workspace-empty" role="status">
                No progress entries yet
              </p>
            ) : (
              <ul className="workspace-list">
                {entries.map((item) => (
                  <li key={item.id} className="workspace-row">
                    <div className="workspace-row-copy">
                      <p className="workspace-row-title">
                        {item.title ?? formatType(item.entryType)}
                      </p>
                      <p className="workspace-row-meta">
                        <span className="workspace-kind">
                          {formatType(item.entryType)}
                        </span>
                        <span>{new Date(item.observedAt).toLocaleString()}</span>
                      </p>
                      {item.body ? <p className="muted">{item.body}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="photos-heading">
            <div className="workspace-card-head">
              <div>
                <h2 id="photos-heading" className="workspace-card-title">
                  Photos on file
                </h2>
                <p className="lede">
                  Photo records on file, listed with type and status.
                </p>
              </div>
            </div>
            {media.length === 0 ? (
              <p className="workspace-empty" role="status">
                No photos on file yet
              </p>
            ) : (
              <ul className="workspace-list">
                {media.map((item) => (
                  <li key={item.id} className="workspace-row">
                    <div className="workspace-row-copy">
                      <p className="workspace-row-title">
                        {formatType(item.mediaType)}
                      </p>
                      <p className="workspace-row-meta">
                        <span className={`status-pill status-${item.status}`}>
                          {item.status.replace(/_/g, " ")}
                        </span>
                        {item.uploadedAt ? (
                          <span>{new Date(item.uploadedAt).toLocaleString()}</span>
                        ) : null}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
