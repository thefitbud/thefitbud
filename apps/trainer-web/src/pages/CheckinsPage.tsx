import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { CheckinStatus, TrainerCheckinInboxItem } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import { apiClient } from "../lib/api";

const CHECKIN_STATUS_ORDER: CheckinStatus[] = [
  "scheduled",
  "due",
  "overdue",
  "submitted",
  "reviewed",
];

const KNOWN_KPI_STATUSES = ["due", "overdue", "submitted"] as const;

type KnownKpiStatus = (typeof KNOWN_KPI_STATUSES)[number];

function relationshipLabel(
  coachingRelationshipId: string,
  names: Map<string, string>,
): string {
  return names.get(coachingRelationshipId) ?? "Client";
}

function relationshipInitials(coachingRelationshipId: string): string {
  const compact = coachingRelationshipId.replace(/[^A-Za-z0-9]/g, "");
  return compact.length >= 2 ? compact.slice(0, 2).toUpperCase() : "CL";
}

function countStatus(
  items: TrainerCheckinInboxItem[],
  status: CheckinStatus,
): number {
  return items.filter((item) => item.checkin.status === status).length;
}

export function CheckinsPage() {
  const [items, setItems] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | CheckinStatus>(
    "all",
  );
  const [clientNames, setClientNames] = useState<Map<string, string>>(
    () => new Map(),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, clients] = await Promise.all([
        apiClient.listTrainerCheckinInbox(),
        apiClient.listClients({ limit: 100 }),
      ]);
      const names = new Map<string, string>();
      for (const row of clients.items) {
        const rid = row.relationshipId;
        const label = row.traineeDisplayName;
        if (rid && label) names.set(rid, label);
      }
      setClientNames(names);
      setItems(result.items);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const presentStatuses = useMemo(() => {
    const seen = new Set(items.map((item) => item.checkin.status));
    const ordered = CHECKIN_STATUS_ORDER.filter((status) => seen.has(status));
    for (const status of seen) {
      if (!ordered.includes(status)) {
        ordered.push(status);
      }
    }
    return ordered;
  }, [items]);

  const activeFilter: "all" | CheckinStatus =
    statusFilter !== "all" && presentStatuses.includes(statusFilter)
      ? statusFilter
      : "all";

  const visibleItems =
    activeFilter === "all"
      ? items
      : items.filter((item) => item.checkin.status === activeFilter);

  function countFor(filter: "all" | CheckinStatus): number {
    if (filter === "all") {
      return items.length;
    }
    return countStatus(items, filter);
  }

  const kpiValue = (value: number) => (loading ? "—" : value);
  const kpiTone: Record<KnownKpiStatus, "info" | "warning" | "success"> = {
    due: "info",
    overdue: "warning",
    submitted: "success",
  };

  return (
    <section className="page checkins-page" data-testid="screen-TW-22">
      <header className="page-header">
        <div>
          <h1 className="roster-title">
            Check-ins
            {!loading ? (
              <span
                className="roster-count"
                aria-label={`${items.length} loaded`}
              >
                {items.length}
              </span>
            ) : null}
          </h1>
          <p className="lede">
            Review loaded check-ins that are due or have been submitted.
          </p>
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </header>

      <dl className="kpi-row" aria-label="Loaded check-in inbox">
        <Kpi label="Total" value={kpiValue(items.length)} tone="neutral" />
        {KNOWN_KPI_STATUSES.map((status) => (
          <Kpi
            key={status}
            label={labelFor("checkin_status", status)}
            value={kpiValue(countStatus(items, status))}
            tone={kpiTone[status]}
          />
        ))}
      </dl>

      <div className="roster-card">
        {loading ? (
          <p className="roster-status" aria-busy="true">
            Loading check-ins…
          </p>
        ) : error && items.length === 0 ? (
          <div className="empty-state" role="alert">
            <h2>Could not load check-ins</h2>
            <p>{error}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void load()}
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state" role="status">
            <h2>No check-ins need attention</h2>
            <p>
              Schedule a check-in from a client workspace, or wait for a due
              submission.
            </p>
          </div>
        ) : (
          <>
            {error ? (
              <p className="form-error roster-banner" role="alert">
                {error}
              </p>
            ) : null}
            <div className="roster-toolbar">
              <div
                className="segment"
                role="group"
                aria-label="Filter by check-in status"
              >
                <StatusChip
                  filter="all"
                  label="All"
                  count={countFor("all")}
                  selected={activeFilter === "all"}
                  onSelect={() => setStatusFilter("all")}
                />
                {presentStatuses.map((status) => (
                  <StatusChip
                    key={status}
                    filter={status}
                    label={labelFor("checkin_status", status)}
                    count={countFor(status)}
                    selected={activeFilter === status}
                    onSelect={() => setStatusFilter(status)}
                  />
                ))}
              </div>
            </div>

            {visibleItems.length === 0 ? (
              <div className="empty-state" role="status">
                <h2>No matching check-ins</h2>
                <p>No loaded check-ins use this status.</p>
              </div>
            ) : (
              <div className="roster-scroll">
                <table className="roster-table" aria-label="Check-ins">
                  <thead>
                    <tr>
                      <th scope="col">Client</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                      <th scope="col">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <CheckinRow
                        key={item.checkin.id}
                        item={item}
                        clientNames={clientNames}
                      />
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

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "warning" | "neutral" | "info" | "success";
}) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function StatusChip({
  filter,
  label,
  count,
  selected,
  onSelect,
}: {
  filter: string;
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={selected ? "segment-btn is-on" : "segment-btn"}
      data-filter={filter}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {label}
      <span className="segment-count">{count}</span>
    </button>
  );
}

function CheckinRow({
  item,
  clientNames,
}: {
  item: TrainerCheckinInboxItem;
  clientNames: Map<string, string>;
}) {
  const label = relationshipLabel(item.coachingRelationshipId, clientNames);
  return (
    <tr>
      <td>
        <div className="roster-person">
          <span className="avatar" aria-hidden="true">
            {relationshipInitials(item.coachingRelationshipId)}
          </span>
          <div className="roster-person-copy">
            <p className="client-name" title={item.coachingRelationshipId}>
              <span>{label}</span>
            </p>
          </div>
        </div>
      </td>
      <td>
        <time className="roster-meta" dateTime={item.checkin.localDate}>
          {formatCivilDate(item.checkin.localDate)}
        </time>
      </td>
      <td>
        <span className={`status-pill status-${item.checkin.status}`}>
          {labelFor("checkin_status", item.checkin.status)}
        </span>
      </td>
      <td>
        <Link
          className="button-primary"
          to={`/clients/${item.coachingRelationshipId}/check-ins/${item.checkin.id}`}
          aria-label={`Review check-in for ${label}`}
        >
          Review
        </Link>
      </td>
    </tr>
  );
}
