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
    <div className="workspace-panel">
      <div className="page-header compact">
        <div>
          <h2>History</h2>
          <p className="muted">
            Readable longitudinal coaching context — what happened, what
            changed, and what you did. Not an internal event dump.
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
          No coaching history yet. Onboarding, configuration, plans, execution,
          check-ins, notes, and interventions appear here as they happen.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ol className="history-list">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="history-item">
              <div className="history-item-meta">
                <span className="history-kind">{kindLabel(item.kind)}</span>
                <time dateTime={item.occurredAt}>
                  {new Date(item.occurredAt).toLocaleString()}
                </time>
              </div>
              <strong className="history-title">{item.title}</strong>
              <p className="muted history-summary">{item.summary}</p>
              {item.status ? (
                <p className="history-status">
                  Status: {item.status.replace(/_/g, " ")}
                </p>
              ) : null}
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
    </div>
  );
}
