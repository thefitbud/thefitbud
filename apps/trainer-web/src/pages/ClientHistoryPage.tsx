import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import { apiClient } from "../lib/api";

const KIND_LABELS: Record<HistoryItemKind, string> = {
  intake_submitted: "Onboarding",
  onboarding_reviewed: "Onboarding",
  configuration_activated: "Configuration",
  plan_version: "Plan",
  workout_execution: "Workout",
  meal_compliance: "Diet",
  checkin_submitted: "Check-in",
  checkin_reviewed: "Check-in",
  measurement: "Progress",
  progress_entry: "Progress",
  progress_photo: "Progress",
  exception: "Exception",
  trainer_note: "Note",
  intervention: "Intervention",
};

function kindLabel(kind: HistoryItemKind): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

export function ClientHistoryPage() {
  const { relationshipId = "" } = useParams();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const appending = Boolean(cursor);
      if (appending) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await apiClient.listHistory(relationshipId, {
          cursor: cursor ?? undefined,
          limit: 30,
        });
        setItems((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
      } catch (err) {
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load history.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [relationshipId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const empty = !loading && items.length === 0 && !error;

  return (
    <div className="workspace-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {!error || items.length > 0 ? (
        <section className="workspace-card" aria-labelledby="history-list-heading">
          <div className="workspace-card-head">
            <div>
              <h2 id="history-list-heading" className="workspace-card-title">
                Coaching history
              </h2>
              <p className="lede">
                What happened, what changed, and what you did.
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
          {loading ? <p className="muted">Loading…</p> : null}

          {empty ? (
            <p className="workspace-empty" role="status">
              No coaching history yet. Onboarding, configuration, plans,
              execution, check-ins, notes, and interventions appear here as they
              happen.
            </p>
          ) : null}

          {items.length > 0 ? (
            <ol className="history-list">
              {items.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="history-item">
                  <div className="history-item-meta">
                    <span className="workspace-kind">{kindLabel(item.kind)}</span>
                    <time dateTime={item.occurredAt}>
                      {new Date(item.occurredAt).toLocaleString()}
                    </time>
                    {item.status ? (
                      <span className="history-status">
                        {item.status.replace(/_/g, " ")}
                      </span>
                    ) : null}
                  </div>
                  <strong className="history-title">{item.title}</strong>
                  <p className="muted history-summary">{item.summary}</p>
                </li>
              ))}
            </ol>
          ) : null}

          {nextCursor ? (
            <button
              type="button"
              className="button-secondary"
              disabled={loadingMore}
              onClick={() => {
                void load(nextCursor);
              }}
            >
              {loadingMore ? "Loading…" : "Load older"}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
