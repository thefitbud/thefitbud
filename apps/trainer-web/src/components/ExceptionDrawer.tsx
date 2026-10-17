import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail, ExceptionType } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { formatIsoDateTime } from "../lib/format";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { LoadingBlock } from "./StatePanels";

const EXCEPTION_TYPE_LABEL: Record<ExceptionType, string> = {
  missed_workout: "Missed workout",
  skipped_workout: "Skipped workout",
  overdue_meal: "Meal gap",
  skipped_meal: "Skipped meal",
  meal_deviation: "Meal deviation",
  meal_logged_later: "Logged later",
  overdue_checkin: "Check-in",
};

export function ExceptionDrawer({
  exceptionId,
  onClose,
  onChanged,
}: {
  exceptionId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<
    "talked" | "plan_adjusted" | "no_action" | "other"
  >("talked");
  const [reminderLine, setReminderLine] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getException(exceptionId);
      setDetail(result);
      try {
        const resp = await stage1Api.getResponsiveness(
          result.coachingRelationshipId,
          14,
        );
        if (resp.label === "reminders_paused") {
          setReminderLine("Reminders paused by client");
        } else if (resp.label === "notifications_off") {
          setReminderLine("Client has notifications off");
        } else if (resp.counts.sent > 0) {
          setReminderLine(
            `Reminders sent ${resp.counts.sent} · opened ${resp.counts.opened}`,
          );
        }
      } catch {
        setReminderLine(null);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load this item.",
      );
    } finally {
      setLoading(false);
    }
  }, [exceptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function acknowledge() {
    setActing(true);
    setError(null);
    try {
      await apiClient.acknowledgeException(
        exceptionId,
        { note: note.trim() || null },
        createIdempotencyKey(),
      );
      setNote("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not acknowledge.",
      );
    } finally {
      setActing(false);
    }
  }

  async function resolve() {
    setActing(true);
    setError(null);
    try {
      await apiClient.resolveException(
        exceptionId,
        {
          note: note.trim() || null,
          outcome,
          interventionKind: "resolve",
        },
        createIdempotencyKey(),
      );
      setNote("");
      onChanged?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not resolve.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Exception review"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>Review</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {loading ? <LoadingBlock label="Loading…" /> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {detail ? (
          <div className="drawer-body stack-lg">
            <p className="eyebrow">{EXCEPTION_TYPE_LABEL[detail.type]}</p>
            <h3>{detail.summary}</h3>
            <p className="muted">Detected {formatIsoDateTime(detail.detectedAt)}</p>
            {reminderLine ? <p className="muted">{reminderLine}</p> : null}
            {detail.summary ? <p>{detail.summary}</p> : null}
            <label className="field">
              <span>Note (optional)</span>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            {detail.status === "acknowledged" ? (
              <label className="field">
                <span>Outcome</span>
                <select
                  value={outcome}
                  onChange={(e) =>
                    setOutcome(e.target.value as typeof outcome)
                  }
                >
                  <option value="talked">Talked with client</option>
                  <option value="plan_adjusted">Plan adjusted</option>
                  <option value="no_action">No action needed</option>
                  <option value="other">Other</option>
                </select>
              </label>
            ) : null}
            <div className="button-row">
              {(detail.status === "detected" || detail.status === "active") && (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={acting}
                  onClick={() => void acknowledge()}
                >
                  Acknowledge
                </button>
              )}
              {detail.status === "acknowledged" ? (
                <button
                  type="button"
                  className="button-primary"
                  disabled={acting}
                  onClick={() => void resolve()}
                >
                  Resolve
                </button>
              ) : null}
              <Link
                className="button-secondary"
                to={`/clients/${detail.coachingRelationshipId}/plan`}
              >
                Adjust plan
              </Link>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
