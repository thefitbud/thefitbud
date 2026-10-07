import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import { StatusBadge } from "../components/StatusBadge";
import { apiClient } from "../lib/api";
import {
  buildClientDirectoryRows,
  onboardingStatusLabel,
  primaryActionForStatus,
  type ClientDirectoryRow,
} from "../lib/clients";

const STATUS_FILTERS = [
  "all",
  "invited",
  "onboarding_pending",
  "onboarding_submitted",
  "coaching_ready",
] as const;

type ClientStatusFilter = (typeof STATUS_FILTERS)[number];

function filterLabel(filter: ClientStatusFilter): string {
  return filter === "all" ? "All" : onboardingStatusLabel(filter);
}

function countRows(
  source: ClientDirectoryRow[],
  filter: ClientStatusFilter,
): number {
  if (filter === "all") {
    return source.length;
  }
  return source.filter((row) => row.onboardingStatus === filter).length;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

export function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [rows, setRows] = useState<ClientDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invitations, relationships] = await Promise.all([
        apiClient.listInvitations(),
        apiClient.listRelationships(),
      ]);
      setRows(
        buildClientDirectoryRows({
          invitations: invitations.items,
          relationships: relationships.items,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load clients.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateQuery(next: string) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        if (next) {
          params.set("q", next);
        } else {
          params.delete("q");
        }
        return params;
      },
      { replace: true },
    );
  }

  const normalizedQuery = query.trim().toLowerCase();
  const searchedRows = useMemo(() => {
    if (!normalizedQuery) {
      return rows;
    }
    return rows.filter((row) => {
      const name = row.name.toLowerCase();
      const subtitle = row.subtitle.toLowerCase();
      return (
        name.includes(normalizedQuery) || subtitle.includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, rows]);

  const visibleRows = useMemo(() => {
    if (statusFilter === "all") {
      return searchedRows;
    }
    return searchedRows.filter(
      (row) => row.onboardingStatus === statusFilter,
    );
  }, [searchedRows, statusFilter]);

  const coachingReady = countRows(rows, "coaching_ready");
  const invited = countRows(rows, "invited");
  const onboarding =
    countRows(rows, "onboarding_pending") +
    countRows(rows, "onboarding_submitted");

  function clearFilters() {
    setStatusFilter("all");
    updateQuery("");
  }

  const kpiValue = (value: number) => (loading ? "—" : value);

  return (
    <section className="page clients-page">
      <header className="page-header">
        <div>
          <h1 className="roster-title">
            Client Roster
            {!loading ? (
              <span className="roster-count" aria-label={`${rows.length} loaded`}>
                {rows.length}
              </span>
            ) : null}
          </h1>
          <p className="lede">
            Search loaded clients and open the next action for their status.
          </p>
        </div>
        <Link to="/clients/add" className="button-primary">
          + Add Client
        </Link>
      </header>

      <dl className="kpi-row" aria-label="Loaded client roster">
        <Kpi label="Total" value={kpiValue(rows.length)} tone="neutral" />
        <Kpi
          label="Coaching ready"
          value={kpiValue(coachingReady)}
          tone="success"
        />
        <Kpi
          label="Onboarding"
          value={kpiValue(onboarding)}
          tone="accent"
          detail="Onboarding pending and onboarding submitted"
        />
        <Kpi label="Invited" value={kpiValue(invited)} tone="warning" />
      </dl>

      <div className="roster-card">
        {loading ? (
          <p className="roster-status" aria-busy="true">
            Loading clients…
          </p>
        ) : error && rows.length === 0 ? (
          <div className="empty-state" role="alert">
            <h2>Could not load clients</h2>
            <p>{error}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state" role="status">
            <h2>No clients yet</h2>
            <p>Invite a trainee to start onboarding.</p>
            <Link to="/clients/add" className="button-primary">
              + Add Client
            </Link>
          </div>
        ) : (
          <>
            {error ? (
              <p className="form-error roster-banner" role="alert">
                {error}{" "}
                <button
                  type="button"
                  className="button-link"
                  onClick={() => void load()}
                >
                  Retry
                </button>
              </p>
            ) : null}
            <div className="roster-toolbar">
              <label className="roster-search">
                <span className="sr-only">Search clients</span>
                <SearchIcon />
                <input
                  id="clients-search"
                  type="search"
                  value={query}
                  onChange={(event) => updateQuery(event.target.value)}
                  placeholder="Name or email"
                  autoComplete="off"
                />
              </label>
              <div
                className="segment"
                role="group"
                aria-label="Filter by onboarding status"
              >
                {STATUS_FILTERS.map((filter) => {
                  const selected = statusFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      className={selected ? "segment-btn is-on" : "segment-btn"}
                      data-filter={filter}
                      aria-pressed={selected}
                      onClick={() => setStatusFilter(filter)}
                    >
                      {filterLabel(filter)}
                      <span className="segment-count">
                        {countRows(searchedRows, filter)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {visibleRows.length === 0 ? (
              <div className="empty-state" role="status">
                <h2>No matching clients</h2>
                <p>No loaded clients match this search or status.</p>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="roster-scroll">
                <table className="roster-table" aria-label="Clients">
                  <thead>
                    <tr>
                      <th scope="col">Client</th>
                      <th scope="col">Status</th>
                      <th scope="col">Updated</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <ClientRow key={row.key} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
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

function Kpi({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: number | string;
  tone: "warning" | "neutral" | "info" | "success" | "accent";
  detail?: string;
}) {
  return (
    <div className={`kpi kpi-${tone}`} title={detail}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function splitDisplayName(name: string): { given: string; family: string | null } {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return { given: parts[0], family: parts.slice(1).join(" ") };
  }
  return { given: name.trim() || "Client", family: null };
}

function ClientRow({ row }: { row: ClientDirectoryRow }) {
  const action = primaryActionForStatus(row.onboardingStatus);
  const href =
    action.href && row.relationshipId
      ? `/clients/${row.relationshipId}/${action.href}`
      : null;
  const display = splitDisplayName(row.name);

  return (
    <tr>
      <td>
        <div className="roster-person">
          <span className="avatar" aria-hidden="true">
            {initials(row.name)}
          </span>
          <div className="roster-person-copy">
            <p className="client-name">
              <span>{display.given}</span>
              {display.family ? <span>{display.family}</span> : null}
            </p>
            <p className="client-subtitle">{row.subtitle}</p>
          </div>
        </div>
      </td>
      <td>
        <StatusBadge status={row.onboardingStatus} />
      </td>
      <td>
        <time className="roster-meta" dateTime={row.updatedAt}>
          {formatUpdatedAt(row.updatedAt)}
        </time>
      </td>
      <td>
        {href ? (
          <Link
            to={href}
            className="button-secondary"
            aria-label={`${action.label} for ${row.name}`}
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
