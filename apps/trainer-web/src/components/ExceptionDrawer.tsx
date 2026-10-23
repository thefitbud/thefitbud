import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import type { ExceptionDetail } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { clientWhatsappHref } from "../lib/whatsapp";
import { Button } from "./Button";
import { OverflowMenu } from "./OverflowMenu";
import { useOnlineStatus } from "./OfflineBanner";
import { StatusChip } from "./StatusChip";
import { LoadingBlock } from "./StatePanels";
import { compactHeadline } from "./workspace/ResponsivenessPanel";

const OUTCOMES = [
  { id: "talked", label: "Talked to client" },
  { id: "plan_adjusted", label: "Plan adjusted" },
  { id: "no_action", label: "No action needed" },
] as const;

const VIEWER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function detailString(
  details: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!details) return null;
  const value = details[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function windowEndIso(
  details: Record<string, unknown> | null | undefined,
): string | null {
  return (
    detailString(details, "windowEnd") ??
    detailString(details, "windowEndsAt")
  );
}

function loggedLine(detail: ExceptionDetail): string {
  const details = detail.details;
  if (detail.type === "skipped_meal" || detail.type === "skipped_workout") {
    return "Logged: Skipped";
  }
  if (detail.type === "meal_deviation") {
    const kind = detailString(details, "deviationKind");
    return kind ? `Logged: Changed · ${kind}` : "Logged: Changed";
  }
  if (
    detail.type === "meal_logged_later" ||
    details?.loggedLater === true
  ) {
    return "Logged: Logged later";
  }
  const loggedAt = detailString(details, "loggedAt");
  if (loggedAt) {
    return `Logged: ${formatInstant(loggedAt, VIEWER_TZ)}`;
  }
  return "Logged: nothing yet";
}

/** Format HH:mm quiet-hours end as a friendly clock like "7:00 am". */
function formatQuietEnd(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return hhmm;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${suffix}`;
}

function reasonHeading(
  detail: ExceptionDetail,
  plannedTitle: string | null,
): string {
  const localDate = detailString(detail.details, "localDate");
  const dateLabel = localDate ? formatCivilDate(localDate) : null;
  const mealName = detailString(detail.details, "mealName");
  const itemName = mealName ?? plannedTitle;
  const base = detail.summary || labelFor("exception_type", detail.type);
  const parts = [base];
  if (
    itemName &&
    !base.toLowerCase().includes(itemName.toLowerCase())
  ) {
    parts.push(itemName);
  }
  if (dateLabel) parts.push(dateLabel);
  return parts.join(" · ");
}

/**
 * Source line under the item title. Workouts have a whole-day window (it
 * closes at midnight), so "Due by 12:00 am" read as wrong: show the planned
 * day and size instead. Meals and check-ins keep their real due time.
 */
export function dueLine(
  detail: Pick<ExceptionDetail, "sourceEntityType" | "details">,
  dueIso: string | null,
  plannedLine: string | null,
): string {
  const localDate = detailString(detail.details, "localDate");
  if (detail.sourceEntityType === "workout_assignment") {
    const day = localDate ? `Planned for ${formatCivilDate(localDate)}` : "Planned";
    return plannedLine ? `${day} · ${plannedLine}` : day;
  }
  if (!dueIso) return localDate ? `Due ${formatCivilDate(localDate)}` : "No due time";
  const clock = formatClockTime(dueIso, VIEWER_TZ);
  if (clock === "12:00 am" && localDate) {
    return `Due by end of ${formatCivilDate(localDate)}`;
  }
  return localDate
    ? `Due by ${clock} · ${formatCivilDate(localDate)}`
    : `Due by ${clock}`;
}

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
  const [clientWhatsappE164, setClientWhatsappE164] = useState<string | null>(
    null,
  );
  const [plannedTitle, setPlannedTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] =
    useState<(typeof OUTCOMES)[number]["id"]>("talked");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [reminderLine, setReminderLine] = useState<string | null>(null);
  const [nudgeHint, setNudgeHint] = useState<string | null>(null);
  const [nudgeBlockedUntil, setNudgeBlockedUntil] = useState<number | null>(
    null,
  );
  const [nudgeNow, setNudgeNow] = useState(() => Date.now());
  const [nudgePaused, setNudgePaused] = useState(false);
  const [dueByIso, setDueByIso] = useState<string | null>(null);
  const [plannedLine, setPlannedLine] = useState<string | null>(null);
  const [quietHoursEnd, setQuietHoursEnd] = useState<string | null>(null);
  const online = useOnlineStatus();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const nudgeRef = useRef<() => void>(() => undefined);
  // DR1: set synchronously the moment a close is requested. The parent's
  // close is a router navigation (a React transition), so the drawer and its
  // key listener can stay mounted for a frame or more under load; while this
  // is set, the listener ignores every key.
  const closingRef = useRef(false);

  // A new item shown in the same drawer instance is a fresh open.
  useLayoutEffect(() => {
    closingRef.current = false;
  }, [exceptionId]);

  /** Every close path goes through here (Esc, X, backdrop, Close, Resolve). */
  const requestClose = useCallback(() => {
    closingRef.current = true;
    onClose();
  }, [onClose]);

  const load = useCallback(async (opts?: { quiet?: boolean }) => {
    // Quiet reload after an action keeps the drawer content on screen.
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getException(exceptionId);
      setDetail(result);

      let title: string | null =
        detailString(result.details, "mealName") ?? null;
      let due =
        windowEndIso(result.details) ??
        detailString(result.details, "windowEndsAt");
      try {
        if (result.sourceEntityType === "workout_assignment") {
          const workout = await apiClient.getWorkoutAssignment(
            result.sourceEntityId,
          );
          title = workout.workoutDayName;
          due = due ?? workout.windowEndsAt;
          const exercises = workout.workoutDay?.exercises ?? [];
          const sets = exercises.reduce(
            (sum, ex) => sum + (ex.setTargets?.length ?? 0),
            0,
          );
          setPlannedLine(
            exercises.length > 0
              ? `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"}`
              : null,
          );
        } else if (result.sourceEntityType === "meal_assignment") {
          const meal = await apiClient.getMealAssignment(
            result.sourceEntityId,
          );
          if (!title) title = meal.mealName;
          due = due ?? meal.windowEndsAt;
        } else if (result.sourceEntityType === "checkin") {
          title = "Check-in";
          try {
            const checkin = await apiClient.getCheckin(result.sourceEntityId);
            due = due ?? checkin.windowEndsAt;
          } catch {
            /* optional */
          }
        }
      } catch {
        /* source may be gone; keep title from details */
      }
      setPlannedTitle(title);
      setDueByIso(due);

      try {
        const ws = await apiClient.getClientWorkspace(
          result.coachingRelationshipId,
        );
        setClientName(ws.header.traineeDisplayName || "Client");
        setClientWhatsappE164(ws.header.clientWhatsappE164 ?? null);
      } catch {
        setClientName("Client");
        setClientWhatsappE164(null);
      }
      try {
        const resp = await stage1Api.getResponsiveness(
          result.coachingRelationshipId,
          14,
        );
        setReminderLine(compactHeadline(resp, "their"));
        if (resp.label === "reminders_paused") {
          setNudgePaused(true);
        }
      } catch {
        setReminderLine(null);
      }
    } catch (err) {
      const is404 =
        err instanceof ApiClientError &&
        (err.status === 404 || err.code === "EXCEPTION_NOT_FOUND");
      setError(is404 ? "This item no longer exists" : err instanceof ApiClientError ? err.message : "This item no longer exists");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [exceptionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (nudgeBlockedUntil == null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNudgeNow(now);
      if (now >= nudgeBlockedUntil) {
        setNudgeBlockedUntil(null);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [nudgeBlockedUntil]);

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
      await load({ quiet: true });
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
      if (detail && (detail.status === "detected" || detail.status === "active")) {
        // The API resolves only reviewed items; Resolve on an open item marks
        // it reviewed first so the trainer never needs two clicks.
        await apiClient.acknowledgeException(
          exceptionId,
          { note: null },
          createIdempotencyKey(),
        );
      }
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
        },
        createIdempotencyKey(),
      );
      setNote("");
      closingRef.current = true;
      onChanged?.();
      requestClose();
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
    if (nudgeBlockedUntil != null && Date.now() < nudgeBlockedUntil) return;
    setNudgeHint(null);
    try {
      const activityType =
        detail.sourceEntityType === "workout_assignment"
          ? "workout"
          : detail.sourceEntityType === "meal_assignment"
            ? "meal"
            : "checkin";
      const result = await apiClient.nudgeActivity(
        detail.coachingRelationshipId,
        {
          activityType,
          activityId: detail.sourceEntityId,
        },
      );
      if (result.deferredForQuietHours) {
        const end =
          result.quietHoursEnd?.trim() ||
          quietHoursEnd ||
          "quiet hours end";
        const endLabel = /^\d{1,2}:\d{2}/.test(end)
          ? formatQuietEnd(end)
          : end;
        setQuietHoursEnd(result.quietHoursEnd ?? quietHoursEnd);
        setNudgeHint(
          `Nudge will arrive after ${endLabel} (client's quiet hours).`,
        );
      } else if (result.deduped) {
        setNudgeHint("Already nudged today.");
      } else {
        setNudgeHint("Nudge sent");
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "REMINDERS_PAUSED") {
          setNudgePaused(true);
          setNudgeHint(
            err.message ||
              "Client has paused reminders. Nudge isn't available.",
          );
          return;
        }
        const retryAfterRaw = err.details?.retryAfter;
        const retryAfter =
          typeof retryAfterRaw === "number" ? retryAfterRaw : null;
        if (
          err.code === "NUDGE_LIMIT" ||
          err.code === "NUDGE_RATE_LIMITED" ||
          retryAfter != null
        ) {
          if (retryAfter != null) {
            const mins = Math.max(1, Math.ceil(retryAfter / 60));
            setNudgeHint(`You can nudge again in ${mins} min`);
            setNudgeBlockedUntil(Date.now() + retryAfter * 1000);
            setNudgeNow(Date.now());
          } else {
            setNudgeHint(err.message);
          }
          return;
        }
        if (
          /quiet/i.test(err.message) ||
          err.details?.deferredForQuietHours === true
        ) {
          const endRaw =
            (typeof err.details?.quietHoursEnd === "string"
              ? err.details.quietHoursEnd
              : null) ||
            quietHoursEnd ||
            "quiet hours end";
          const endLabel = /^\d{1,2}:\d{2}/.test(endRaw)
            ? formatQuietEnd(endRaw)
            : endRaw;
          setNudgeHint(
            `Nudge will arrive after ${endLabel} (client's quiet hours).`,
          );
          return;
        }
        setNudgeHint(err.message);
        return;
      }
      setNudgeHint("Could not nudge");
    }
  }

  nudgeRef.current = () => {
    void nudge();
  };

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      // DR1: closing (or closed): no shortcut may act any more.
      if (closingRef.current) return;
      if (ev.key === "Escape") {
        if (document.querySelector(".overflow-menu-list")) return;
        ev.preventDefault();
        requestClose();
        return;
      }
      const target = ev.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (!typing && (ev.key === "n" || ev.key === "N")) {
        ev.preventDefault();
        nudgeRef.current();
        return;
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
  }, [requestClose]);

  const resolved = detail?.status === "resolved";
  const acknowledged = detail?.status === "acknowledged";
  const active =
    detail &&
    (detail.status === "detected" || detail.status === "active");

  const dueIso =
    dueByIso ?? (detail ? windowEndIso(detail.details) : null);
  const nudgeBlocked =
    nudgePaused ||
    (nudgeBlockedUntil != null && nudgeNow < nudgeBlockedUntil);
  const isSkipped =
    detail?.type === "skipped_meal" || detail?.type === "skipped_workout";
  const showNudge = Boolean(detail && !resolved && !isSkipped);
  const whatsappHref = clientWhatsappHref({
    phoneE164: clientWhatsappE164,
    name: clientName,
  });

  return (
    <div className="drawer-backdrop" role="presentation" onClick={requestClose}>
      <div
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
          {detail && !resolved ? (
            <StatusChip kind="severity" value={detail.severity} />
          ) : null}
          <button
            ref={closeRef}
            type="button"
            className="button-ghost"
            style={{ minHeight: 32, padding: "0 8px" }}
            onClick={requestClose}
            aria-label="Close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        {loading ? <LoadingBlock label="Loading…" /> : null}
        {error && !detail ? (
          <div className="drawer-body">
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={requestClose}>
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
                {reasonHeading(detail, plannedTitle)}
              </h3>

              <div className="drawer-source">
                <p style={{ margin: "0 0 6px", fontWeight: 600 }}>
                  {plannedTitle ??
                    detailString(detail.details, "mealName") ??
                    labelFor("exception_type", detail.type)}
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  {dueLine(detail, dueIso, plannedLine)}
                </p>
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  {loggedLine(detail)}
                </p>
              </div>

              {reminderLine ? <p className="muted">{reminderLine}</p> : null}
              {nudgeHint ? <p className="muted">{nudgeHint}</p> : null}

              <ul className="drawer-timeline">
                <li>
                  Detected{" "}
                  {formatInstant(detail.detectedAt, VIEWER_TZ)}
                </li>
                {detail.acknowledgedAt ? (
                  <li>
                    Marked reviewed · you,{" "}
                    {formatInstant(detail.acknowledgedAt, VIEWER_TZ)}
                  </li>
                ) : null}
                {detail.resolvedAt ? (
                  <li>
                    Resolved by you ·{" "}
                    {formatCivilDate(
                      formatLocalDate(
                        new Date(detail.resolvedAt),
                        VIEWER_TZ,
                      ),
                    )}
                  </li>
                ) : null}
              </ul>

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
                      disabled={acting || !online}
                      onClick={() => void markReviewed()}
                    >
                      Mark reviewed
                    </Button>
                  ) : null}
                  {acknowledged || active ? (
                    <Button
                      variant={acknowledged ? "primary" : "secondary"}
                      disabled={acting || !online}
                      onClick={() => {
                        if (!showResolveForm && !acknowledged) {
                          setShowResolveForm(true);
                          return;
                        }
                        void resolve();
                      }}
                    >
                      {!acknowledged && !showResolveForm ? "Resolve…" : "Resolve"}
                    </Button>
                  ) : null}
                  {showNudge && (active || acknowledged) ? (
                    <Button
                      variant="secondary"
                      disabled={acting || !online || nudgeBlocked}
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
                          // Leaving the page: treat as closing (DR1).
                          closingRef.current = true;
                          window.location.assign(
                            `/clients/${detail.coachingRelationshipId}/plan`,
                          );
                        },
                      },
                      {
                        id: "whatsapp",
                        label: "WhatsApp client",
                        onSelect: () => {
                          if (whatsappHref) {
                            window.open(
                              whatsappHref,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }
                        },
                        disabled: !whatsappHref,
                      },
                      {
                        id: "client",
                        label: "Open client",
                        onSelect: () => {
                          closingRef.current = true;
                          window.location.assign(
                            `/clients/${detail.coachingRelationshipId}`,
                          );
                        },
                      },
                    ]}
                  />
                </div>
                <p className="drawer-helper">
                  <em>Mark reviewed</em> moves {clientName.split(" ")[0]} to Reviewed
                  until every item is resolved. <em>Resolve</em> closes this item.
                  The original log isn&apos;t changed.
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
      </div>
    </div>
  );
}
