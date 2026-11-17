import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import { humanizeHistoryText } from "../lib/history-ui";
import {
  ErrorState,
  LoadingBlock,
  errorKindFromFailure,
  type ErrorKind,
} from "../components/StatePanels";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "./ClientHistoryPage.css";

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

/** Absolute civil datetime: "Fri 16 Oct, 9:30 pm". */
export function formatHistoryWhen(
  iso: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  const civil = formatLocalDate(new Date(iso), timeZone);
  const day = formatCivilDate(civil, { now });
  const clock = formatClockTime(iso, timeZone);
  return clock ? `${day}, ${clock}` : day;
}

function CivilDateFilter({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="history-civil-date" htmlFor={id}>
      <span className="history-civil-date-label">{label}</span>
      <span className="history-civil-date-control">
        <span
          className={
            value
              ? "history-civil-date-text"
              : "history-civil-date-text is-empty"
          }
          aria-hidden
        >
          {value ? formatCivilDate(value) : "Choose a date"}
        </span>
        <CalendarDays
          className="history-civil-date-icon"
          size={18}
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onClick={(event) => {
            try {
              event.currentTarget.showPicker?.();
            } catch {
              // showPicker is refused outside a user gesture; typing still works.
            }
          }}
        />
      </span>
    </label>
  );
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
  const kindSelectId = useId();
  const fromId = useId();
  const toId = useId();

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
  const now = new Date();

  return (
    <div className="workspace-page history-page" data-testid="screen-TW-21">
      {!online ? (
        <p className="form-error" role="status">
          You&apos;re offline. History may be out of date until you reconnect.
        </p>
      ) : null}

      <section
        className="workspace-card history-card"
        aria-labelledby="history-heading"
      >
        <header className="history-card-head">
          <h1 id="history-heading" className="workspace-page-title">
            History
          </h1>
          <label className="sr-only" htmlFor={kindSelectId}>
            Event kind
          </label>
          <select
            id={kindSelectId}
            className="history-kind-select"
            value={kindGroup ?? ""}
            aria-label="All events"
            onChange={(event) => {
              const value = event.target.value;
              updateFilters({
                kind: value
                  ? (value as HistoryKindGroupId)
                  : null,
              });
            }}
          >
            <option value="">All events</option>
            {HISTORY_KIND_GROUPS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </header>

        <form
          className="history-date-filters"
          aria-label="Date range"
          onSubmit={(event) => event.preventDefault()}
        >
          <CivilDateFilter
            id={fromId}
            label="From"
            value={occurredFrom}
            onChange={(value) => updateFilters({ occurredFrom: value })}
          />
          <CivilDateFilter
            id={toId}
            label="To"
            value={occurredTo}
            onChange={(value) => updateFilters({ occurredTo: value })}
          />
          {filtersActive ? (
            <button
              type="button"
              className="button-ghost history-clear-filters"
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
          <ol className="history-timeline">
            {items.map((item, index) => {
              const sentence = humanizeHistoryText(item.title);
              const when = formatHistoryWhen(item.occurredAt, timeZone, now);
              return (
                <li
                  key={`${item.kind}:${item.id}`}
                  className="history-timeline-item"
                >
                  <span
                    className={
                      index === 0
                        ? "history-timeline-dot is-accent"
                        : "history-timeline-dot"
                    }
                    aria-hidden="true"
                  />
                  <div className="history-timeline-body">
                    <span className="history-timeline-title">{sentence}</span>
                    <span className="history-timeline-sep" aria-hidden="true">
                      ·
                    </span>
                    <time
                      className="history-timeline-when"
                      dateTime={item.occurredAt}
                    >
                      {when}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
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
      </section>
    </div>
  );
}
