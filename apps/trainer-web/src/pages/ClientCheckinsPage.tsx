import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Checkin } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

type WorkspaceOutlet = { refreshEpoch?: number };

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function localDateUtc(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function formatLocalDate(localDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return localDate;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function ClientCheckinsPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const [items, setItems] = useState<Checkin[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (cursor?: string | null) => {
    if (!relationshipId) return;
    const appending = Boolean(cursor);
    if (appending) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await apiClient.listCheckins(relationshipId, {
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
          : "Could not load check-ins.",
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  async function scheduleToday() {
    if (!relationshipId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.scheduleCheckin(
        relationshipId,
        { localDate: localDateUtc() },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Scheduled check-in for ${result.checkin.localDate}.`
          : `Check-in for ${result.checkin.localDate} already exists.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="workspace-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="workspace-card" aria-labelledby="checkins-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">Schedule</p>
            <h2 id="checkins-heading" className="workspace-card-title">
              Check-ins
            </h2>
            <p className="lede">
              Upcoming, submitted, reviewed, and overdue for this client. Load more
              uses the list cursor when the server returns one.
            </p>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={acting}
            onClick={() => {
              void scheduleToday();
            }}
          >
            Schedule today
          </button>
        </div>
        {loading ? <p className="muted">Loading check-ins…</p> : null}
        {!loading && !error && items.length === 0 ? (
          <p className="workspace-empty" role="status">
            No check-ins yet
          </p>
        ) : null}

        {items.length > 0 ? (
          <ul className="workspace-list">
            {items.map((item) => (
              <li key={item.id} className="workspace-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">
                    {formatLocalDate(item.localDate)}
                  </p>
                  <p className="workspace-row-meta">
                    <span className={`status-pill status-${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                    <span>
                      Window ends {new Date(item.windowEndsAt).toLocaleString()}
                    </span>
                  </p>
                </div>
                <Link
                  className="button-primary"
                  to={`/clients/${relationshipId}/check-ins/${item.id}`}
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
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
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
