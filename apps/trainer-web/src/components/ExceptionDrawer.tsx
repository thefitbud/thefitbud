import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  Utensils,
} from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import type {
  ExceptionClosedReason,
  ExceptionDetail,
  WorkspaceHeader,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import { clientWhatsappHref } from "../lib/whatsapp";
import { Button } from "./Button";
import { OverflowMenu } from "./OverflowMenu";
import { useOnlineStatus } from "./OfflineBanner";
import { LoadingBlock } from "./StatePanels";
import { compactHeadline } from "./workspace/ResponsivenessPanel";
import { AlsoOpenList } from "./side-panel/AlsoOpenList";
import { PanelHeader, type PanelNav } from "./side-panel/PanelHeader";
import {
  buildPanelList,
  headerMeta,
  itemAgeLine,
  nextUnresolvedIndex,
  resolvedFooterText,
  sourceOrigin,
  type PanelList,
} from "./side-panel/panelModel";
import "./side-panel/side-panel.css";

const OUTCOMES = [
  { id: "talked", label: "Talked to client" },
  { id: "plan_adjusted", label: "Plan adjusted" },
  { id: "no_action", label: "No action needed" },
] as const;

type OutcomeId = (typeof OUTCOMES)[number]["id"];

/** Undo window after Resolve before the POST commits (frame 02). */
const RESOLVE_UNDO_MS = 5000;

const VIEWER_TZ =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/**
 * Close-path label for a resolved exception.
 * Locked frames only: trainer/null → "Resolved by you" (02/132);
 * coaching_ended → "Closed when coaching ended" (41).
 * Firoz product lock (28 Oct 2026): trainers resolve every exception.
 */
export function resolvedCloseLabel(
  closedReason: ExceptionClosedReason | null,
): string {
  if (closedReason === "coaching_ended") {
    return "Closed when coaching ended";
  }
  // trainer | null → trainer path
  return "Resolved by you";
}

export function outcomeChipLabel(outcomeId: string | null | undefined): string | null {
  if (!outcomeId) return null;
  const chip = OUTCOMES.find((o) => o.id === outcomeId);
  if (chip) return chip.label;
  const fromCore = labelFor("resolve_outcome", outcomeId);
  return fromCore && fromCore !== outcomeId ? fromCore : null;
}

/** Weekday + civil day + clock, e.g. "Sat 17 Oct, 10:05 am" (frames 02 / 132). */
export function formatTimelineDateTime(
  iso: string,
  timeZone: string = VIEWER_TZ,
): string {
  const civil = formatCivilDate(formatLocalDate(new Date(iso), timeZone));
  const clock = formatClockTime(iso, timeZone);
  return clock ? `${civil}, ${clock}` : civil;
}

/**
 * Trainer resolve banner copy (frames 02 / 132).
 * just-resolved → "Resolved by you · just now · {outcome}"
 * read-only → "Resolved by you · {civil date}[ · {outcome}]"
 */
export function trainerResolveBannerText(opts: {
  resolvedAt: string;
  outcomeLabel: string | null;
  justResolved: boolean;
  timeZone?: string;
}): string {
  const tz = opts.timeZone ?? VIEWER_TZ;
  const when = opts.justResolved
    ? "just now"
    : formatCivilDate(formatLocalDate(new Date(opts.resolvedAt), tz));
  const parts = ["Resolved by you", when];
  if (opts.outcomeLabel) parts.push(opts.outcomeLabel);
  return parts.join(" · ");
}

/**
 * Trainer resolve timeline line (frames 02 / 132):
 * "Resolved by you · {outcome} · {weekday date, time}" when outcome is known.
 */
export function trainerResolveTimelineText(opts: {
  resolvedAt: string;
  outcomeLabel: string | null;
  timeZone?: string;
}): string {
  const when = formatTimelineDateTime(
    opts.resolvedAt,
    opts.timeZone ?? VIEWER_TZ,
  );
  const parts = ["Resolved by you"];
  if (opts.outcomeLabel) parts.push(opts.outcomeLabel);
  parts.push(when);
  return parts.join(" · ");
}

function isTrainerClose(
  closedReason: ExceptionClosedReason | null,
): boolean {
  // coaching_ended is the only non-trainer close with a locked frame.
  return closedReason !== "coaching_ended";
}

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
    return kind
      ? `Logged: Changed · ${labelFor("meal_deviation_kind", kind)}`
      : "Logged: Changed";
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

/** Logged row value of the source card (frame 02: "Nothing logged"). */
function loggedValue(detail: ExceptionDetail): string {
  const line = loggedLine(detail).replace(/^Logged: /, "");
  return line === "nothing yet" ? "Nothing logged" : line;
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
 * Window row of the source card (frame 02). Workouts have a whole-day window
 * (it closes at midnight), so "Due by 12:00 am" read as wrong: show the end
 * of the planned day. Meals and check-ins keep their real due time.
 */
export function windowLine(
  detail: Pick<ExceptionDetail, "sourceEntityType" | "details">,
  dueIso: string | null,
): string {
  const localDate = detailString(detail.details, "localDate");
  const day = localDate ? formatCivilDate(localDate) : null;
  if (detail.sourceEntityType === "workout_assignment" && day) {
    return `Due by end of ${day}`;
  }
  if (!dueIso) return day ? `Due ${day}` : "No due time";
  const clock = formatClockTime(dueIso, VIEWER_TZ);
  if (clock === "12:00 am" && day) return `Due by end of ${day}`;
  return day ? `Due by ${clock} ${day}` : `Due by ${clock}`;
}

/** Planned row of the source card, e.g. "Lower body A · 5 exercises · 16 sets". */
function plannedValue(
  detail: ExceptionDetail,
  plannedTitle: string | null,
  plannedLine: string | null,
): string {
  const title =
    plannedTitle ??
    detailString(detail.details, "mealName") ??
    labelFor("exception_type", detail.type);
  return plannedLine ? `${title} · ${plannedLine}` : title;
}

function SourceGlyph({ type }: { type: ExceptionDetail["sourceEntityType"] }) {
  const props = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
  if (type === "workout_assignment") return <Dumbbell {...props} />;
  if (type === "meal_assignment") return <Utensils {...props} />;
  return <ClipboardCheck {...props} />;
}

type PendingResolve = {
  id: string;
  gen: number;
  needsAck: boolean;
  note: string | null;
  outcome: OutcomeId;
};

/** Keys the panel shortcuts ignore while the trainer types. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable),
  );
}

/**
 * Home side panel v3 (Z7-5, frames 02 / 193).
 *
 * List mode (D-W7-2): with `?client=<relationshipId>` in the URL (or a
 * `relationshipId` prop) the panel lists only that client's open exceptions,
 * newest first, at most 10 plus "n more"; arrows and ←/→ step through them
 * and `exceptionId` (`&exception=<id>`) preselects one. Without a client the
 * panel shows the one item it was opened for.
 */
export function ExceptionDrawer({
  exceptionId,
  relationshipId,
  openSeq,
  onClose,
  onChanged,
}: {
  /** Item to show first (`&exception=<id>`); optional in list mode. */
  exceptionId?: string | null;
  /** Client whose open items the panel walks (D-W7-2 `?client=`). */
  relationshipId?: string | null;
  /**
   * Bumped by the parent on every open, including a quick reopen of the same
   * item before the previous close has committed (DR1 QA F2).
   */
  openSeq?: number;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const clientParam = searchParams.get("client");
  const listRid = relationshipId ?? clientParam ?? null;

  const listRidRef = useRef(listRid);
  listRidRef.current = listRid;
  /**
   * Control to focus once the next render has it (Resolve → Undo, Undo →
   * Resolve, commit → Next item / Close), so focus never drops to <body>.
   */
  const pendingFocusRef = useRef<"undo" | "resolve" | "after-commit" | null>(
    null,
  );
  /** Item as it was before an optimistic Resolve, restored by Undo. */
  const preResolveDetailRef = useRef<ExceptionDetail | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(
    exceptionId ?? null,
  );
  const [list, setList] = useState<PanelList | null>(null);
  const [resolvedIds, setResolvedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /** Outcome chosen per item in this panel session (DTO does not return it). */
  const [sessionOutcomes, setSessionOutcomes] = useState<
    Readonly<Record<string, OutcomeId>>
  >({});
  const [detail, setDetail] = useState<ExceptionDetail | null>(null);
  const [clientName, setClientName] = useState("Client");
  const [clientHeader, setClientHeader] = useState<WorkspaceHeader | null>(
    null,
  );
  const [clientWhatsappE164, setClientWhatsappE164] = useState<string | null>(
    null,
  );
  const [plannedTitle, setPlannedTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<OutcomeId>("talked");
  const [showResolveForm, setShowResolveForm] = useState(false);
  /** True while Resolve is optimistic and Undo can cancel before POST. */
  const [resolveUndoPending, setResolveUndoPending] = useState(false);
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
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nudgeRef = useRef<() => void>(() => undefined);
  const stepRef = useRef<(delta: number) => void>(() => undefined);
  // DR1: set synchronously the moment a close is requested. The parent's
  // close is a router navigation (a React transition), so the drawer and its
  // key listener can stay mounted for a frame or more under load; while this
  // is set, the listener ignores every key.
  const closingRef = useRef(false);
  const mountedRef = useRef(true);
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const clientParamRef = useRef(clientParam);
  clientParamRef.current = clientParam;
  /** After stepping to another item, keep focus inside the panel. */
  const focusAfterNavRef = useRef(false);

  // A new item, or the same item opened again, in the same drawer instance
  // is a fresh open. Layout effect: reset before any key can reach the
  // listener for the newly committed open.
  useLayoutEffect(() => {
    closingRef.current = false;
  }, [exceptionId, openSeq]);

  // The parent preselects another item (same instance): show it.
  useEffect(() => {
    if (exceptionId) setCurrentId(exceptionId);
  }, [exceptionId]);

  // DR2 (DR1 QA F-C): Esc, then browser Back before the close commits. The
  // history traversal brings this same item back, but the router's rendered
  // location never changed (the close was still a pending transition), so no
  // prop or location.key change reaches this instance. The popstate event is
  // the only signal: if the URL it lands on shows this item, it is a fresh
  // open. A traversal to a URL without this item leaves the flag set, so the
  // drawer stays inert until it unmounts.
  // In `?client=`-only mode (no preselected item) the URL names the client,
  // so landing back on this client is the fresh open.
  useEffect(() => {
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const shown = params.get("exception");
      const shownClient = params.get("client");
      if (exceptionId ? shown === exceptionId : Boolean(shownClient && shownClient === listRidRef.current)) {
        closingRef.current = false;
      }
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [exceptionId]);

  /** Leaving the drawer by any route: from now on no shortcut may act. */
  const markClosing = useCallback(() => {
    closingRef.current = true;
  }, []);

  const resolveTimerRef = useRef<number | null>(null);
  const resolveGenRef = useRef(0);
  const pendingRef = useRef<PendingResolve | null>(null);
  /** After Mark reviewed unmounts, restore focus inside the open drawer. */
  const restoreFocusAfterReviewRef = useRef(false);
  const loadSeqRef = useRef(0);

  const load = useCallback(async (id: string, opts?: { quiet?: boolean }) => {
    const seq = ++loadSeqRef.current;
    const stale = () => seq !== loadSeqRef.current || !mountedRef.current;
    // Quiet reload after an action keeps the drawer content on screen.
    if (!opts?.quiet) setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getException(id);
      if (stale()) return;
      setDetail(result);

      let title: string | null =
        detailString(result.details, "mealName") ?? null;
      let due =
        windowEndIso(result.details) ??
        detailString(result.details, "windowEndsAt");
      let line: string | null = null;
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
          line =
            exercises.length > 0
              ? `${exercises.length} exercise${exercises.length === 1 ? "" : "s"} · ${sets} set${sets === 1 ? "" : "s"}`
              : null;
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
      if (stale()) return;
      setPlannedTitle(title);
      setPlannedLine(line);
      setDueByIso(due);
    } catch (err) {
      if (stale()) return;
      const is404 =
        err instanceof ApiClientError &&
        (err.status === 404 || err.code === "EXCEPTION_NOT_FOUND");
      setError(is404 ? "This item no longer exists" : err instanceof ApiClientError ? err.message : "This item no longer exists");
      setDetail(null);
    } finally {
      if (!stale()) setLoading(false);
    }
  }, []);
  const loadRef = useRef(load);
  loadRef.current = load;

  // List mode: that client's open items only (D11), newest first.
  useEffect(() => {
    if (!listRid) {
      setList(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiClient.listExceptions(listRid);
        if (cancelled) return;
        const next = buildPanelList(res.items);
        setList(next);
        setCurrentId((prev) => prev ?? next.items[0]?.id ?? null);
        if (next.items.length === 0) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setList({ items: [], moreCount: 0 });
        setLoading(false);
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load this client's items.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listRid]);

  useEffect(() => {
    if (currentId) void load(currentId);
  }, [currentId, load]);

  // Client header, WhatsApp and reminder line: once per client.
  const workspaceRid = listRid ?? detail?.coachingRelationshipId ?? null;
  useEffect(() => {
    if (!workspaceRid) return;
    let cancelled = false;
    void (async () => {
      try {
        const ws = await apiClient.getClientWorkspace(workspaceRid);
        if (cancelled) return;
        setClientName(ws.header.traineeDisplayName || "Client");
        setClientHeader(ws.header ?? null);
        setClientWhatsappE164(ws.header.clientWhatsappE164 ?? null);
      } catch {
        if (cancelled) return;
        setClientName("Client");
        setClientHeader(null);
        setClientWhatsappE164(null);
      }
      try {
        const resp = await stage1Api.getResponsiveness(workspaceRid, 14);
        if (cancelled) return;
        setReminderLine(compactHeadline(resp, "their"));
        if (resp.label === "reminders_paused") {
          setNudgePaused(true);
        }
      } catch {
        if (!cancelled) setReminderLine(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceRid]);

  /**
   * POST the resolve the trainer confirmed. Runs when the 5 s Undo window
   * ends, or straight away when the trainer moves on (Next, arrows, close):
   * the panel already said "Resolved", so leaving must not drop it.
   */
  const commitResolve = useCallback(async (p: PendingResolve) => {
    if (pendingRef.current?.gen === p.gen) pendingRef.current = null;
    if (resolveTimerRef.current != null) {
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
    const isCurrent = () =>
      mountedRef.current && currentIdRef.current === p.id;
    if (isCurrent()) setActing(true);
    try {
      if (p.needsAck) {
        // API resolves only reviewed items; Resolve on an open item marks
        // it reviewed first so the trainer never needs two clicks.
        await apiClient.acknowledgeException(
          p.id,
          { note: null },
          createIdempotencyKey(),
        );
      }
      await apiClient.resolveException(
        p.id,
        { note: p.note, outcome: p.outcome },
        createIdempotencyKey(),
      );
      if (isCurrent()) {
        // Undo leaves the screen: if it (or nothing) held focus, move it to
        // the footer's Next item / Close.
        const activeEl = document.activeElement;
        const panel = panelRef.current;
        if (
          !activeEl ||
          activeEl === document.body ||
          (activeEl instanceof HTMLElement && activeEl.classList.contains("sp-undo")) ||
          (panel && !panel.contains(activeEl))
        ) {
          pendingFocusRef.current = "after-commit";
        }
        setResolveUndoPending(false);
        await loadRef.current(p.id, { quiet: true });
      }
      onChangedRef.current?.();
    } catch (err) {
      if (!mountedRef.current) return;
      setResolvedIds((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
      setSessionOutcomes((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      if (isCurrent()) {
        pendingFocusRef.current = "resolve";
        setResolveUndoPending(false);
        await loadRef.current(p.id, { quiet: true });
        setError(
          err instanceof ApiClientError ? err.message : "Could not resolve.",
        );
      } else {
        // The trainer already moved on: name the item instead of blaming
        // the one on screen. It is back in Also open.
        const idx = itemsRef.current.findIndex((item) => item.id === p.id);
        setError(
          idx >= 0
            ? `Could not resolve item ${idx + 1}. It is still open.`
            : "Could not resolve the previous item. It is still open.",
        );
      }
    } finally {
      if (mountedRef.current) setActing(false);
    }
  }, []);

  const flushPendingResolve = useCallback(() => {
    const pending = pendingRef.current;
    if (pending) void commitResolve(pending);
  }, [commitResolve]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Closing during the Undo window keeps the resolve (see commitResolve).
      const pending = pendingRef.current;
      if (pending) void commitResolve(pending);
      if (resolveTimerRef.current != null) {
        window.clearTimeout(resolveTimerRef.current);
        resolveTimerRef.current = null;
      }
    };
  }, [commitResolve]);

  /** Every close path goes through here (Esc, X, backdrop, Close, Resolve). */
  const requestClose = useCallback(() => {
    markClosing();
    flushPendingResolve();
    onClose();
    // D-W7-2: the panel is open while `?client=` is in the URL, so closing
    // clears it too (replacing the parent's own close entry).
    if (clientParamRef.current) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("client");
          next.delete("exception");
          return next;
        },
        { replace: true },
      );
    }
  }, [markClosing, flushPendingResolve, onClose, setSearchParams]);

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
    if (!currentId) return;
    const id = currentId;
    setActing(true);
    setError(null);
    try {
      await apiClient.acknowledgeException(
        id,
        { note: note.trim() || null },
        createIdempotencyKey(),
      );
      setNote("");
      restoreFocusAfterReviewRef.current = true;
      await load(id, { quiet: true });
      onChanged?.();
    } catch (err) {
      restoreFocusAfterReviewRef.current = false;
      setError(
        err instanceof ApiClientError ? err.message : "Could not mark reviewed.",
      );
    } finally {
      setActing(false);
    }
  }

  function undoPendingResolve() {
    const pending = pendingRef.current;
    if (resolveTimerRef.current != null) {
      window.clearTimeout(resolveTimerRef.current);
      resolveTimerRef.current = null;
    }
    resolveGenRef.current += 1;
    pendingRef.current = null;
    setResolveUndoPending(false);
    // Show the item as it was straight away so Resolve is there to focus.
    const before = preResolveDetailRef.current;
    preResolveDetailRef.current = null;
    if (before && pending && before.id === pending.id) setDetail(before);
    pendingFocusRef.current = "resolve";
    if (pending) {
      setResolvedIds((prev) => {
        const next = new Set(prev);
        next.delete(pending.id);
        return next;
      });
      setSessionOutcomes((prev) => {
        const next = { ...prev };
        delete next[pending.id];
        return next;
      });
    }
    setError(null);
    if (currentId) void load(currentId, { quiet: true });
  }

  function resolve() {
    if (!detail || resolveUndoPending || pendingRef.current) return;
    setError(null);
    const chosenOutcome = outcome;
    const noteText = note.trim() || null;
    const needsAck =
      detail.status === "detected" || detail.status === "active";
    const optimisticAt = new Date().toISOString();
    const id = detail.id;

    // Frame 02: optimistic resolved banner + Undo before the POST commits.
    preResolveDetailRef.current = detail;
    pendingFocusRef.current = "undo";
    setSessionOutcomes((prev) => ({ ...prev, [id]: chosenOutcome }));
    setResolvedIds((prev) => new Set(prev).add(id));
    setResolveUndoPending(true);
    setShowResolveForm(false);
    setNote("");
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            status: "resolved",
            resolvedAt: optimisticAt,
            closedReason: "trainer",
            updatedAt: optimisticAt,
          }
        : prev,
    );

    const gen = ++resolveGenRef.current;
    pendingRef.current = {
      id,
      gen,
      needsAck,
      note: noteText,
      outcome: chosenOutcome,
    };
    resolveTimerRef.current = window.setTimeout(() => {
      const pending = pendingRef.current;
      if (pending && pending.gen === gen) void commitResolve(pending);
    }, RESOLVE_UNDO_MS);
  }

  const items = list?.items ?? [];
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listIndex = currentId
    ? items.findIndex((item) => item.id === currentId)
    : -1;

  /** Step to another of this client's items (arrows, ←/→, Also open, Next). */
  function goTo(index: number) {
    const target = items[index];
    if (!target || target.id === currentId) return;
    flushPendingResolve();
    setResolveUndoPending(false);
    setNote("");
    setOutcome("talked");
    setShowResolveForm(false);
    setNudgeHint(null);
    setError(null);
    setDetail(null);
    setPlannedTitle(null);
    setPlannedLine(null);
    setDueByIso(null);
    setLoading(true);
    focusAfterNavRef.current = true;
    setCurrentId(target.id);
  }

  stepRef.current = (delta: number) => {
    if (listIndex < 0) return;
    const next = listIndex + delta;
    if (next < 0 || next >= items.length) return;
    goTo(next);
  };

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

  // Docked (>= 1024 px): the panel sits under the top bar, which stays
  // visible (DESIGN-NOTES "Home side panel"). Narrower widths overlay.
  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    if (!backdrop) return;
    function place() {
      const bar = document.querySelector<HTMLElement>(".shell-topbar, .top-bar");
      const bottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      backdrop!.style.setProperty("--sp-top", `${Math.round(bottom)}px`);
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, []);

  const resolved = detail?.status === "resolved";
  const acknowledged = detail?.status === "acknowledged";
  const active =
    detail &&
    (detail.status === "detected" || detail.status === "active");

  // Mark reviewed removes its own button; move focus to Resolve (now primary)
  // or Close so document.body never holds focus while aria-modal is open.
  // Wait until acting clears — Resolve is disabled while the request runs, and
  // disabled controls cannot take focus (happy-dom and browsers).
  useLayoutEffect(() => {
    if (!restoreFocusAfterReviewRef.current) return;
    if (active || acting) return;
    restoreFocusAfterReviewRef.current = false;
    const panel = panelRef.current;
    if (!panel) return;
    const activeEl = document.activeElement;
    if (activeEl instanceof Node && panel.contains(activeEl)) return;
    const next =
      panel.querySelector<HTMLElement>(".drawer-foot .button-primary") ??
      closeRef.current;
    next?.focus();
  }, [active, acting, acknowledged, detail]);

  // Resolve → Undo, Undo → Resolve, commit → Next item (or Close).
  useLayoutEffect(() => {
    const want = pendingFocusRef.current;
    if (!want) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target =
      want === "undo"
        ? panel.querySelector<HTMLButtonElement>(".sp-undo")
        : want === "resolve"
          ? panel.querySelector<HTMLButtonElement>(".sp-resolve")
          : (panel.querySelector<HTMLButtonElement>(
              ".sp-foot-resolved .button-primary",
            ) ?? closeRef.current);
    if (target && !target.disabled) {
      pendingFocusRef.current = null;
      target.focus();
    }
  });

  // Stepping replaces the body (an Also open row or Next may unmount, an
  // arrow may disable at the end): keep focus inside on the item title.
  useLayoutEffect(() => {
    if (!focusAfterNavRef.current) return;
    const panel = panelRef.current;
    if (!panel) return;
    const activeEl = document.activeElement as HTMLElement | null;
    const kept =
      activeEl &&
      activeEl !== document.body &&
      panel.contains(activeEl) &&
      !(activeEl as HTMLButtonElement).disabled;
    if (kept) {
      focusAfterNavRef.current = false;
      return;
    }
    if (titleRef.current) {
      focusAfterNavRef.current = false;
      titleRef.current.focus();
    } else if (!loading) {
      focusAfterNavRef.current = false;
      closeRef.current?.focus();
    } else {
      // Body is loading: hold focus on Close until the title mounts.
      closeRef.current?.focus();
    }
  }, [detail, loading, currentId]);

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
      const typing = isTypingTarget(ev.target);
      if (!typing && (ev.key === "n" || ev.key === "N")) {
        ev.preventDefault();
        nudgeRef.current();
        return;
      }
      if (
        !typing &&
        (ev.key === "ArrowLeft" || ev.key === "ArrowRight") &&
        !ev.altKey &&
        !ev.metaKey &&
        !ev.ctrlKey &&
        !document.querySelector(".overflow-menu-list")
      ) {
        ev.preventDefault();
        stepRef.current(ev.key === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (ev.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const activeEl = document.activeElement;
      const inside = activeEl instanceof Node && panelRef.current.contains(activeEl);
      if (!inside) {
        ev.preventDefault();
        (ev.shiftKey ? last : first).focus();
      } else if (ev.shiftKey && activeEl === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && activeEl === last) {
        ev.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

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
  const sessionOutcomeLabel = outcomeChipLabel(
    currentId ? sessionOutcomes[currentId] ?? null : null,
  );
  const trainerClose = Boolean(
    detail?.resolvedAt && isTrainerClose(detail.closedReason),
  );
  const showTrainerResolveBanner = trainerClose;
  const resolvedTimelineText = detail?.resolvedAt
    ? trainerClose
      ? trainerResolveTimelineText({
          resolvedAt: detail.resolvedAt,
          outcomeLabel: sessionOutcomeLabel,
        })
      : `${resolvedCloseLabel(detail.closedReason)} · ${formatTimelineDateTime(detail.resolvedAt)}`
    : null;

  const inList = listIndex >= 0;
  const resolvedCount = items.filter((item) => resolvedIds.has(item.id)).length;
  const resolvedFlags = useMemo(
    () => items.map((item) => resolvedIds.has(item.id)),
    [items, resolvedIds],
  );
  const nav: PanelNav | null = inList
    ? {
        index: listIndex,
        total: items.length,
        resolved: resolvedFlags,
        resolvedCount,
        onPrev: () => stepRef.current(-1),
        onNext: () => stepRef.current(1),
      }
    : null;
  const openCount = list
    ? items.length - resolvedCount + list.moreCount
    : null;
  const meta = headerMeta(clientHeader, openCount);
  const firstName = clientName.split(" ")[0] ?? clientName;
  const clientRid = workspaceRid ?? detail?.coachingRelationshipId ?? "";
  const clientHref = `/clients/${clientRid}`;
  const nextIndex = inList
    ? nextUnresolvedIndex(items, listIndex, resolvedIds)
    : null;
  const resolvedJustNow = Boolean(
    currentId && resolved && resolvedIds.has(currentId),
  );
  const ageLine = detail
    ? resolved
      ? resolvedJustNow
        ? "Resolved just now"
        : trainerClose
          ? `Resolved ${formatCivilDate(formatLocalDate(new Date(detail.resolvedAt!), VIEWER_TZ))}`
          : resolvedCloseLabel(detail.closedReason)
      : itemAgeLine(detail)
    : null;
  const listEmpty = Boolean(list && items.length === 0 && !currentId);
  const leavePanel = (ev: {
    button: number;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }) => {
    // DR1 QA F1: a plain click navigates away in-app, so the drawer is
    // closing. Ctrl/Cmd/Shift/middle clicks open a new tab or window and
    // leave the drawer open here.
    if (
      ev.button === 0 &&
      !ev.metaKey &&
      !ev.ctrlKey &&
      !ev.shiftKey &&
      !ev.altKey
    ) {
      markClosing();
    }
  };
  const helperTotal = list ? items.length + list.moreCount : null;
  const helperItemsText =
    helperTotal == null || helperTotal <= 1
      ? "every item is resolved"
      : `all ${helperTotal} items are resolved`;

  return (
    <div
      ref={backdropRef}
      className="drawer-backdrop sp-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <div
        ref={panelRef}
        className="drawer-panel sp-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Needs attention detail"
        data-testid="screen-TW-05"
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeader
          clientName={clientName}
          meta={meta}
          nav={nav}
          severity={detail && !resolved ? detail.severity : null}
          currentResolved={Boolean(resolved)}
          closeRef={closeRef}
          onClose={requestClose}
        />

        {loading ? <LoadingBlock label="Loading…" /> : null}
        {error && !detail && !loading ? (
          <div className="drawer-body">
            <p role="alert">{error}</p>
            <Button variant="secondary" onClick={requestClose}>
              Close
            </Button>
          </div>
        ) : null}
        {listEmpty && !error && !loading ? (
          <div className="drawer-body">
            <p className="muted">No open items for {firstName}.</p>
          </div>
        ) : null}

        {detail ? (
          <>
            <div className="drawer-body sp-body">
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <div>
                <h3 ref={titleRef} className="sp-title" tabIndex={-1}>
                  {reasonHeading(detail, plannedTitle)}
                </h3>
                {ageLine ? <p className="sp-age">{ageLine}</p> : null}
              </div>

              <div className="drawer-source sp-source">
                <p className="sp-source-head">
                  <SourceGlyph type={detail.sourceEntityType} />
                  <span>
                    {sourceOrigin(
                      detail.sourceEntityType,
                      clientHeader?.effectivePlan?.title ?? null,
                    )}
                  </span>
                </p>
                <dl className="sp-source-rows">
                  <dt>
                    Planned<span className="sr-only">: </span>
                  </dt>
                  <dd>{plannedValue(detail, plannedTitle, plannedLine)}</dd>
                  <dt>
                    Window<span className="sr-only">: </span>
                  </dt>
                  <dd>{windowLine(detail, dueIso)}</dd>
                  <dt>
                    Logged<span className="sr-only">: </span>
                  </dt>
                  <dd>{loggedValue(detail)}</dd>
                </dl>
              </div>

              {showTrainerResolveBanner && detail.resolvedAt ? (
                <div
                  className="drawer-resolve-banner sp-resolve-banner"
                  role="status"
                  data-testid="exception-resolve-banner"
                >
                  <CheckCircle2 size={16} strokeWidth={2.25} aria-hidden />
                  <span>
                    {trainerResolveBannerText({
                      resolvedAt: detail.resolvedAt,
                      outcomeLabel: sessionOutcomeLabel,
                      justResolved: resolveUndoPending,
                    })}
                  </span>
                  {resolveUndoPending ? (
                    <button
                      type="button"
                      className="drawer-resolve-undo sp-undo"
                      onClick={undoPendingResolve}
                    >
                      Undo
                    </button>
                  ) : null}
                </div>
              ) : null}

              {!resolved && (reminderLine || nudgeHint) ? (
                <section className="sp-section" aria-labelledby="sp-signals">
                  <h3 id="sp-signals" className="sp-section-title">
                    Signals
                  </h3>
                  {reminderLine ? (
                    <p className="sp-signal">
                      <Bell size={16} strokeWidth={1.75} aria-hidden />
                      <span>{reminderLine}</span>
                    </p>
                  ) : null}
                  {nudgeHint ? <p className="sp-signal">{nudgeHint}</p> : null}
                </section>
              ) : null}

              {list ? (
                <AlsoOpenList
                  firstName={firstName}
                  items={items}
                  currentId={currentId}
                  resolvedIds={resolvedIds}
                  moreCount={list.moreCount}
                  clientHref={clientHref}
                  onSelect={goTo}
                  onLeave={markClosing}
                />
              ) : null}

              <section className="sp-section" aria-labelledby="sp-timeline">
                <h3 id="sp-timeline" className="sp-section-title">
                  Timeline
                </h3>
                <ul className="drawer-timeline sp-timeline">
                  <li>
                    <span className="sp-tl-what">Detected</span>
                    <span className="sp-tl-when">
                      {" · "}
                      {formatTimelineDateTime(detail.detectedAt)}
                    </span>
                  </li>
                  {detail.acknowledgedAt ? (
                    <li>
                      <span className="sp-tl-what">Marked reviewed · you</span>
                      <span className="sp-tl-when">
                        {" · "}
                        {formatTimelineDateTime(detail.acknowledgedAt)}
                      </span>
                    </li>
                  ) : null}
                  {resolvedTimelineText ? (
                    <li
                      className="is-resolved"
                      data-testid="exception-resolve-timeline"
                    >
                      {resolvedTimelineText}
                    </li>
                  ) : null}
                </ul>
              </section>

              {(acknowledged || showResolveForm) && !resolved ? (
                <>
                  <div className="drawer-outcomes" role="group" aria-label="Outcome">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className={outcome === o.id ? "is-on" : ""}
                        aria-pressed={outcome === o.id}
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

            {resolved && inList ? (
              <div className="drawer-foot sp-foot sp-foot-resolved">
                <p className="sp-foot-summary">
                  {resolvedFooterText(resolvedCount, items.length)}
                </p>
                {nextIndex != null ? (
                  <Button variant="primary" onClick={() => goTo(nextIndex)}>
                    Next item · {nextIndex + 1} of {items.length}
                    <ChevronRight size={16} strokeWidth={2} aria-hidden />
                  </Button>
                ) : (
                  <Button variant="primary" onClick={requestClose}>
                    Close
                  </Button>
                )}
              </div>
            ) : null}

            {!resolved ? (
              <div className="drawer-foot sp-foot">
                <div className="sp-actions">
                  {active ? (
                    <Button
                      variant="tinted"
                      disabled={acting || !online}
                      onClick={() => void markReviewed()}
                    >
                      Mark reviewed
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
                          markClosing();
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
                          markClosing();
                          window.location.assign(
                            `/clients/${detail.coachingRelationshipId}`,
                          );
                        },
                      },
                    ]}
                  />
                  {acknowledged || active ? (
                    <Button
                      variant="primary"
                      className="sp-resolve"
                      disabled={acting || !online}
                      onClick={() => {
                        if (!showResolveForm && !acknowledged) {
                          setShowResolveForm(true);
                          return;
                        }
                        resolve();
                      }}
                    >
                      {!acknowledged && !showResolveForm ? "Resolve…" : "Resolve"}
                    </Button>
                  ) : null}
                </div>
                <p className="drawer-helper">
                  {active
                    ? `Mark reviewed moves ${firstName} to Reviewed. ${firstName} leaves Home when ${helperItemsText}.`
                    : `Resolve closes this item. ${firstName} leaves Home when ${helperItemsText}.`}
                </p>
                <Link
                  className="link sp-open-client"
                  to={`/clients/${detail.coachingRelationshipId}`}
                  onClick={leavePanel}
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
