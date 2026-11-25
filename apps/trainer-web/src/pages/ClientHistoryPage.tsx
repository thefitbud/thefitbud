import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, Search } from "lucide-react";
import { ApiClientError, userFacingMessage } from "@fitbud/api-client";
import type { HistoryItem, HistoryItemKind } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
} from "@fitbud/core";
import { useAuth } from "../auth/AuthProvider";
import { apiClient } from "../lib/api";
import { civilDateEnd, civilDateStart } from "../lib/dateFilters";
import {
  civilDaysAgo,
  firstName,
  groupHistoryByDay,
  historyKindIcon,
  historyKindTone,
  historyLine,
  type HistoryActor,
} from "../lib/history-ui";
import { ChipMenu } from "../components/activity/ChipMenu";
import { rangeLabel } from "../components/activity/activityUtils";
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

const RANGE_OPTIONS = [
  { value: "", label: "All time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

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
  const { refreshEpoch = 0, online = true, workspace = null } =
    useOutletContext<WorkspaceOutletContext>();
  const clientFirst = firstName(workspace?.header.traineeDisplayName);
  const trainerName = me?.trainerProfile?.displayName?.trim() || "You";
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
  const searchId = useId();
  const fromId = useId();
  const toId = useId();

  const kindGroup = parseKindGroup(searchParams.get("kind"));
  const selectedGroup = HISTORY_KIND_GROUPS.find((group) => group.id === kindGroup);
  // Range menu: a preset ("7", "30", "90") counts back from today in the
  // trainer’s timezone; "custom" uses the From and To dates in the URL.
  const rangeParam = searchParams.get("range") ?? "";
  const customFrom = searchParams.get("occurredFrom") ?? "";
  const customTo = searchParams.get("occurredTo") ?? "";
  const presetDays = ["7", "30", "90"].includes(rangeParam)
    ? Number(rangeParam)
    : 0;
  const rangeMode =
    presetDays > 0 ? rangeParam : rangeParam === "custom" || customFrom || customTo ? "custom" : "";
  const occurredFrom = presetDays > 0 ? civilDaysAgo(presetDays, timeZone) : rangeMode === "custom" ? customFrom : "";
  const occurredTo = presetDays > 0 ? "" : rangeMode === "custom" ? customTo : "";
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<"" | HistoryActor>("");
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
          message: userFacingMessage(err, {
            fallback: "Could not load history.",
          }),
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
    range?: string;
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
        if (next.range !== undefined) {
          if (next.range) params.set("range", next.range);
          else params.delete("range");
          // A preset (or "All time") replaces any custom dates.
          if (next.range !== "custom") {
            params.delete("occurredFrom");
            params.delete("occurredTo");
          }
        }
        if (next.occurredFrom !== undefined) {
          if (next.occurredFrom) params.set("occurredFrom", next.occurredFrom);
          else params.delete("occurredFrom");
          params.set("range", "custom");
        }
        if (next.occurredTo !== undefined) {
          if (next.occurredTo) params.set("occurredTo", next.occurredTo);
          else params.delete("occurredTo");
          params.set("range", "custom");
        }
        return params;
      },
      { replace: true },
    );
  }

  const now = new Date();
  const names = useMemo(
    () => ({ client: clientFirst, trainer: trainerName }),
    [clientFirst, trainerName],
  );
  // Search and "Who" narrow the loaded rows; type and dates go to the API.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const line = historyLine(item, names);
      if (who && line.actor !== who) return false;
      if (!needle) return true;
      const text = `${line.lead}${line.bold}${line.tail} ${line.meta}`.toLowerCase();
      return text.includes(needle);
    });
  }, [items, names, query, who]);
  const groups = useMemo(
    () => groupHistoryByDay(visible, timeZone, new Date()),
    [visible, timeZone],
  );

  const empty = listReady && items.length === 0 && !error;
  const noMatches = listReady && items.length > 0 && visible.length === 0;
  const filtersActive = Boolean(
    kindGroup || rangeMode || who || query.trim(),
  );
  const rangeChip = `${
    RANGE_OPTIONS.find((option) => option.value === rangeMode)?.label ?? "All time"
  }${
    rangeMode === "custom" && (occurredFrom || occurredTo)
      ? ` · ${rangeLabel(occurredFrom || occurredTo, occurredTo || occurredFrom)}`
      : ""
  }`;

  return (
    <div className="workspace-page history-page" data-testid="screen-TW-21">
      {!online ? (
        <p className="form-error" role="status">
          You&apos;re offline. History may be out of date until you reconnect.
        </p>
      ) : null}

      <h1 id="history-heading" className="sr-only">
        History
      </h1>

      <div className="history-toolbar" role="group" aria-label="History filters">
        <label className="history-search" htmlFor={searchId}>
          <Search className="ui-i" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder="Search history"
            aria-label="Search history"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ChipMenu
          label="Type"
          aria-label="Type"
          options={[
            { value: "", label: "All" },
            ...HISTORY_KIND_GROUPS.map((group) => ({
              value: group.id,
              label: group.label,
            })),
          ]}
          value={kindGroup ?? ""}
          onChange={(value) =>
            updateFilters({ kind: value ? (value as HistoryKindGroupId) : null })
          }
        />
        <ChipMenu
          label="Who"
          aria-label="Who"
          options={[
            { value: "", label: "Anyone" },
            { value: "client", label: clientFirst },
            { value: "trainer", label: "You" },
          ]}
          value={who}
          onChange={(value) => setWho(value as "" | HistoryActor)}
        />
        <div className="history-toolbar-end">
          {rangeMode === "custom" ? (
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
            </form>
          ) : null}
          <ChipMenu
            icon={<CalendarDays className="ui-i" aria-hidden="true" />}
            aria-label="Date range"
            options={RANGE_OPTIONS}
            value={rangeMode}
            valueLabel={rangeChip}
            onChange={(value) => updateFilters({ range: value })}
            alignEnd
          />
          {filtersActive ? (
            <button
              type="button"
              className="ui-btn ui-btn-ghost ui-btn-sm history-clear-filters"
              onClick={() => {
                setQuery("");
                setWho("");
                updateFilters({ kind: null, range: "" });
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error && !listReady ? (
        <ErrorState
          message={userFacingMessage(error)}
          kind={error.kind}
          requestId={error.requestId}
          screenId="TW-21"
          onRetry={() => void load()}
        />
      ) : null}

      {!listReady && !error ? <LoadingBlock label="Loading history…" /> : null}

      {listReady && error ? (
        <ErrorState
          message={userFacingMessage(error)}
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

      {noMatches ? (
        <p className="workspace-empty" role="status">
          Nothing matches those filters.
        </p>
      ) : null}

      {listReady && groups.length > 0 ? (
        <div className="history-card" data-testid="history-days">
          {groups.map((group) => (
            <section
              key={group.date}
              className="history-day"
              data-testid="history-day"
              aria-label={group.sub ? `${group.heading}, ${group.sub}` : group.heading}
            >
              <header className="history-day-head">
                <h2>{group.heading}</h2>
                {group.sub ? <p>{group.sub}</p> : null}
              </header>
              <ol className="history-rows">
                {group.items.map((item) => {
                  const line = historyLine(item, names);
                  const Icon = historyKindIcon(item.kind);
                  const tone = historyKindTone(item);
                  return (
                    <li
                      key={`${item.kind}:${item.id}`}
                      className="history-row"
                      data-testid="history-row"
                    >
                      <span className={`history-tile is-${tone}`} aria-hidden="true">
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <div className="history-row-main">
                        <p className="history-row-title">
                          {line.lead}
                          {line.bold ? <strong>{line.bold}</strong> : null}
                          {line.tail}
                        </p>
                        <p className="history-row-meta">{line.meta}</p>
                      </div>
                      <time
                        className="history-row-time"
                        dateTime={item.occurredAt}
                        title={formatHistoryWhen(item.occurredAt, timeZone, now)}
                      >
                        {formatClockTime(item.occurredAt, timeZone)}
                      </time>
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
          className="ui-btn ui-btn-secondary history-load-more"
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
