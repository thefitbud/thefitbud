import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  historyItemKindSchema,
  type HistoryItem,
  type HistoryItemKind,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import type { WorkspaceOutletContext } from "./workspaceContext";

const KIND_LABELS: Record<HistoryItemKind, string> = {
  onboarding_submitted: "Onboarding submitted",
  onboarding_reviewed: "Onboarding reviewed",
  configuration_activated: "Configuration",
  subscription_revision: "Subscription",
  plan_version: "Plan",
  workout_execution: "Workout",
  meal_compliance: "Diet",
  checkin_submitted: "Check-in submitted",
  checkin_reviewed: "Check-in reviewed",
  measurement: "Measurement",
  progress_entry: "Progress",
  progress_photo: "Progress photo",
  exception: "Exception",
  trainer_note: "Note",
  intervention: "Intervention",
};

function kindLabel(kind: HistoryItemKind): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function parseKind(value: string | null): HistoryItemKind | undefined {
  const parsed = historyItemKindSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function ClientHistoryPage() {
  const { relationshipId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutletContext>();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const kind = parseKind(searchParams.get("kind"));
  const occurredFrom = searchParams.get("occurredFrom") ?? "";
  const occurredTo = searchParams.get("occurredTo") ?? "";
  const filterKey = `${relationshipId}|${kind ?? ""}|${occurredFrom}|${occurredTo}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const listReady = loadedKey === filterKey && !loading;

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const id = ++requestId.current;
      const appending = Boolean(cursor);
      if (appending) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
      }
      setError(null);
      try {
        const result = await apiClient.listHistory(relationshipId, {
          cursor: cursor ?? undefined,
          limit: 30,
          kind,
          occurredFrom: civilDateStart(occurredFrom),
          occurredTo: civilDateEnd(occurredTo),
        });
        if (requestId.current !== id) return;
        setItems((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
        if (!appending) setLoadedKey(filterKey);
      } catch (err) {
        if (requestId.current !== id) return;
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load history.",
        );
        if (!appending) setLoadedKey(filterKey);
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filterKey, kind, occurredFrom, occurredTo, relationshipId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  function updateFilters(next: {
    kind?: HistoryItemKind | null;
    occurredFrom?: string;
    occurredTo?: string;
  }) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next.kind !== undefined) {
          if (next.kind) params.set("kind", next.kind);
          else params.delete("kind");
        }
        if (next.occurredFrom !== undefined) {
          if (next.occurredFrom) params.set("occurredFrom", next.occurredFrom);
          else params.delete("occurredFrom");
        }
        if (next.occurredTo !== undefined) {
          if (next.occurredTo) params.set("occurredTo", next.occurredTo);
          else params.delete("occurredTo");
        }
        return params;
      },
      { replace: true },
    );
  }

  const empty = !loading && items.length === 0 && !error;
  const filtersActive = Boolean(kind || occurredFrom || occurredTo);

  return (
    <div className="workspace-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="workspace-card" aria-labelledby="history-list-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Ledger</p>
            <h2 id="history-list-heading" className="workspace-card-title">
              {kind === "plan_version" ? "Plan history" : "Coaching history"}
            </h2>
            <p className="lede">
              {kind === "plan_version"
                ? "Published plan versions for this client. Kind is a single server filter."
                : "What happened, what changed, and what you did. Kind is a single server filter."}
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

        <form
          className="workspace-filters"
          aria-label="History filters"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="field">
            <span>Kind</span>
            <select
              value={kind ?? ""}
              onChange={(event) => {
                const next = parseKind(event.target.value);
                updateFilters({ kind: next ?? null });
              }}
            >
              <option value="">All history</option>
              {historyItemKindSchema.options.map((option) => (
                <option key={option} value={option}>
                  {kindLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={occurredFrom}
              onChange={(event) =>
                updateFilters({ occurredFrom: event.target.value })
              }
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={occurredTo}
              onChange={(event) =>
                updateFilters({ occurredTo: event.target.value })
              }
            />
          </label>
          {filtersActive ? (
            <button
              type="button"
              className="button-ghost"
              onClick={() =>
                updateFilters({
                  kind: null,
                  occurredFrom: "",
                  occurredTo: "",
                })
              }
            >
              Clear filters
            </button>
          ) : null}
        </form>

        {!listReady ? <p className="muted">Loading…</p> : null}

        {listReady && empty ? (
          <p className="workspace-empty" role="status">
            {filtersActive
              ? "No coaching history matches these filters."
              : "No coaching history yet. Onboarding, configuration, plans, execution, check-ins, notes, and interventions appear here as they happen."}
          </p>
        ) : null}

        {listReady && items.length > 0 ? (
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

        {listReady && nextCursor ? (
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
    </div>
  );
}
