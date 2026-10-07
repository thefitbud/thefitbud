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
  const empty =
    !loading &&
    measurements.length === 0 &&
    entries.length === 0 &&
    media.length === 0;

  return (
    <div className="workspace-panel">
      <div className="page-header compact">
        <div>
          <h2>Progress</h2>
          <p className="muted">
            Stored measurements and photos for this client. No invented charts.
          </p>
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

      {error ? <p className="form-error">{error}</p> : null}
      {loading ? <p className="muted">Loading…</p> : null}

      {empty ? (
        <p className="empty-state">
          No measurements or photos stored yet. Values appear when the trainee
          logs them or submits a check-in with body weight.
        </p>
      ) : null}

      {measurements.length > 0 ? (
        <section className="stack-md">
          <h3>Measurements</h3>
          <ul className="plain-list">
            {measurements.map((item) => (
              <li key={item.id}>
                <strong>
                  {formatType(item.type)} · {item.value} {item.unit}
                </strong>
                <span className="muted">
                  {" "}
                  · {new Date(item.observedAt).toLocaleString()} · {item.source}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {entries.length > 0 ? (
        <section className="stack-md">
          <h3>Progress entries</h3>
          <ul className="plain-list">
            {entries.map((item) => (
              <li key={item.id}>
                <strong>{item.title ?? formatType(item.entryType)}</strong>
                <span className="muted">
                  {" "}
                  · {new Date(item.observedAt).toLocaleString()}
                </span>
                {item.body ? <p className="muted">{item.body}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {media.length > 0 ? (
        <section className="stack-md">
          <h3>Photos on file</h3>
          <ul className="plain-list">
            {media.map((item) => (
              <li key={item.id}>
                <strong>{formatType(item.mediaType)}</strong>
                <span className="muted">
                  {" "}
                  · {item.status}
                  {item.uploadedAt
                    ? ` · ${new Date(item.uploadedAt).toLocaleString()}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
