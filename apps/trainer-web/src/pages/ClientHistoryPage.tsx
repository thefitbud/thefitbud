import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import { formatRelative } from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import {
  groupHistoryByWeek,
  historyKindIcon,
  historySourceHref,
  historySourceLabel,
  humanizeHistoryText,
} from "../lib/history-ui";
import {
  ErrorState,
  LoadingBlock,
  errorKindFromFailure,
  type ErrorKind,
} from "../components/StatePanels";
import type { WorkspaceOutletContext } from "./workspaceContext";

/** Keep-it-simple kind groups (TW-21) instead of one pill per schema kind. */
const HISTORY_KIND_GROUPS = [
  {
    id: "workouts",
    label: "Workouts",
    kinds: ["workout_execution"] as const satisfies readonly HistoryItemKind[],
  },
  {
    id: "meals",
    label: "Meals",
    kinds: ["meal_compliance"] as const satisfies readonly HistoryItemKind[],
  },
  {
    id: "checkins",
    label: "Check-ins",
    kinds: ["checkin_submitted", "checkin_reviewed"] as const satisfies readonly HistoryItemKind[],
  },
  {
    id: "plans",
    label: "Plans",
    kinds: [
      "plan_version",
      "configuration_activated",
      "subscription_revision",
    ] as const satisfies readonly HistoryItemKind[],
  },
  {
    id: "account",
    label: "Account",
    kinds: [
      "onboarding_submitted",
      "onboarding_reviewed",
      "measurement",
      "progress_entry",
      "progress_photo",
      "exception",
      "trainer_note",
      "intervention",
    ] as const satisfies readonly HistoryItemKind[],
  },
] as const;

type HistoryKindGroupId = (typeof HISTORY_KIND_GROUPS)[number]["id"];

function parseKindGroup(value: string | null): HistoryKindGroupId | undefined {
  return HISTORY_KIND_GROUPS.find((group) => group.id === value)?.id;
}

export function ClientHistoryPage() {
  const { me } = useAuth();
  const timeZone =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const { relationshipId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { refreshEpoch = 0, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{
    message: string;
    kind: ErrorKind;
    requestId?: string | null;
  } | null>(null);
  const requestId = useRef(0);

  const kindGroup = parseKindGroup(searchParams.get("kind"));
  const selectedGroup = HISTORY_KIND_GROUPS.find((group) => group.id === kindGroup);
  const occurredFrom = searchParams.get("occurredFrom") ?? "";
  const occurredTo = searchParams.get("occurredTo") ?? "";
  const filterKey = `${relationshipId}|${kindGroup ?? ""}|${occurredFrom}|${occurredTo}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const listReady = loadedKey === filterKey && !loading;

  const load = useCallback(
    async (cursor?: string | null, opts?: { quiet?: boolean }) => {
      if (!relationshipId) return;
      if (!online && !cursor) {
        setError({
          message: "You're offline. Reconnect to load history.",
          kind: "network",
        });
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      const appending = Boolean(cursor);
      const quiet = opts?.quiet === true;
      if (appending) {
        setLoadingMore(true);
      } else if (!quiet) {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
      }
      setError(null);
      try {
        // Single-kind groups use the API kind filter; multi-kind groups filter
        // client-side after an unfiltered page (keep-it-simple).
        const apiKind =
          selectedGroup && selectedGroup.kinds.length === 1
            ? selectedGroup.kinds[0]
            : undefined;
        const result = await apiClient.listHistory(relationshipId, {
          cursor: cursor ?? undefined,
          limit: 30,
          kind: apiKind,
          occurredFrom: civilDateStart(occurredFrom),
          occurredTo: civilDateEnd(occurredTo),
        });
        if (requestId.current !== id) return;
        const allowed = selectedGroup
          ? new Set<string>(selectedGroup.kinds)
          : null;
        const pageItems = allowed
          ? result.items.filter((item) => allowed.has(item.kind))
          : result.items;
        setItems((current) =>
          appending ? [...current, ...pageItems] : pageItems,
        );
        setNextCursor(result.nextCursor);
        if (!appending) setLoadedKey(filterKey);
      } catch (err) {
        if (requestId.current !== id) return;
        const apiErr = err instanceof ApiClientError ? err : null;
        setError({
          message: apiErr?.message ?? "Could not load history.",
          kind: errorKindFromFailure({
            status: apiErr?.status,
            code: apiErr?.code,
            message: apiErr?.message,
          }),
          requestId: apiErr?.requestId ?? null,
        });
        if (!appending) setLoadedKey(filterKey);
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      filterKey,
      occurredFrom,
      occurredTo,
      online,
      relationshipId,
      selectedGroup,
    ],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  useEffect(() => {
    const onFocus = () => {
      void load(undefined, { quiet: true });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  function updateFilters(next: {
    kind?: HistoryKindGroupId | null;
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

  const empty = listReady && items.length === 0 && !error;
  const filtersActive = Boolean(kindGroup || occurredFrom || occurredTo);
  const weekGroups = groupHistoryByWeek(items, timeZone);

  return (
    <div className="workspace-page history-page" data-testid="screen-TW-21">
      <header className="history-page-head">
        <h1 className="workspace-page-title">History</h1>
        <p className="lede muted">
          A readable ledger of plans, check-ins, notes, and coaching events for
          this client.
        </p>
      </header>

      {!online ? (
        <p className="form-error" role="status">
          You&apos;re offline. History may be out of date until you reconnect.
        </p>
      ) : null}

      <section className="workspace-card" aria-labelledby="history-filters-heading">
        <h2 id="history-filters-heading" className="sr-only">
          History filters
        </h2>

        <div className="history-kind-pills" role="group" aria-label="Kind">
          <button
            type="button"
            className={!kindGroup ? "filter-pill is-on" : "filter-pill"}
            aria-pressed={!kindGroup}
            onClick={() => updateFilters({ kind: null })}
          >
            All
          </button>
          {HISTORY_KIND_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={
                kindGroup === group.id ? "filter-pill is-on" : "filter-pill"
              }
              aria-pressed={kindGroup === group.id}
              onClick={() =>
                updateFilters({
                  kind: kindGroup === group.id ? null : group.id,
                })
              }
            >
              {group.label}
            </button>
          ))}
        </div>

        <form
          className="workspace-filters history-date-filters"
          aria-label="Date range"
          onSubmit={(event) => event.preventDefault()}
        >
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
      </section>

      {error && !listReady ? (
        <ErrorState
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          screenId="TW-21"
          onRetry={() => void load()}
        />
      ) : null}

      {!listReady && !error ? <LoadingBlock label="Loading history…" /> : null}

      {listReady && error ? (
        <ErrorState
          message={error.message}
          kind={error.kind}
          requestId={error.requestId}
          screenId="TW-21"
          onRetry={() => void load()}
        />
      ) : null}

      {empty ? (
        <p className="workspace-empty" role="status">
          Nothing recorded yet.
        </p>
      ) : null}

      {listReady && items.length > 0 ? (
        <div className="history-week-groups">
          {weekGroups.map((group) => (
            <section
              key={group.weekStart}
              className="history-week-group workspace-card"
              aria-labelledby={`week-${group.weekStart}`}
            >
              <h2 id={`week-${group.weekStart}`} className="history-week-heading">
                {group.heading}
              </h2>
              <ol className="history-list history-row-list">
                {group.items.map((item) => {
                  const Icon = historyKindIcon(item.kind);
                  const href = historySourceHref(relationshipId, item);
                  const sentence = humanizeHistoryText(item.title);
                  return (
                    <li key={`${item.kind}:${item.id}`} className="history-row">
                      <span className="history-row-icon" aria-hidden="true">
                        <Icon size={20} strokeWidth={1.75} />
                      </span>
                      <div className="history-row-body">
                        <p className="history-row-sentence">{sentence}</p>
                        <div className="history-row-meta">
                          <time dateTime={item.occurredAt}>
                            {formatRelative(item.occurredAt)}
                          </time>
                          {href ? (
                            <Link className="text-link" to={href}>
                              {historySourceLabel(item)}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      ) : null}

      {listReady && nextCursor ? (
        <button
          type="button"
          className="button-secondary history-load-more"
          disabled={loadingMore || !online}
          onClick={() => {
            void load(nextCursor);
          }}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
