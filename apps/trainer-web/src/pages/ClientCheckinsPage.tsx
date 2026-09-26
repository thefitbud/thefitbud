import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { Checkin } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function localDateUtc(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function ClientCheckinsPage() {
  const { relationshipId = "" } = useParams();
  const [items, setItems] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.listCheckins(relationshipId);
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
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    <section className="workspace-panel">
      <header className="panel-header-row">
        <div>
          <h2>Check-ins</h2>
          <p className="muted">
            Upcoming, submitted, reviewed, and overdue for this client.
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
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}
      {loading ? <p className="muted">Loading check-ins…</p> : null}
      {!loading && items.length === 0 ? (
        <p className="muted">No check-ins yet for this client.</p>
      ) : null}

      <ul className="stack-list">
        {items.map((item) => (
          <li key={item.id} className="stack-item">
            <div>
              <p className="stack-title">
                {statusLabel(item.status)} · {item.localDate}
              </p>
              <p className="muted">
                Window ends {new Date(item.windowEndsAt).toLocaleString()}
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
    </section>
  );
}
