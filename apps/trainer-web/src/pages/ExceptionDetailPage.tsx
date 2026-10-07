import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
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
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/">Attention</Link> / Exception
          </p>
          <h1>Exception detail</h1>
          <p className="lede">
            Source signal and rule are retained. Acknowledge or resolve without
            rewriting workouts, meals, or check-ins.
          </p>
        </div>
        {detail ? (
          <Link
            className="button-secondary"
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
          <section>
            <p>
              <span className={`status-pill status-${detail.status}`}>
                {statusLabel(detail.status)}
              </span>{" "}
              · {detail.type.replace(/_/g, " ")}
            </p>
            <h2>{detail.summary}</h2>
            <dl className="detail-list">
              <div>
                <dt>Rule</dt>
                <dd>{detail.ruleVersion}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {detail.sourceEntityType} · {detail.sourceEntityId}
                </dd>
              </div>
              <div>
                <dt>Detected</dt>
                <dd>{detail.detectedAt}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2>Actions</h2>
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
          </section>

          {detail.actions.length > 0 ? (
            <section>
              <h2>History</h2>
              <ul>
                {detail.actions.map((action) => (
                  <li key={action.id}>
                    {statusLabel(action.action)} · {action.createdAt}
                    {action.note ? ` — ${action.note}` : ""}
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
