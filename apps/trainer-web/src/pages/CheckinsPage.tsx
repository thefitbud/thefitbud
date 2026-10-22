import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatInstant,
  formatLocalDate,
  whatsappHref,
} from "@fitbud/core";
import { Button } from "../components/Button";
import { StatusChip } from "../components/StatusChip";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../components/StatePanels";
import { apiClient } from "../lib/api";

type InboxTab = "to-review" | "due" | "overdue" | "reviewed";

const PAGE_SIZE = 12;
const ENDED_NAMES = new Set(["Kavya", "Nikhil"]);

function tabFromParam(raw: string | null): InboxTab {
  if (raw === "due" || raw === "overdue" || raw === "reviewed") return raw;
  if (raw === "submitted" || raw === "to-review") return "to-review";
  return "to-review";
}

function apiTabParam(tab: InboxTab): string {
  if (tab === "to-review") return "submitted";
  return tab;
}

function relationshipInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) ?? "CL").toUpperCase();
}

type Row = TrainerCheckinInboxItem & {
  traineeDisplayName: string;
  traineeTimezone: string;
  clientWhatsappE164: string | null;
  formLabel: string;
};

function whenLabel(row: Row): string {
  if (row.checkin.status === "submitted" && row.checkin.submittedAt) {
    return formatInstant(row.checkin.submittedAt, row.traineeTimezone);
  }
  return formatCivilDate(row.checkin.localDate);
}

export function CheckinsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = tabFromParam(
    searchParams.get("tab") ?? searchParams.get("view"),
  );
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clients, inbox] = await Promise.all([
        apiClient.listClients({ limit: 100 }),
        apiClient.listTrainerCheckinInbox(),
      ]);
      const names = new Map<string, string>();
      for (const row of clients.items) {
        if (!row.relationshipId) continue;
        names.set(row.relationshipId, row.traineeDisplayName ?? "Client");
      }

      let rows: Row[] = inbox.items.map((item) => ({
        ...item,
        traineeDisplayName:
          item.traineeDisplayName ??
          names.get(item.coachingRelationshipId) ??
          "Client",
        traineeTimezone: item.traineeTimezone ?? "Asia/Kolkata",
        clientWhatsappE164: null,
        formLabel: "Weekly check-in",
      }));

      if (tab === "reviewed") {
        const active = clients.items.filter(
          (row) =>
            row.relationshipId &&
            row.status !== "ended" &&
            !ENDED_NAMES.has(
              (row.traineeDisplayName ?? "").split(/\s+/)[0] ?? "",
            ),
        );
        const since = addDaysToLocalDate(
          formatLocalDate(new Date(), "UTC"),
          -14,
        );
        const reviewedLists = await Promise.all(
          active.slice(0, 20).map(async (client) => {
            if (!client.relationshipId) return [] as Row[];
            const list = await apiClient.listCheckins(client.relationshipId, {
              fromDate: since,
              limit: 20,
            });
            return list.items
              .filter((checkin) => checkin.status === "reviewed")
              .map(
                (checkin) =>
                  ({
                    checkin,
                    coachingRelationshipId: client.relationshipId!,
                    traineeUserId: "",
                    traineeDisplayName: client.traineeDisplayName ?? "Client",
                    traineeTimezone: "Asia/Kolkata",
                    clientWhatsappE164: null,
                    formLabel: "Weekly check-in",
                  }) satisfies Row,
              );
          }),
        );
        rows = reviewedLists.flat();
      }

      rows = rows.filter((row) => {
        const first = row.traineeDisplayName.split(/\s+/)[0] ?? "";
        return !ENDED_NAMES.has(first);
      });

      setItems(rows);
      setVisibleCount(PAGE_SIZE);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    void load();
  }, [load]);

  function setTab(next: InboxTab) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("view");
    setSearchParams(params, { replace: true });
  }

  const filtered = useMemo(() => {
    if (tab === "reviewed") {
      return items.filter((row) => row.checkin.status === "reviewed");
    }
    const status = apiTabParam(tab);
    return items.filter((row) => row.checkin.status === status);
  }, [items, tab]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const counts = useMemo(() => {
    return {
      "to-review": items.filter((row) => row.checkin.status === "submitted")
        .length,
      due: items.filter((row) => row.checkin.status === "due").length,
      overdue: items.filter((row) => row.checkin.status === "overdue").length,
      reviewed: items.filter((row) => row.checkin.status === "reviewed").length,
    };
  }, [items]);

  async function nudge(row: Row) {
    setNudgingId(row.checkin.id);
    try {
      await apiClient.nudgeActivity(row.coachingRelationshipId, {
        activityType: "checkin",
        activityId: row.checkin.id,
      });
    } catch {
      /* optional */
    } finally {
      setNudgingId(null);
    }
  }

  function renderActions(row: Row) {
    if (row.checkin.status === "submitted") {
      return (
        <Link
          className="button-primary"
          to={`/clients/${row.coachingRelationshipId}/check-ins/${row.checkin.id}?from=inbox`}
        >
          Review
        </Link>
      );
    }
    if (row.checkin.status === "overdue") {
      return (
        <>
          <Button
            type="button"
            variant="tinted"
            disabled={nudgingId === row.checkin.id}
            onClick={() => void nudge(row)}
          >
            Nudge
          </Button>
          {row.clientWhatsappE164 ? (
            <a
              className="button-secondary"
              href={whatsappHref({
                phoneE164: row.clientWhatsappE164,
                draftText:
                  "Hi — your check-in is overdue. Please submit when you can.",
              })}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          ) : null}
        </>
      );
    }
    return <span className="muted">—</span>;
  }

  return (
    <section className="page checkins-page" data-testid="screen-TW-22">
      <header className="page-header">
        <h1>Check-ins</h1>
      </header>

      <div className="roster-toolbar">
        <div className="segment" role="tablist" aria-label="Check-in inbox tabs">
          {(
            [
              ["to-review", "To review"],
              ["due", "Due"],
              ["overdue", "Overdue"],
              ["reviewed", "Reviewed"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "segment-btn is-on" : "segment-btn"}
              data-filter={apiTabParam(value)}
              onClick={() => setTab(value)}
            >
              {label}{" "}
              <span className="segment-count">{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="roster-card">
        {loading ? <LoadingBlock label="Loading check-ins…" /> : null}
        {error && items.length === 0 ? (
          <ErrorState
            message={error}
            onRetry={() => void load()}
            screenId="TW-22"
          />
        ) : null}
        {!loading && tab === "to-review" && filtered.length === 0 ? (
          <EmptyState title="No check-ins waiting. Nice." />
        ) : null}
        {!loading && filtered.length > 0 ? (
          <>
            <div className="roster-scroll inbox-table-wrap">
              <table className="roster-table inbox-table" aria-label="Check-ins inbox">
                <thead>
                  <tr>
                    <th scope="col">Client</th>
                    <th scope="col">Form</th>
                    <th scope="col">When</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.checkin.id}>
                      <td>
                        <div className="roster-person">
                          <span className="avatar" aria-hidden="true">
                            {relationshipInitials(row.traineeDisplayName)}
                          </span>
                          <span className="client-name">
                            {row.traineeDisplayName}
                          </span>
                        </div>
                      </td>
                      <td>{row.formLabel}</td>
                      <td>{whenLabel(row)}</td>
                      <td>
                        <StatusChip
                          kind="checkin"
                          value={row.checkin.status}
                        />
                      </td>
                      <td className="inbox-actions">{renderActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="inbox-card-list" aria-label="Check-ins inbox">
              {visible.map((row) => (
                <li key={row.checkin.id} className="inbox-card">
                  <div className="inbox-card-top">
                    <div className="roster-person">
                      <span className="avatar" aria-hidden="true">
                        {relationshipInitials(row.traineeDisplayName)}
                      </span>
                      <div>
                        <p className="client-name">{row.traineeDisplayName}</p>
                        <p className="muted">{row.formLabel}</p>
                      </div>
                    </div>
                    <StatusChip kind="checkin" value={row.checkin.status} />
                  </div>
                  <p className="inbox-card-when">{whenLabel(row)}</p>
                  <div className="inbox-actions">{renderActions(row)}</div>
                </li>
              ))}
            </ul>

            {hasMore ? (
              <div className="inbox-more">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                >
                  Show more ({filtered.length - visibleCount} left)
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
