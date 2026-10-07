import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { AttentionItem } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

export function HomePage() {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationshipIds, setRelationshipIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attention, relationships] = await Promise.all([
        apiClient.getAttentionFeed({ limit: 30 }),
        apiClient.listRelationships().catch(() => ({ items: [], nextCursor: null })),
      ]);
      setItems(attention.items);
      setRelationshipIds(relationships.items.map((item) => item.id));
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load attention feed.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Selected realtime: refresh attention when any owned relationship emits a hint.
  useRealtimeHints(apiClient, relationshipIds, () => {
    void load();
  });

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Attention</h1>
          <p className="lede">
            Deterministic exceptions from configured thresholds — who needs you
            today, and why.
          </p>
        </div>
        <Link className="button-primary" to="/clients/add">
          Add Client
        </Link>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted" aria-busy="true" aria-live="polite">
          Loading attention…
        </p>
      ) : items.length === 0 ? (
        <div className="empty-state" role="status">
          <h2>No attention items</h2>
          <p>
            FitBud only surfaces meaningful exceptions from configured
            expectations and observations. Invite a client to begin onboarding.
          </p>
          <Link className="button-secondary" to="/clients">
            Open clients
          </Link>
        </div>
      ) : (
        <ul className="attention-list" aria-label="Attention items">
          {items.map((item) => (
            <li key={item.exception.id} className="attention-item">
              <div>
                <p className="attention-who">
                  {item.traineeDisplayName ?? "Trainee"}
                </p>
                <p>
                  <span
                    className={`status-pill status-${item.exception.status}`}
                  >
                    {statusLabel(item.exception.status)}
                  </span>{" "}
                  · {typeLabel(item.exception.type)}
                </p>
                <p className="muted">{item.exception.summary}</p>
              </div>
              <Link
                className="button-primary"
                to={`/exceptions/${item.exception.id}`}
                aria-label={`Review ${item.traineeDisplayName ?? "trainee"} exception`}
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
