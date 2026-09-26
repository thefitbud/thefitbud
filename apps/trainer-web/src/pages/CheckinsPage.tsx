import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import { apiClient } from "../lib/api";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function CheckinsPage() {
  const [items, setItems] = useState<TrainerCheckinInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.listTrainerCheckinInbox();
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

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Check-ins</p>
          <h1>Due and submitted</h1>
          <p className="lede">
            Review submissions with the same records trainees see on Today.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={() => void load()}>
          Refresh
        </button>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading check-ins…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h2>No check-ins need attention</h2>
          <p>
            Schedule a check-in from a client workspace, or wait for a due
            submission.
          </p>
        </div>
      ) : (
        <ul className="activity-list">
          {items.map((item) => (
            <li key={item.checkin.id} className="activity-row">
              <div>
                <p className="client-name">
                  Due {item.checkin.localDate}
                </p>
                <p className="client-subtitle">
                  Client · {item.coachingRelationshipId.slice(0, 8)}…
                </p>
              </div>
              <span className={`status-pill status-${item.checkin.status}`}>
                {statusLabel(item.checkin.status)}
              </span>
              <Link
                className="button-primary"
                to={`/clients/${item.coachingRelationshipId}/check-ins/${item.checkin.id}`}
              >
                Review
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
