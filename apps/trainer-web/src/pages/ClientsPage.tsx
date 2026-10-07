import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { AdherenceState, ClientDirectoryItem } from "@fitbud/contracts";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import {
  CLIENT_ADHERENCE_FILTERS,
  CLIENT_STATUS_FILTERS,
  adherenceStateLabel,
  checkinStatusLabel,
  clientDirectoryFilterKey,
  clientDirectoryFiltersFromKey,
  clientDirectoryItemKey,
  clientDirectoryListQuery,
  directoryWorkspaceHref,
  distinctGoalShorts,
  emptyClientDirectoryFilters,
  hasClientDirectoryFilters,
  onboardingStatusLabel,
  pageClientDirectory,
  parseClientDirectoryFilters,
  primaryActionForStatus,
  toggleClientDirectoryValue,
  writeClientDirectoryFilters,
  type ClientDirectoryFilters,
} from "../lib/clients";

const DIRECTORY_PAGE_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 250;

function formatCivilDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const first = words[0];
  const second = words[1];
  if (first && second) {
    const letters = `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
    return letters || "CL";
  }
  const compact = words[0] ?? "";
  return (compact.slice(0, 2) || "CL").toUpperCase();
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseClientDirectoryFilters(searchParams);
  const [queryForRequest, setQueryForRequest] = useState(filters.q);
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [goalOptions, setGoalOptions] = useState<string[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [goalReload, setGoalReload] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (filters.q === queryForRequest) return;
    if (!filters.q) {
      setQueryForRequest("");
      return;
    }
    const timeout = window.setTimeout(
      () => setQueryForRequest(filters.q),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [filters.q, queryForRequest]);

  const requestKey = clientDirectoryFilterKey({
    ...filters,
    q: queryForRequest,
  });

  useEffect(() => {
    const id = ++generation.current;
    const active = clientDirectoryFiltersFromKey(requestKey);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setItems([]);
    setNextCursor(null);
    void apiClient
      .listClients(
        clientDirectoryListQuery(active, { limit: DIRECTORY_PAGE_LIMIT }),
      )
      .then((page) => {
        if (generation.current !== id) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (generation.current !== id) return;
        setError(errorMessage(err, "Could not load clients."));
      })
      .finally(() => {
        if (generation.current === id) setLoading(false);
      });
    return () => {
      generation.current += 1;
    };
  }, [requestKey, reloadNonce]);

  useEffect(() => {
    let cancelled = false;
    setGoalsLoading(true);
    setGoalsError(null);
    // Goal pills page the directory with no goal filter. There is no facet endpoint.
    void pageClientDirectory((query) => apiClient.listClients(query))
      .then((page) => {
        if (cancelled) return;
        setGoalOptions(distinctGoalShorts(page));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setGoalOptions([]);
        setGoalsError(errorMessage(err, "Could not load goals."));
      })
      .finally(() => {
        if (!cancelled) setGoalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [goalReload]);

  function updateFilters(
    change: (current: ClientDirectoryFilters) => ClientDirectoryFilters,
  ) {
    setSearchParams(
      (current) =>
        writeClientDirectoryFilters(
          current,
          change(parseClientDirectoryFilters(current)),
        ),
      { replace: true },
    );
  }

  function loadMore() {
    const cursor = nextCursor;
    const id = generation.current;
    if (!cursor || loading || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    void apiClient
      .listClients(
        clientDirectoryListQuery(clientDirectoryFiltersFromKey(requestKey), {
          cursor,
          limit: DIRECTORY_PAGE_LIMIT,
        }),
      )
      .then((page) => {
        if (generation.current !== id) return;
        setItems((current) => [...current, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch((err: unknown) => {
        if (generation.current !== id) return;
        setError(errorMessage(err, "Could not load more clients."));
      })
      .finally(() => {
        if (generation.current === id) setLoadingMore(false);
      });
  }

  const goalChoices = distinctGoalShorts([
    ...goalOptions.map((goalShort) => ({ goalShort })),
    ...filters.goal.map((goalShort) => ({ goalShort })),
  ]);
  const filtersActive = hasClientDirectoryFilters(filters);

  return (
    <section className="page clients-page">
      <header className="page-header">
        <div>
          <h1 className="roster-title">Client Roster</h1>
          <p className="lede">
            Invite a trainee, then follow onboarding until coaching is
            configured and a plan is published.
          </p>
        </div>
        <Link to="/clients/add" className="button-primary">
          + Add Client
        </Link>
      </header>

      <div className="roster-card">
        <div className="roster-toolbar">
          <label className="roster-search">
            <span className="sr-only">Search clients</span>
            <SearchIcon />
            <input
              id="clients-search"
              type="search"
              value={filters.q}
              onChange={(event) =>
                updateFilters((current) => ({
                  ...current,
                  q: event.target.value,
                }))
              }
              placeholder="Name or email"
              autoComplete="off"
            />
          </label>
          <div className="roster-filters">
            <FilterGroup label="Status">
              {CLIENT_STATUS_FILTERS.map((status) => (
                <FilterPill
                  key={status}
                  pressed={filters.status.includes(status)}
                  onClick={() =>
                    updateFilters((current) => ({
                      ...current,
                      status: toggleClientDirectoryValue(
                        CLIENT_STATUS_FILTERS,
                        current.status,
                        status,
                      ),
                    }))
                  }
                >
                  {onboardingStatusLabel(status)}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Adherence">
              {CLIENT_ADHERENCE_FILTERS.map((state) => (
                <FilterPill
                  key={state}
                  pressed={filters.adherenceState.includes(state)}
                  onClick={() =>
                    updateFilters((current) => ({
                      ...current,
                      adherenceState: toggleClientDirectoryValue(
                        CLIENT_ADHERENCE_FILTERS,
                        current.adherenceState,
                        state,
                      ),
                    }))
                  }
                >
                  {adherenceStateLabel(state)}
                </FilterPill>
              ))}
            </FilterGroup>
            <FilterGroup label="Goal">
              {goalsLoading && goalChoices.length === 0 ? (
                <span className="muted">Loading goals…</span>
              ) : goalChoices.length === 0 ? (
                <span className="muted">No short goals yet</span>
              ) : (
                goalChoices.map((goal) => (
                  <FilterPill
                    key={goal}
                    pressed={filters.goal.includes(goal)}
                    onClick={() =>
                      updateFilters((current) => ({
                        ...current,
                        goal: toggleClientDirectoryValue(
                          goalChoices,
                          current.goal,
                          goal,
                        ),
                      }))
                    }
                  >
                    {goal}
                  </FilterPill>
                ))
              )}
            </FilterGroup>
            {filtersActive ? (
              <button
                type="button"
                className="button-link"
                onClick={() => updateFilters(() => emptyClientDirectoryFilters())}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          {goalsError ? (
            <p className="form-error" role="alert">
              {goalsError}{" "}
              <button
                type="button"
                className="button-link"
                onClick={() => setGoalReload((current) => current + 1)}
              >
                Retry
              </button>
            </p>
          ) : null}
        </div>

        {loading ? (
          <p className="roster-status" aria-busy="true">
            Loading clients…
          </p>
        ) : error && items.length === 0 ? (
          <div className="empty-state" role="alert">
            <h2>Could not load clients</h2>
            <p>{error}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setReloadNonce((current) => current + 1)}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" role="status">
            {filtersActive ? (
              <>
                <h2>No matching clients</h2>
                <p>No clients match these filters.</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() =>
                    updateFilters(() => emptyClientDirectoryFilters())
                  }
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <h2>No clients yet</h2>
                <p>Invite a trainee to start onboarding.</p>
                <Link to="/clients/add" className="button-primary">
                  + Add Client
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            {error ? (
              <p className="form-error roster-banner" role="alert">
                {error}{" "}
                <button type="button" className="button-link" onClick={loadMore}>
                  Retry
                </button>
              </p>
            ) : null}
            <div className="roster-scroll">
              <table className="roster-table" aria-label="Clients">
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Status</th>
                    <th scope="col">Next check-in</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Adherence</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <ClientRow key={clientDirectoryItemKey(item)} item={item} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {nextCursor && !loading ? (
          <div className="roster-more">
            <button
              type="button"
              className="button-secondary"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = `client-filter-${label.toLowerCase()}`;
  return (
    <div className="roster-filter-row">
      <span id={id} className="roster-filter-label">
        {label}
      </span>
      <div className="segment" role="group" aria-labelledby={id}>
        {children}
      </div>
    </div>
  );
}

function FilterPill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={pressed ? "segment-btn is-on" : "segment-btn"}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      className="roster-search-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClientRow({ item }: { item: ClientDirectoryItem }) {
  const action = primaryActionForStatus(item.status);
  const href = directoryWorkspaceHref(item);
  const goal = item.goalShort?.trim() || "No short goal";

  return (
    <tr>
      <td>
        <div className="roster-person">
          <span className="avatar" aria-hidden="true">
            {initials(item.traineeDisplayName)}
          </span>
          <div className="roster-person-copy">
            <p className="client-name">
              <span>{item.traineeDisplayName}</span>
            </p>
            <p className="client-subtitle">{goal}</p>
          </div>
        </div>
      </td>
      <td>
        <StatusBadge status={item.status} />
      </td>
      <td>
        {item.nextCheckin ? (
          <div className="roster-checkin">
            <time dateTime={item.nextCheckin.localDate}>
              {formatCivilDate(item.nextCheckin.localDate)}
            </time>
            <span className={`status-pill status-${item.nextCheckin.status}`}>
              {checkinStatusLabel(item.nextCheckin.status)}
            </span>
          </div>
        ) : (
          <span className="muted">No check-in</span>
        )}
      </td>
      <td>
        <span className="roster-plan">
          {item.effectivePlan?.title ?? "No effective plan"}
        </span>
      </td>
      <td>
        <AdherenceLabel state={item.adherenceState} />
      </td>
      <td>
        {href ? (
          <Link
            to={href}
            className="button-secondary"
            aria-label={`${action.label} for ${item.traineeDisplayName}`}
          >
            {action.label}
          </Link>
        ) : (
          <span className="muted-action">{action.label}</span>
        )}
      </td>
    </tr>
  );
}

function AdherenceLabel({ state }: { state: AdherenceState }) {
  return (
    <span className={`status-pill adherence-${state}`}>
      {adherenceStateLabel(state)}
    </span>
  );
}
