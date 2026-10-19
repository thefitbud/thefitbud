import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  AdherenceState,
  ClientDirectoryItem,
  OnboardingStatus,
} from "@fitbud/contracts";
import { ClientRow } from "../components/ClientRow";
import { FilterBar } from "../components/FilterBar";
import { ErrorState, LoadingBlock } from "../components/StatePanels";
import { Button } from "../components/Button";
import { apiClient } from "../lib/api";
import {
  CLIENT_ADHERENCE_FILTERS,
  CLIENT_RENEWAL_FILTERS,
  CLIENT_STATUS_FILTERS,
  clientDirectoryFilterKey,
  clientDirectoryFiltersFromKey,
  clientDirectoryListQuery,
  distinctGoalShorts,
  emptyClientDirectoryFilters,
  hasClientDirectoryFilters,
  pageClientDirectory,
  parseClientDirectoryFilters,
  renewalFilterLabel,
  toggleClientDirectoryValue,
  writeClientDirectoryFilters,
  type ClientDirectoryFilters,
  type RenewalFilter,
} from "../lib/clients";
import { useMediaQuery } from "../hooks/useMediaQuery";

const DIRECTORY_PAGE_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 250;

/** Compact FilterBar labels so pills fit at 1280 without clipping. */
function shortStatusLabel(value: OnboardingStatus): string {
  switch (value) {
    case "invited":
      return "Invited";
    case "onboarding_pending":
      return "Pending";
    case "onboarding_submitted":
      return "Submitted";
    case "coaching_ready":
      return "Ready";
    case "active":
      return "Active";
    case "ended":
      return "Ended";
    default:
      return value;
  }
}

function shortAdherenceLabel(value: AdherenceState): string {
  switch (value) {
    case "on_track":
      return "On track";
    case "needs_attention":
      return "Attention";
    case "no_recent_data":
      return "No data";
    case "not_available":
      return "N/A";
    default:
      return value;
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseClientDirectoryFilters(searchParams);
  const isNarrow = useMediaQuery("(max-width: 1023px)");
  const [queryForRequest, setQueryForRequest] = useState(filters.q);
  const [items, setItems] = useState<ClientDirectoryItem[]>([]);
  const [facets, setFacets] = useState<{
    status?: Record<string, number>;
    adherence?: Record<string, number>;
    renewal?: Record<string, number>;
  } | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [goalOptions, setGoalOptions] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
        setFacets(page.facets ?? null);
        setSelectedIndex(0);
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
    void pageClientDirectory((query) => apiClient.listClients(query), {
      ...emptyClientDirectoryFilters(),
      segment: "current",
    })
      .then((page) => {
        if (!cancelled) setGoalOptions(distinctGoalShorts(page));
      })
      .catch(() => {
        if (!cancelled) setGoalOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateFilters(
    change: (current: ClientDirectoryFilters) => ClientDirectoryFilters,
    options?: { replace?: boolean },
  ) {
    setSearchParams(
      (current) =>
        writeClientDirectoryFilters(
          current,
          change(parseClientDirectoryFilters(current)),
        ),
      // Push pill/segment changes so Back restores prior filters (TW-06).
      // Debounced search typing may still replace to avoid history spam.
      { replace: options?.replace ?? false },
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
      } else if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter" && items[selectedIndex]) {
        const row = document.querySelectorAll("[data-client-row]")[
          selectedIndex
        ] as HTMLElement | undefined;
        row?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, selectedIndex]);

  const goalChoices = distinctGoalShorts([
    ...goalOptions.map((goalShort) => ({ goalShort })),
    ...filters.goal.map((goalShort) => ({ goalShort })),
  ]);
  const filtersActive = hasClientDirectoryFilters(filters);
  const segmentCount =
    filters.segment === "ended"
      ? (facets?.status?.ended ?? items.length)
      : (facets?.status?.active ?? 0);
  const segmentLabel =
    filters.segment === "ended" ? "ended" : "active";

  return (
    <section className="page clients-page" data-testid="screen-TW-06">
      <header className="page-header clients-header">
        <div>
          <h1>
            Clients{" "}
            <span className="clients-count muted">
              {segmentCount} {segmentLabel}
            </span>
          </h1>
        </div>
        <Link to="/clients/add" className="button-primary">
          Add client
        </Link>
      </header>

      <div
        className="segment-control"
        role="tablist"
        aria-label="Client list segment"
      >
        <button
          type="button"
          role="tab"
          aria-selected={filters.segment === "current"}
          className={
            filters.segment === "current"
              ? "segment-tab is-selected"
              : "segment-tab"
          }
          onClick={() =>
            updateFilters((f) => ({
              ...f,
              segment: "current",
              status: f.status.filter((s) => s !== "ended"),
            }))
          }
        >
          Current
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filters.segment === "ended"}
          className={
            filters.segment === "ended"
              ? "segment-tab is-selected"
              : "segment-tab"
          }
          onClick={() =>
            updateFilters((f) => ({
              ...f,
              segment: "ended",
              status: ["ended"],
            }))
          }
        >
          Ended
        </button>
      </div>

      <FilterBar
        search={filters.q}
        onSearchChange={(q) =>
          updateFilters((f) => ({ ...f, q }), { replace: true })
        }
        showClear={filtersActive}
        onClear={() =>
          updateFilters((f) => ({
            ...emptyClientDirectoryFilters(),
            segment: f.segment,
            status: f.segment === "ended" ? ["ended"] : [],
          }))
        }
        status={{
          label: "Status",
          selected: filters.status.filter((s) => s !== "ended"),
          options: CLIENT_STATUS_FILTERS.map((value) => ({
            value,
            label: shortStatusLabel(value),
            count: facets?.status?.[value],
          })),
          onToggle: (value) =>
            updateFilters((f) => ({
              ...f,
              status: toggleClientDirectoryValue(
                CLIENT_STATUS_FILTERS,
                f.status.filter((s) => s !== "ended"),
                value as OnboardingStatus,
              ),
            })),
        }}
        adherence={{
          label: "Adherence",
          selected: filters.adherenceState,
          options: CLIENT_ADHERENCE_FILTERS.map((value) => ({
            value,
            label: shortAdherenceLabel(value),
            count: facets?.adherence?.[value],
          })),
          onToggle: (value) =>
            updateFilters((f) => ({
              ...f,
              adherenceState: toggleClientDirectoryValue(
                CLIENT_ADHERENCE_FILTERS,
                f.adherenceState,
                value as (typeof CLIENT_ADHERENCE_FILTERS)[number],
              ),
            })),
        }}
        goal={{
          label: "Goal",
          selected: filters.goal,
          options: goalChoices.map((value) => ({ value, label: value })),
          onToggle: (value) =>
            updateFilters((f) => ({
              ...f,
              goal: toggleClientDirectoryValue(goalChoices, f.goal, value),
            })),
        }}
        renewal={{
          label: "Renewal",
          selected: filters.renewal,
          options: CLIENT_RENEWAL_FILTERS.map((value) => ({
            value,
            label: renewalFilterLabel(value),
            count: facets?.renewal?.[value],
          })),
          onToggle: (value) =>
            updateFilters((f) => ({
              ...f,
              renewal: toggleClientDirectoryValue(
                CLIENT_RENEWAL_FILTERS,
                f.renewal,
                value as RenewalFilter,
              ),
            })),
        }}
      />

      {loading && items.length === 0 ? <LoadingBlock /> : null}

      {error && items.length === 0 ? (
        <ErrorState
          title="Could not load clients"
          message={error}
          onRetry={() => setReloadNonce((n) => n + 1)}
        />
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <div className="empty-state" data-testid="clients-empty">
          {filtersActive ? (
            <>
              <h2>No clients match these filters</h2>
              <Button
                variant="secondary"
                onClick={() =>
                  updateFilters((f) => ({
                    ...emptyClientDirectoryFilters(),
                    segment: f.segment,
                    status: f.segment === "ended" ? ["ended"] : [],
                  }))
                }
              >
                Clear filters
              </Button>
            </>
          ) : (
            <>
              <h2>No clients yet</h2>
              <p>Invite your first client to start coaching.</p>
              <Link to="/clients/add" className="button-primary">
                Add client
              </Link>
            </>
          )}
        </div>
      ) : null}

      {items.length > 0 ? (
        isNarrow ? (
          <div className="client-card-stack">
            {items.map((item, index) => (
              <ClientRow
                key={
                  item.relationshipId ??
                  item.invitationId ??
                  `${item.traineeDisplayName}-${index}`
                }
                item={item}
                layout="card"
                selected={index === selectedIndex}
              />
            ))}
          </div>
        ) : (
          <div className="clients-table-wrap card">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Adherence</th>
                  <th>Next check-in</th>
                  <th>Plan</th>
                  <th>Renewal</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <ClientRow
                    key={
                      item.relationshipId ??
                      item.invitationId ??
                      `${item.traineeDisplayName}-${index}`
                    }
                    item={item}
                    selected={index === selectedIndex}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {nextCursor ? (
        <div className="load-more-row">
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={() => loadMore()}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      {error && items.length > 0 ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
