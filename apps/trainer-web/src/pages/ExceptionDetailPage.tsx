import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail, ExceptionType } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  missed_workout: "Missed workout",
  overdue_meal: "Meal gap",
  overdue_checkin: "Check-in",
};

function statusLabel(status: string): string {
  return status
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function ExceptionDetailPage() {
  const { exceptionId = "" } = useParams();
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!exceptionId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getException(exceptionId);
      setDetail(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load exception.",
      );
    } finally {
      setLoading(false);
    }
  }, [exceptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge() {
    if (!exceptionId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.acknowledgeException(
        exceptionId,
        { note: note.trim() ? note.trim() : null },
        createIdempotencyKey(),
      );
      setMessage("Exception acknowledged. Source signals were not changed.");
      setNote("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not acknowledge exception.",
      );
    } finally {
      setActing(false);
    }
  }

  async function resolve() {
    if (!exceptionId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.resolveException(
        exceptionId,
        {
          note: note.trim() ? note.trim() : null,
          interventionKind: "resolve",
        },
        createIdempotencyKey(),
      );
      setMessage("Exception resolved. Source signals were not changed.");
      setNote("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not resolve exception.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="page exception-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/">Needs attention</Link>
            {detail?.coachingRelationshipId ? (
              <>
                {" / "}
                <Link to={`/clients/${detail.coachingRelationshipId}/overview`}>
                  Client workspace
                </Link>
              </>
            ) : null}
            {" / "}
            Exception
          </p>
          <h1>Exception detail</h1>
          <p className="lede">
            Source signal and rule are retained. Acknowledge or resolve without
            rewriting workouts, meals, or check-ins.
          </p>
        </div>
        {detail ? (
          <Link
            className="pill-btn"
            to={`/clients/${detail.coachingRelationshipId}/plan`}
          >
            Adjust plan
          </Link>
        ) : null}
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      {loading || !detail ? (
        <p className="muted">Loading exception…</p>
      ) : (
        <div className="stack-lg">
          <article className={`exception-card tone-${detail.type}`}>
            <div className="exception-top">
              <span className={`status-pill status-${detail.status}`}>
                {statusLabel(detail.status)}
              </span>
              <span className={`category-pill type-${detail.type}`}>
                {EXCEPTION_TYPE_LABEL[detail.type]}
              </span>
            </div>
            <h2 className="exception-name">{detail.summary}</h2>
            <dl className="detail-list">
              <div>
                <dt>Rule</dt>
                <dd>{detail.ruleVersion}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {detail.sourceEntityType.replace(/_/g, " ")} · {detail.sourceEntityId}
                </dd>
              </div>
              <div>
                <dt>Detected</dt>
                <dd>{formatDateTime(detail.detectedAt)}</dd>
              </div>
            </dl>
          </article>

          <section className="work-panel exception-action-panel">
            <div className="section-head">
              <h2>Actions</h2>
            </div>
            <div className="exception-action-body">
              <label className="field">
                <span>Note (optional)</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
              </label>
              <div className="button-row">
                {(detail.status === "detected" || detail.status === "active") && (
                  <button
                    type="button"
                    className="button-primary"
                    disabled={acting}
                    onClick={() => void acknowledge()}
                  >
                    Acknowledge
                  </button>
                )}
                {detail.status === "acknowledged" && (
                  <button
                    type="button"
                    className="button-primary"
                    disabled={acting}
                    onClick={() => void resolve()}
                  >
                    Resolve
                  </button>
                )}
                <Link
                  className="button-secondary"
                  to={`/clients/${detail.coachingRelationshipId}/plan`}
                >
                  Publish plan adjustment
                </Link>
              </div>
            </div>
          </section>

          {detail.actions.length > 0 ? (
            <section className="work-panel">
              <div className="section-head">
                <h2>History</h2>
              </div>
              <ul className="exception-history">
                {detail.actions.map((action) => (
                  <li key={action.id} className="work-row">
                    <span className={`status-pill status-${action.action}`}>
                      {statusLabel(action.action)}
                    </span>
                    <div>
                      <p className="work-title">{formatDateTime(action.createdAt)}</p>
                      {action.note ? <p className="work-copy">{action.note}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
