import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import { apiClient } from "../lib/api";

type WorkspaceOutlet = { refreshEpoch?: number };

const KIND_LABELS: Record<HistoryItemKind, string> = {
  onboarding_submitted: "Onboarding",
  subscription_revision: "Subscription",
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
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
  }, [load, refreshEpoch]);

  const empty = !loading && items.length === 0 && !error;
  const kindFilter = searchParams.get("kind") as HistoryItemKind | null;
  const visibleItems = useMemo(() => {
    if (!kindFilter) return items;
    return items.filter((item) => item.kind === kindFilter);
  }, [items, kindFilter]);
  const filteredEmpty =
    !loading && items.length > 0 && visibleItems.length === 0;

  function setKindFilter(next: HistoryItemKind | null) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) {
          params.set("kind", next);
        } else {
          params.delete("kind");
        }
        return params;
      },
      { replace: true },
    );
  }

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
              <p className="workspace-kicker">Ledger</p>
              <h2 id="history-list-heading" className="workspace-card-title">
                {kindFilter === "plan_version"
                  ? "Plan history"
                  : "Coaching history"}
              </h2>
              <p className="lede">
                {kindFilter === "plan_version"
                  ? "Published plan versions for this client."
                  : "What happened, what changed, and what you did."}
              </p>
            </div>
            <div className="workspace-header-actions">
              {kindFilter ? (
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() => setKindFilter(null)}
                >
                  All history
                </button>
              ) : null}
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
          </div>
          {loading ? <p className="muted">Loading…</p> : null}

          {empty ? (
            <p className="workspace-empty" role="status">
              No coaching history yet. Onboarding, configuration, plans,
              execution, check-ins, notes, and interventions appear here as they
              happen.
            </p>
          ) : null}

          {filteredEmpty ? (
            <p className="workspace-empty" role="status">
              No matching history in the loaded page.{" "}
              <button
                type="button"
                className="button-link"
                onClick={() => setKindFilter(null)}
              >
                Clear filter
              </button>
            </p>
          ) : null}

          {visibleItems.length > 0 ? (
            <ol className="history-list">
              {visibleItems.map((item) => (
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
