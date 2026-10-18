import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatInstant,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import type { ExceptionDetail } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { Button } from "./Button";
import { OverflowMenu } from "./OverflowMenu";
import { StatusChip } from "./StatusChip";
import { LoadingBlock } from "./StatePanels";

const OUTCOMES = [
  { id: "talked", label: "Talked to client" },
  { id: "plan_adjusted", label: "Plan adjusted" },
  { id: "no_action", label: "No action needed" },
] as const;

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
  const [clientName, setClientName] = useState("Client");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] =
    useState<(typeof OUTCOMES)[number]["id"]>("talked");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [reminderLine, setReminderLine] = useState<string | null>(null);
  const [nudgeHint, setNudgeHint] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getException(exceptionId);
      setDetail(result);
      try {
        const ws = await apiClient.getClientWorkspace(
          result.coachingRelationshipId,
        );
        setClientName(ws.header.traineeDisplayName || "Client");
      } catch {
        setClientName("Client");
      }
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
            `Reminder sent · opened ${resp.counts.opened} of ${resp.counts.sent}`,
          );
        }
      } catch {
        setReminderLine(null);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "This item no longer exists",
      );
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [exceptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        onClose();
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function markReviewed() {
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
        err instanceof ApiClientError ? err.message : "Could not mark reviewed.",
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
          outcome:
            outcome === "talked"
              ? "talked"
              : outcome === "plan_adjusted"
                ? "plan_adjusted"
                : "no_action",
          interventionKind: note.trim() ? "note" : "resolve",
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

  async function nudge() {
    if (!detail) return;
    setNudgeHint(null);
    try {
      const activityType =
        detail.sourceEntityType === "workout_assignment"
          ? "workout"
          : detail.sourceEntityType === "meal_assignment"
            ? "meal"
            : "checkin";
      await apiClient.nudgeActivity(detail.coachingRelationshipId, {
        activityType,
        activityId: detail.sourceEntityId,
      });
      setNudgeHint("Nudge sent");
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : "Could not nudge";
      if (/rate|limit|again/i.test(msg)) {
        setNudgeHint("You can nudge again in 40 min");
      } else if (/quiet/i.test(msg)) {
        setNudgeHint("Nudge will arrive after 7:00 am (client's quiet hours).");
      } else {
        setNudgeHint(msg);
      }
    }
  }

  const resolved = detail?.status === "resolved";
  const acknowledged = detail?.status === "acknowledged";
  const active =
    detail &&
    (detail.status === "detected" || detail.status === "active");

  const reason =
    detail == null
      ? ""
      : detail.summary || labelFor("exception_type", detail.type);

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        ref={panelRef}
        className="drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Needs attention detail"
        data-testid="screen-TW-05"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="drawer-head">
          <h2>{clientName}</h2>
          {detail ? (
            <StatusChip kind="severity" value={detail.severity} />
          ) : null}
          <button
            ref={closeRef}
            type="button"
            className="button-ghost"
            style={{ minHeight: 32, padding: "0 8px" }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {loading ? <LoadingBlock label="Loading…" /> : null}
        {error && !detail ? (
          <div className="drawer-body">
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null}

        {detail ? (
          <>
            <div className="drawer-body">
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                {reason}
              </h3>

              <div className="drawer-source">
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                  {labelFor("exception_type", detail.type)}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  Source: planned item ·{" "}
                  {detail.details && typeof detail.details.windowEnd === "string"
                    ? `Due by ${formatInstant(String(detail.details.windowEnd), Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}`
                    : "See client plan for the window"}
                </p>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  Logged: nothing yet / see activity for changes
                </p>
              </div>

              {reminderLine ? <p className="muted">{reminderLine}</p> : null}
              {nudgeHint ? <p className="muted">{nudgeHint}</p> : null}

              <ul className="drawer-timeline">
                <li>
                  Detected{" "}
                  {formatInstant(
                    detail.detectedAt,
                    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                  )}
                </li>
                {detail.acknowledgedAt ? (
                  <li>
                    Acknowledged · you,{" "}
                    {formatInstant(
                      detail.acknowledgedAt,
                      Intl.DateTimeFormat().resolvedOptions().timeZone ||
                        "UTC",
                    )}
                  </li>
                ) : null}
                {detail.resolvedAt ? (
                  <li>
                    Resolved by you ·{" "}
                    {formatCivilDate(
                      formatLocalDate(
                        new Date(detail.resolvedAt),
                        Intl.DateTimeFormat().resolvedOptions().timeZone ||
                          "UTC",
                      ),
                    )}
                  </li>
                ) : null}
              </ul>

              {resolved ? (
                <p className="muted">
                  Resolved by you ·{" "}
                  {detail.resolvedAt
                    ? formatCivilDate(
                        formatLocalDate(
                          new Date(detail.resolvedAt),
                          Intl.DateTimeFormat().resolvedOptions().timeZone ||
                            "UTC",
                        ),
                      )
                    : ""}
                </p>
              ) : null}

              {(acknowledged || showResolveForm) && !resolved ? (
                <>
                  <div className="drawer-outcomes" role="group" aria-label="Outcome">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={outcome === o.id ? "is-on" : ""}
                        onClick={() => setOutcome(o.id)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <label className="field">
                    <span>Note (optional)</span>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </div>

            {!resolved ? (
              <div className="drawer-foot">
                <div className="button-row" style={{ display: "flex", gap: 8 }}>
                  {active ? (
                    <Button
                      variant="primary"
                      disabled={acting}
                      onClick={() => void markReviewed()}
                    >
                      Mark reviewed
                    </Button>
                  ) : null}
                  {acknowledged ? (
                    <Button
                      variant="primary"
                      disabled={acting}
                      onClick={() => {
                        if (!showResolveForm) {
                          setShowResolveForm(true);
                          return;
                        }
                        void resolve();
                      }}
                    >
                      Resolve
                    </Button>
                  ) : null}
                  {active || acknowledged ? (
                    <Button
                      variant="secondary"
                      disabled={acting}
                      onClick={() => void nudge()}
                    >
                      Nudge
                    </Button>
                  ) : null}
                  <OverflowMenu
                    items={[
                      {
                        id: "note",
                        label: "Add note",
                        onSelect: () => setShowResolveForm(true),
                      },
                      {
                        id: "plan",
                        label: "Adjust plan",
                        onSelect: () => {
                          window.location.assign(
                            `/clients/${detail.coachingRelationshipId}/plan`,
                          );
                        },
                      },
                      {
                        id: "client",
                        label: "Open client",
                        onSelect: () => {
                          window.location.assign(
                            `/clients/${detail.coachingRelationshipId}`,
                          );
                        },
                      },
                    ]}
                  />
                </div>
                <p className="drawer-helper">
                  <em>Mark reviewed</em> keeps this on the list as seen.{" "}
                  <em>Resolve</em> closes it. The original log isn&apos;t changed.
                </p>
                <Link
                  className="link"
                  to={`/clients/${detail.coachingRelationshipId}`}
                  style={{ fontSize: 13 }}
                >
                  Open client
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </aside>
    </div>
  );
}
