import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ClipboardCheck,
  Info,
  OctagonAlert,
  Sun,
} from "lucide-react";
import { ApiClientError } from "@fitbud/api-client";
import {
  formatCivilDate,
  formatLocalDate,
  formatRelative,
  labelFor,
} from "@fitbud/core";
import type {
  CoachAsk,
  ReengagementCandidatesResponse,
  SubscriptionAttentionItem,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { Button } from "../components/Button";
import { ExceptionDrawer } from "../components/ExceptionDrawer";
import { CoachAskDrawer } from "../components/CoachAskDrawer";
import { OverflowMenu } from "../components/OverflowMenu";
import { useOnlineStatus } from "../components/OfflineBanner";
import { StatusChip } from "../components/StatusChip";
import {
  ErrorState,
  errorKindFromFailure,
  type ErrorKind,
} from "../components/StatePanels";
import { apiClient } from "../lib/api";
import {
  issueLine,
  type AttentionGroup,
  type AttentionItem,
} from "../lib/attentionIssueLine";
import { createIdempotencyKey } from "../lib/idempotency";
import { stage1Api } from "../lib/stage1-api";
import {
  isEditableTarget,
  useRowShortcutGuard,
} from "../hooks/useRowShortcutGuard";
import { useRealtimeHints } from "../realtime/useRealtimeHints";

type ReengagementCandidate = ReengagementCandidatesResponse["items"][number];
type ActivityEvent = {
  id: string;
  traineeDisplayName: string | null;
  summary: string;
  occurredAt: string;
  traineeLocalTime: string | null;
};

const ATTENTION_CAP = 8;
const SECTION_CAP = 5;

type FilterKey = "all" | "attention" | "checkins" | "renewals";

function severityRank(severity: "critical" | "attention"): number {
  return severity === "critical" ? 0 : 1;
}

function pickPrimaryItem(group: AttentionGroup): AttentionItem | undefined {
  const open = group.items.filter(
    (i) => i.status === "detected" || i.status === "active",
  );
  const pool = open.length > 0 ? open : group.items;
  return [...pool].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return b.ageMinutes - a.ageMinutes;
  })[0];
}

function oldestOpenAge(group: AttentionGroup): number {
  const open = group.items.filter(
    (i) => i.status === "detected" || i.status === "active",
  );
  if (open.length === 0) return group.items[0]?.ageMinutes ?? 0;
  return Math.max(...open.map((i) => i.ageMinutes));
}

/** Short ages for Home rows: "since 1 d", "20 h", "12 min". */
function formatAttentionAge(ageMinutes: number): string {
  if (ageMinutes < 60) {
    const mins = Math.max(0, ageMinutes);
    return mins === 1 ? "since 1 min" : `since ${mins} min`;
  }
  if (ageMinutes < 24 * 60) {
    const hours = Math.round(ageMinutes / 60);
    return hours === 1 ? "1 h" : `${hours} h`;
  }
  const days = Math.round(ageMinutes / (24 * 60));
  return days === 1 ? "since 1 d" : `since ${days} d`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

function avatarClass(name: string): string {
  const n = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return `home-av c${(n % 8) + 1}`;
}

function askItemLabel(ask: CoachAsk): string {
  return (
    ask.itemLabel?.trim() ||
    labelFor("coach_ask_item_type", ask.itemType) ||
    "an item"
  );
}

function askDateLabel(ask: CoachAsk): string | null {
  if (ask.itemDate) return formatCivilDate(ask.itemDate);
  return null;
}

export function HomePage() {
  const { me } = useAuth();
  const online = useOnlineStatus();
  const timeZone =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const todayLabel = formatCivilDate(formatLocalDate(new Date(), timeZone));
  const [params, setParams] = useSearchParams();
  const drawerExceptionId = params.get("exception");
  const drawerAskId = params.get("ask");
  const showAllParam = params.get("all") === "1";
  const groupParam = params.get("group");

  const [groups, setGroups] = useState<AttentionGroup[]>([]);
  const [coachAsks, setCoachAsks] = useState<CoachAsk[]>([]);
  const [reengage, setReengage] = useState<ReengagementCandidate[]>([]);
  const [renewals, setRenewals] = useState<SubscriptionAttentionItem[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [gettingStarted, setGettingStarted] = useState<
    Array<{
      id: string;
      kind: "intake" | "invite";
      name: string;
      subtitle: string;
      href?: string;
      inviteId?: string;
    }>
  >([]);
  const [nameByRid, setNameByRid] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    message: string;
    requestId?: string | null;
    kind?: ErrorKind;
  } | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>(
    {},
  );
  const [filter, setFilter] = useState<FilterKey>(
    groupParam === "attention"
      ? "attention"
      : groupParam === "checkins"
        ? "checkins"
        : groupParam === "renewals"
          ? "renewals"
          : "all",
  );
  const [showAllAttention, setShowAllAttention] = useState(showAllParam);
  const [reviewedOpen, setReviewedOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    undo?: () => void;
  } | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  // HM4 F1: mirror of focusIdx, and a flag that tells the focusIdx effect not
  // to move focus when the selection followed focus the trainer already moved.
  const focusIdxRef = useRef(0);
  const skipRowFocusRef = useRef(false);
  const {
    onGridFocus,
    onGridPointerDown,
    armFromKeyboard,
    noteDrawerClosed,
    focusWithoutArming,
    allowRowShortcut,
  } = useRowShortcutGuard();
  const undoTimer = useRef<number | null>(null);

  // One fetch at a time. A quiet refresh requested while another load is in
  // flight is coalesced into a single follow-up run (no double-fetch).
  const inFlight = useRef<Promise<void> | null>(null);
  const rerunQueued = useRef(false);

  const runLoad = useCallback(async (opts?: { quiet?: boolean }) => {
    const quiet = opts?.quiet === true;
    if (!quiet) {
      setLoading(true);
      setError(null);
      setSectionErrors({});
    }
    const nextErrors: Record<string, string> = {};
    try {
      const results = await Promise.allSettled([
        stage1Api.getAttentionGroups(),
        stage1Api.listCoachAsks({ status: "open" }) as Promise<{
          items: CoachAsk[];
        }>,
        stage1Api.getReengagementCandidates(),
        apiClient.listSubscriptionAttention(),
        apiClient.listTrainerCheckinInbox(),
        apiClient.listClients({ limit: 100 }),
        apiClient.listInvitations(),
        stage1Api.getActivityFeed({ limit: 8 }) as Promise<{
          events: ActivityEvent[];
        }>,
      ]);

      const attention =
        results[0].status === "fulfilled" ? results[0].value : null;
      if (!attention) {
        nextErrors.attention = "Couldn't load needs attention";
        if (!quiet) setGroups([]);
      } else {
        setGroups(attention.groups);
      }

      if (results[1].status === "fulfilled") {
        setCoachAsks(results[1].value.items);
      } else {
        nextErrors.asks = "Couldn't load asked-coach items";
        if (!quiet) setCoachAsks([]);
      }

      if (results[2].status === "fulfilled") {
        setReengage(results[2].value.items);
      } else if (!quiet) {
        setReengage([]);
      }

      if (results[3].status === "fulfilled") {
        setRenewals(results[3].value.items);
      } else {
        nextErrors.renewals = "Couldn't load renewals";
        if (!quiet) setRenewals([]);
      }

      if (results[4].status === "fulfilled") {
        setCheckins(
          results[4].value.items.filter(
            (i) => i.checkin.status === "submitted",
          ),
        );
      } else {
        nextErrors.checkins = "Couldn't load check-ins";
        if (!quiet) setCheckins([]);
      }

      const names = new Map<string, string>();
      const started: typeof gettingStarted = [];
      if (results[5].status === "fulfilled") {
        for (const row of results[5].value.items) {
          if (row.relationshipId && row.traineeDisplayName) {
            names.set(row.relationshipId, row.traineeDisplayName);
          }
          if (row.status === "onboarding_submitted") {
            started.push({
              id: `intake-${row.relationshipId}`,
              kind: "intake",
              name: row.traineeDisplayName,
              subtitle: "Intake submitted",
              href: `/clients/${row.relationshipId}/onboarding`,
            });
          }
        }
      }
      if (results[6].status === "fulfilled") {
        for (const inv of results[6].value.items) {
          if (inv.status !== "pending") continue;
          started.push({
            id: `invite-${inv.id}`,
            kind: "invite",
            name: inv.recipientDisplayName || inv.recipientEmail || "Invite",
            subtitle: inv.createdAt
              ? `Invite sent ${formatCivilDate(formatLocalDate(new Date(inv.createdAt), timeZone))} · not accepted yet`
              : "Invite not accepted yet",
            inviteId: inv.id,
          });
        }
      }
      setGettingStarted(started.slice(0, SECTION_CAP));

      if (attention) {
        for (const g of attention.groups) {
          names.set(g.relationshipId, g.traineeDisplayName);
        }
      }
      if (!quiet) {
        setNameByRid(names);
      } else if (names.size > 0) {
        setNameByRid((prev) => {
          const merged = new Map(prev);
          for (const [k, v] of names) merged.set(k, v);
          return merged;
        });
      }

      if (results[7].status === "fulfilled") {
        setActivity(results[7].value.events.slice(0, 6));
      } else if (!quiet) {
        setActivity([]);
      }

      if (!quiet) {
        setSectionErrors(nextErrors);
        if (!attention) {
          const attentionErr =
            results[0].status === "rejected" ? results[0].reason : null;
          const kind =
            attentionErr instanceof ApiClientError
              ? errorKindFromFailure({
                  status: attentionErr.status,
                  code: attentionErr.code,
                  message: attentionErr.message,
                })
              : "server";
          setError({
            message:
              attentionErr instanceof ApiClientError
                ? attentionErr.message
                : "Could not load your home feed.",
            requestId:
              attentionErr instanceof ApiClientError
                ? attentionErr.requestId
                : null,
            kind,
          });
        }
      }
    } catch (err) {
      if (!quiet) {
        const kind =
          err instanceof ApiClientError
            ? errorKindFromFailure({
                status: err.status,
                code: err.code,
                message: err.message,
              })
            : "server";
        setError({
          message:
            err instanceof ApiClientError
              ? err.message
              : "Could not load your home feed.",
          requestId: err instanceof ApiClientError ? err.requestId : null,
          kind,
        });
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [timeZone]);

  /**
   * Full load (skeleton) only for the first paint and explicit Retry. Every
   * action-driven refresh passes `quiet: true` so rows stay mounted, header
   * counts stay visible and scroll position is kept.
   */
  const load = useCallback(
    async (opts?: { quiet?: boolean }): Promise<void> => {
      if (inFlight.current) {
        if (opts?.quiet) {
          rerunQueued.current = true;
          return inFlight.current;
        }
      }
      const run = (async () => {
        try {
          await runLoad(opts);
        } finally {
          inFlight.current = null;
          if (rerunQueued.current) {
            rerunQueued.current = false;
            void load({ quiet: true });
          }
        }
      })();
      inFlight.current = run;
      return run;
    },
    [runLoad],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Quiet poll so new coach asks / attention appear within ~5s.
  useEffect(() => {
    const id = window.setInterval(() => {
      void load({ quiet: true });
    }, 4000);
    return () => window.clearInterval(id);
  }, [load]);

  useRealtimeHints(apiClient, [...nameByRid.keys()], () => {
    void load({ quiet: true });
  });

  const openGroups = useMemo(() => {
    return groups
      .map((g) => ({
        group: g,
        primary: pickPrimaryItem(g),
        openItems: g.items.filter(
          (i) => i.status === "detected" || i.status === "active",
        ),
      }))
      .filter((row) => row.primary && row.openItems.length > 0)
      .sort((a, b) => {
        const sev =
          severityRank(a.primary!.severity) - severityRank(b.primary!.severity);
        if (sev !== 0) return sev;
        const age = oldestOpenAge(b.group) - oldestOpenAge(a.group);
        if (age !== 0) return age;
        return a.group.traineeDisplayName.localeCompare(
          b.group.traineeDisplayName,
        );
      });
  }, [groups]);

  const reviewedGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          group: g,
          items: g.items.filter((i) => i.status === "acknowledged"),
        }))
        .filter((g) => g.items.length > 0),
    [groups],
  );

  const visibleOpen = showAllAttention
    ? openGroups
    : openGroups.slice(0, ATTENTION_CAP);

  function openException(id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("exception", id);
      next.delete("ask");
      return next;
    });
  }

  function openAsk(id: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("ask", id);
      next.delete("exception");
      return next;
    });
  }

  const closeDrawer = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("exception");
      next.delete("ask");
      return next;
    });
  }, [setParams]);

  const closeDrawerWithFocus = useCallback(() => {
    noteDrawerClosed();
    closeDrawer();
    // Restored focus must not arm the a / n / o row shortcuts (HM4).
    focusWithoutArming(rowRefs.current[focusIdx]);
  }, [closeDrawer, focusIdx, focusWithoutArming, noteDrawerClosed]);

  // Ask drawer: remember whether the open ask was just answered so the close
  // handler can skip its (soon to be removed) row and pick a neighbour.
  const answeredAskIdRef = useRef<string | null>(null);
  const homeTitleRef = useRef<HTMLHeadingElement>(null);

  const markAskChanged = useCallback(() => {
    answeredAskIdRef.current = drawerAskId;
    void load({ quiet: true });
  }, [drawerAskId, load]);

  const closeAskDrawerWithFocus = useCallback(() => {
    const askId = drawerAskId;
    const answered = askId != null && answeredAskIdRef.current === askId;
    answeredAskIdRef.current = null;
    noteDrawerClosed();
    closeDrawer();
    const visibleIds = coachAsks.slice(0, SECTION_CAP).map((a) => a.id);
    const idx = askId ? visibleIds.indexOf(askId) : -1;
    const candidates: string[] = [];
    if (askId && !answered) candidates.push(askId);
    if (idx >= 0) {
      // Neighbours that stay on screen after a refresh.
      for (const id of [...visibleIds.slice(idx + 1), ...visibleIds.slice(0, idx).reverse()]) {
        candidates.push(id);
      }
    }
    for (const id of candidates) {
      const btn = document.querySelector<HTMLButtonElement>(
        `button[data-ask-answer="${CSS.escape(id)}"]`,
      );
      if (btn && !btn.disabled) {
        btn.focus();
        return;
      }
    }
    // Fallback: the page title (not a row, so stray typing cannot hit the
    // Home grid shortcuts).
    homeTitleRef.current?.focus();
  }, [closeDrawer, coachAsks, drawerAskId, noteDrawerClosed]);

  function showToast(message: string, undo?: () => void) {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    setToast({ message, undo });
    undoTimer.current = window.setTimeout(() => setToast(null), 5000);
  }

  async function acknowledgeFromOverflow(
    exceptionId: string,
    relationshipId: string,
  ) {
    const key = createIdempotencyKey();
    // Optimistic: delay POST 5s for Undo (TW-05).
    let cancelled = false;
    showToast("Marked reviewed", () => {
      cancelled = true;
      setToast(null);
      void load({ quiet: true });
    });
    // Move visually by refetch after delay unless undone
    window.setTimeout(() => {
      if (cancelled) return;
      void apiClient
        .acknowledgeException(exceptionId, { note: null }, key)
        .then(() => load({ quiet: true }))
        .catch(() => load({ quiet: true }));
    }, 5000);
    // Immediate optimistic UI: remove from open by soft-filtering locally
    setGroups((prev) =>
      prev.map((g) =>
        g.relationshipId !== relationshipId
          ? g
          : {
              ...g,
              items: g.items.map((i) =>
                i.id === exceptionId
                  ? { ...i, status: "acknowledged" as const }
                  : i,
              ),
            },
      ),
    );
  }

  async function nudgeClient(relationshipId: string, exceptionId: string) {
    try {
      const detail = await apiClient.getException(exceptionId);
      const activityType =
        detail.sourceEntityType === "workout_assignment"
          ? "workout"
          : detail.sourceEntityType === "meal_assignment"
            ? "meal"
            : "checkin";
      await apiClient.nudgeActivity(relationshipId, {
        activityType,
        activityId: detail.sourceEntityId,
      });
      showToast("Nudge queued");
    } catch {
      showToast("Could not nudge right now");
    }
  }

  function onGridKey(ev: ReactKeyboardEvent<HTMLDivElement>) {
    const max = visibleOpen.length - 1;
    if (max < 0) return;
    if (isEditableTarget(ev.target)) return;
    const key = ev.key.toLowerCase();
    // Arrow / Home / End are deliberate navigation and arm the row shortcuts;
    // j / k move too but don't arm them (they could be stray typing).
    if (ev.key.startsWith("Arrow") || key === "home" || key === "end") {
      armFromKeyboard();
    }
    if ((key === "a" || key === "n" || key === "o") && !allowRowShortcut(ev)) {
      return;
    }
    if (key === "arrowdown" || key === "j") {
      ev.preventDefault();
      setFocusIdx((i) => Math.min(max, i + 1));
    } else if (key === "arrowup" || key === "k") {
      ev.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (key === "home") {
      ev.preventDefault();
      setFocusIdx(0);
    } else if (key === "end") {
      ev.preventDefault();
      setFocusIdx(max);
    } else if (key === "enter") {
      ev.preventDefault();
      const row = visibleOpen[focusIdx];
      if (row?.primary) openException(row.primary.id);
    } else if (key === "a") {
      ev.preventDefault();
      if (!online) return;
      const row = visibleOpen[focusIdx];
      if (row?.primary) {
        void acknowledgeFromOverflow(row.primary.id, row.group.relationshipId);
      }
    } else if (key === "o") {
      ev.preventDefault();
      const row = visibleOpen[focusIdx];
      if (row) {
        window.location.assign(`/clients/${row.group.relationshipId}`);
      }
    } else if (key === "n") {
      ev.preventDefault();
      if (!online) return;
      const row = visibleOpen[focusIdx];
      if (row?.primary) {
        void nudgeClient(row.group.relationshipId, row.primary.id);
      }
    } else if (key === "escape" && drawerExceptionId) {
      noteDrawerClosed();
      closeDrawer();
      focusWithoutArming(rowRefs.current[focusIdx]);
    }
  }

  // HM4 F1: when focus (click, Tab, Shift+Tab) lands inside a row, that row
  // becomes the selected one, so a / n / o act on the row that has focus.
  function selectRowFromTarget(target: EventTarget | null) {
    if (!target || typeof (target as Element).closest !== "function") return;
    const rowEl = (target as Element).closest('[role="row"]');
    if (!rowEl) return;
    const idx = rowRefs.current.indexOf(rowEl as HTMLDivElement);
    if (idx < 0 || idx >= visibleOpen.length) return;
    if (idx === focusIdxRef.current) return;
    focusIdxRef.current = idx;
    skipRowFocusRef.current = true;
    setFocusIdx(idx);
  }

  function onGridFocusIn(ev: ReactFocusEvent<HTMLDivElement>) {
    selectRowFromTarget(ev.target);
    onGridFocus();
  }

  function onGridPointerDownIn(ev: ReactPointerEvent<HTMLDivElement>) {
    selectRowFromTarget(ev.target);
    onGridPointerDown();
  }

  useEffect(() => {
    focusIdxRef.current = focusIdx;
    if (skipRowFocusRef.current) {
      // Focus is already inside this row (maybe on its button); keep it there.
      skipRowFocusRef.current = false;
      return;
    }
    rowRefs.current[focusIdx]?.focus();
  }, [focusIdx]);

  const attentionCount = openGroups.length;
  const checkinCount = checkins.length;
  const renewalCount = renewals.length;
  const firstNames = openGroups
    .slice(0, 2)
    .map((r) => r.group.traineeDisplayName.split(" ")[0])
    .filter(Boolean);
  const summary = error
    ? null
    : loading
      ? "Loading your day…"
      : attentionCount === 0
        ? "You're all caught up. Nothing needs your attention right now."
        : `${attentionCount} client${attentionCount === 1 ? "" : "s"} need you.${
            firstNames.length ? ` ${firstNames.join(" and ")} first.` : ""
          }`;

  const showAttention = filter === "all" || filter === "attention";
  const showCheckinsRail = filter === "all" || filter === "checkins";
  const showRenewalsRail = filter === "all" || filter === "renewals";

  const allClear =
    !loading &&
    !error &&
    openGroups.length === 0 &&
    coachAsks.length === 0 &&
    reengage.length === 0 &&
    renewals.length === 0 &&
    checkins.length === 0 &&
    gettingStarted.length === 0 &&
    reviewedGroups.length === 0;

  const tileNum = (n: number) =>
    loading || error ? "—" : String(n);

  return (
    <div className="home-triage" data-testid="screen-TW-04">
      <header className="home-hdr">
        <div>
          <div className="home-eyebrow">
            <Sun size={14} strokeWidth={1.75} aria-hidden />
            {todayLabel}
          </div>
          <h1 className="home-title" ref={homeTitleRef} tabIndex={-1}>
            Today
          </h1>
          {summary ? <p className="home-summary">{summary}</p> : null}
        </div>
        <div className="home-tiles" role="group" aria-label="Filter by">
          <button
            type="button"
            className={`home-tile${filter === "attention" ? " is-active" : ""}`}
            onClick={() =>
              setFilter((f) => (f === "attention" ? "all" : "attention"))
            }
          >
            <span
              className="home-tile-icon"
              style={{ background: "#FEF2F2", color: "#B91C1C" }}
            >
              <OctagonAlert size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="home-tile-lbl">Needs attention</span>
              <span className="home-tile-num">{tileNum(attentionCount)}</span>
            </span>
          </button>
          <button
            type="button"
            className={`home-tile${filter === "checkins" ? " is-active" : ""}`}
            onClick={() =>
              setFilter((f) => (f === "checkins" ? "all" : "checkins"))
            }
          >
            <span
              className="home-tile-icon"
              style={{ background: "#EFF6FF", color: "#1D4ED8" }}
            >
              <ClipboardCheck size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="home-tile-lbl">Check-ins to review</span>
              <span className="home-tile-num">{tileNum(checkinCount)}</span>
            </span>
          </button>
          <button
            type="button"
            className={`home-tile${filter === "renewals" ? " is-active" : ""}`}
            onClick={() =>
              setFilter((f) => (f === "renewals" ? "all" : "renewals"))
            }
          >
            <span
              className="home-tile-icon"
              style={{ background: "#FFFBEB", color: "#B45309" }}
            >
              <CalendarDays size={18} strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="home-tile-lbl">Renewals due</span>
              <span className="home-tile-num">{tileNum(renewalCount)}</span>
            </span>
          </button>
        </div>
      </header>

      {error ? (
        <ErrorState
          kind={error.kind}
          message={error.message}
          requestId={error.requestId}
          onRetry={() => void load()}
        />
      ) : null}

      {!error && loading ? (
        <div className="home-grid" aria-busy="true" aria-label="Loading">
          <div className="home-col">
            <section className="home-card">
              <div className="home-card-h">
                <div className="home-skel home-skel-title" />
              </div>
              <div className="home-rows">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="home-row home-skel-row">
                    <div className="home-skel home-skel-av" />
                    <div className="home-skel home-skel-line" />
                    <div className="home-skel home-skel-chip" />
                    <div className="home-skel home-skel-age" />
                    <div className="home-skel home-skel-btn" />
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="home-col home-rail">
            <section className="home-card">
              <div className="home-card-h">
                <div className="home-skel home-skel-title" />
              </div>
              <div className="home-list">
                {[0, 1].map((i) => (
                  <div key={i} className="home-li">
                    <div className="home-skel home-skel-av" />
                    <div className="home-li-tx">
                      <div className="home-skel home-skel-line" />
                      <div className="home-skel home-skel-sub" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {!error && allClear ? (
        <div className="home-card" style={{ padding: 24 }}>
          <h2 className="home-title" style={{ fontSize: 18 }}>
            All clear
          </h2>
          <p className="home-summary">
            You&apos;re all caught up. Nothing needs your attention right now.
          </p>
          <Link className="button-primary" to="/clients/add">
            Invite a client
          </Link>
        </div>
      ) : null}

      {!error && !loading ? (
      <div className="home-grid">
        <div className="home-col">
          {showAttention && openGroups.length > 0 ? (
            <section className="home-card" aria-labelledby="na">
              <div className="home-card-h">
                <div className="home-card-ttl">
                  <h2 id="na">Needs attention</h2>
                  <span className="home-count">{attentionCount}</span>
                </div>
                <span
                  className="home-sort"
                  title="Sorted by severity, then how long it's been open."
                >
                  <Info size={14} strokeWidth={1.75} aria-hidden />
                  Sorted by severity, then age
                </span>
              </div>
              {sectionErrors.attention ? (
                <p className="form-error" role="alert">
                  {sectionErrors.attention} ·{" "}
                  <button type="button" className="text-link" onClick={() => void load()}>
                    Retry
                  </button>
                </p>
              ) : null}
              <div
                className="home-rows"
                role="grid"
                aria-label="Needs attention"
                tabIndex={0}
                onKeyDown={onGridKey}
                onFocus={onGridFocusIn}
                onPointerDown={onGridPointerDownIn}
              >
                {visibleOpen.map((row, idx) => {
                  const { group, primary } = row;
                  if (!primary) return null;
                  const issue = issueLine(group, primary);
                  const age = formatAttentionAge(oldestOpenAge(group));
                  const absTitle = `Open since ${formatRelative(
                    new Date(
                      Date.now() - oldestOpenAge(group) * 60_000,
                    ).toISOString(),
                  )}`;
                  return (
                    <div
                      key={group.relationshipId}
                      className={`home-row${focusIdx === idx ? " is-focused" : ""}`}
                      role="row"
                      tabIndex={-1}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      aria-label={`${group.traineeDisplayName}. ${primary.severity === "critical" ? "Critical" : "Attention"}. ${issue.text}${issue.more ? `, plus ${issue.more} more` : ""}, ${age}. Review button.`}
                    >
                      <div className="home-who" role="gridcell">
                        <span className={avatarClass(group.traineeDisplayName)}>
                          {initials(group.traineeDisplayName)}
                        </span>
                        <b>{group.traineeDisplayName}</b>
                      </div>
                      <div
                        className="home-issue"
                        role="gridcell"
                        title={issue.title}
                      >
                        <span className="home-issue-txt">{issue.text}</span>
                        {issue.more > 0 ? (
                          <span className="home-more">+{issue.more} more</span>
                        ) : null}
                      </div>
                      <div role="gridcell">
                        <StatusChip kind="severity" value={primary.severity} />
                      </div>
                      <div className="home-age" role="gridcell" title={absTitle}>
                        {age}
                      </div>
                      <div role="gridcell">
                        <Button
                          variant="tinted"
                          className="button-sm"
                          onClick={() => openException(primary.id)}
                        >
                          Review
                        </Button>
                      </div>
                      <div role="gridcell">
                        <OverflowMenu
                          label={`More actions for ${group.traineeDisplayName}`}
                          items={[
                            {
                              id: "ack",
                              label: "Mark reviewed",
                              disabled: !online,
                              onSelect: () =>
                                void acknowledgeFromOverflow(
                                  primary.id,
                                  group.relationshipId,
                                ),
                            },
                            {
                              id: "nudge",
                              label: "Nudge",
                              disabled: !online,
                              onSelect: () =>
                                void nudgeClient(
                                  group.relationshipId,
                                  primary.id,
                                ),
                            },
                            {
                              id: "open",
                              label: "Open client",
                              onSelect: () =>
                                window.location.assign(
                                  `/clients/${group.relationshipId}`,
                                ),
                            },
                            {
                              id: "wa",
                              label: "WhatsApp",
                              onSelect: () => {
                                const digits = (
                                  group.clientWhatsappE164 ?? ""
                                ).replace(/\D/g, "");
                                if (!digits) {
                                  showToast("No WhatsApp number on file");
                                  return;
                                }
                                window.open(
                                  `https://wa.me/${digits}`,
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              },
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {openGroups.length > ATTENTION_CAP ? (
                <div className="home-foot">
                  <span className="muted">
                    Showing {visibleOpen.length} of {openGroups.length}
                    {!showAllAttention ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          className="link"
                          onClick={() => setShowAllAttention(true)}
                        >
                          View all
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </section>
          ) : null}

          {filter === "all" && coachAsks.length > 0 ? (
            <section
              className="home-card"
              aria-labelledby="asks-heading"
              data-testid="screen-TW-32-section"
            >
              <div className="home-card-h">
                <div className="home-card-ttl">
                  <h2 id="asks-heading">Asked you on WhatsApp</h2>
                  <span className="home-count">{coachAsks.length}</span>
                </div>
              </div>
              <div className="home-list">
                {coachAsks.slice(0, SECTION_CAP).map((ask) => {
                  const name = nameByRid.get(ask.relationshipId) ?? "Client";
                  const item = askItemLabel(ask);
                  const date = askDateLabel(ask);
                  return (
                    <div key={ask.id} className="home-li">
                      <span className={avatarClass(name)}>
                        {initials(name)}
                      </span>
                      <div className="home-li-tx">
                        <b>
                          {name} asked about {item}
                          {date ? ` · ${date}` : ""}{" "}
                          <StatusChip
                            kind="ask"
                            value="open"
                            label={`Asked coach · ${formatRelative(ask.askedAt).replace(/ ago$/, "")}`}
                            className="home-ask-inline"
                          />
                        </b>
                        <span>
                          <span className="home-topic">
                            {labelFor("coach_ask_topic", ask.topic)}
                          </span>{" "}
                          · Opened WhatsApp from their log
                        </span>
                      </div>
                      <Button
                        variant="tinted"
                        className="button-sm"
                        disabled={!online}
                        data-ask-answer={ask.id}
                        onClick={() => openAsk(ask.id)}
                      >
                        Mark answered
                      </Button>
                      <OverflowMenu
                        items={[
                          {
                            id: "open",
                            label: "Open item",
                            onSelect: () => openAsk(ask.id),
                          },
                        ]}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {filter === "all" && reviewedGroups.length > 0 ? (
            <section className="home-card">
              <button
                type="button"
                className="home-collapsed"
                aria-expanded={reviewedOpen}
                onClick={() => setReviewedOpen((v) => !v)}
              >
                <span aria-hidden>{reviewedOpen ? "▾" : "▸"}</span>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Reviewed, still open
                </h2>
                <span className="home-count">{reviewedGroups.length}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {reviewedGroups.length} reviewed item
                  {reviewedGroups.length === 1 ? "" : "s"} still open
                </span>
              </button>
              {reviewedOpen ? (
                <div className="home-list">
                  {reviewedGroups.slice(0, SECTION_CAP).map(({ group, items }) => (
                    <div key={group.relationshipId} className="home-li">
                      <span className={avatarClass(group.traineeDisplayName)}>
                        {initials(group.traineeDisplayName)}
                      </span>
                      <div className="home-li-tx">
                        <b>{group.traineeDisplayName}</b>
                        <span>
                          Reviewed ·{" "}
                          {items[0]?.summary ||
                            labelFor("exception_type", items[0]!.type)}
                        </span>
                      </div>
                      <Button
                        variant="tinted"
                        className="button-sm"
                        disabled={!online}
                        onClick={() => items[0] && openException(items[0].id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {filter === "all" && gettingStarted.length > 0 ? (
            <section className="home-card" aria-labelledby="gs">
              <div className="home-card-h">
                <div className="home-card-ttl">
                  <h2 id="gs">Getting started</h2>
                  <span className="home-count">{gettingStarted.length}</span>
                </div>
              </div>
              <div className="home-list">
                {gettingStarted.map((row) => (
                  <div key={row.id} className="home-li">
                    <span className={avatarClass(row.name)}>
                      {initials(row.name)}
                    </span>
                    <div className="home-li-tx">
                      <b>{row.name}</b>
                      <span>{row.subtitle}</span>
                    </div>
                    <StatusChip
                      kind="lifecycle"
                      value={
                        row.kind === "intake"
                          ? "onboarding_submitted"
                          : "invited"
                      }
                      label={
                        row.kind === "intake" ? "Awaiting review" : "Invited"
                      }
                    />
                    {row.kind === "intake" && row.href ? (
                      <Link className="button-tinted button-sm" to={row.href}>
                        Review intake
                      </Link>
                    ) : (
                      <Button
                        variant="tinted"
                        className="button-sm"
                        disabled={!online}
                      >
                        Resend invite
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {filter === "all" && reengage.length > 0 ? (
            <section className="home-card" aria-labelledby="re">
              <div className="home-card-h">
                <div className="home-card-ttl">
                  <h2 id="re">Re-engage on WhatsApp</h2>
                  <span className="home-count">
                    {Math.min(reengage.length, SECTION_CAP)}
                  </span>
                </div>
              </div>
              <div className="home-list">
                {reengage.slice(0, SECTION_CAP).map((item) => (
                  <div key={item.relationshipId} className="home-li">
                    <span className={avatarClass(item.traineeDisplayName)}>
                      {initials(item.traineeDisplayName)}
                    </span>
                    <div className="home-li-tx">
                      <b>{item.traineeDisplayName}</b>
                      <span>No logs recently · reminders unanswered</span>
                    </div>
                    <a
                      className="button-secondary button-sm"
                      href={item.waMeUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() =>
                        showToast("Opened WhatsApp · today")
                      }
                    >
                      Open WhatsApp
                    </a>
                  </div>
                ))}
              </div>
              <div className="home-note">
                <Info size={14} strokeWidth={1.75} aria-hidden />
                Opens WhatsApp with a message written as you. You can edit it,
                and you press Send.
              </div>
            </section>
          ) : null}
        </div>

        <div className="home-col home-rail">
          {showCheckinsRail && checkins.length > 0 ? (
            <section className="home-card">
              <div className="home-card-h">
                <div className="home-card-ttl h3">
                  <h2>Check-ins to review</h2>
                  <span className="home-count">{checkinCount}</span>
                </div>
                <Link className="link" to="/checkins" style={{ fontSize: 13 }}>
                  All
                </Link>
              </div>
              <div className="home-list">
                {checkins.slice(0, SECTION_CAP).map((row) => {
                  const name =
                    nameByRid.get(row.coachingRelationshipId) ?? "Client";
                  return (
                    <div key={row.checkin.id} className="home-li">
                      <span className={avatarClass(name)}>
                        {initials(name)}
                      </span>
                      <div className="home-li-tx">
                        <b>{name}</b>
                        <span>
                          Submitted{" "}
                          {row.checkin.submittedAt
                            ? formatRelative(row.checkin.submittedAt)
                            : "recently"}
                        </span>
                      </div>
                      <Link
                        className="button-tinted button-sm"
                        to={`/clients/${row.coachingRelationshipId}/check-ins/${row.checkin.id}`}
                      >
                        Review
                      </Link>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {showRenewalsRail && renewals.length > 0 ? (
            <section className="home-card">
              <div className="home-card-h">
                <div className="home-card-ttl h3">
                  <h2>Renewals</h2>
                  <span className="home-count">{renewalCount}</span>
                </div>
              </div>
              <div className="home-list">
                {renewals.slice(0, SECTION_CAP).map((item) => {
                  const name =
                    nameByRid.get(item.coachingRelationshipId) ??
                    item.planName;
                  return (
                    <div key={item.coachingRelationshipId} className="home-li">
                      <div className="home-li-tx">
                        <b>{name}</b>
                        <span>
                          {item.renewalState === "expired" ? "Ended" : "Due"}{" "}
                          {formatCivilDate(item.renewsOn)}
                        </span>
                      </div>
                      <StatusChip
                        kind="renewal"
                        value={item.renewalState}
                        label={labelFor("renewal_state", item.renewalState)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="home-foot" style={{ padding: "10px 16px" }}>
                <span className="muted">Open settings to renew</span>
                {renewals[0] ? (
                  <Link
                    className="link"
                    to={`/clients/${renewals[0].coachingRelationshipId}/configure`}
                  >
                    Open settings
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {filter === "all" && activity.length > 0 ? (
            <section className="home-card">
              <div className="home-card-h">
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  Recent activity
                </h2>
                <span className="muted" style={{ fontSize: 12 }}>
                  Client time
                </span>
              </div>
              <div className="home-feed">
                {activity.map((ev) => (
                  <div key={ev.id} className="home-ev">
                    <span className="home-ev-dot" />
                    <span>
                      <b>{ev.traineeDisplayName ?? "Client"}</b> {ev.summary}
                      <span className="home-ev-when">
                        {formatRelative(ev.occurredAt)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
      ) : null}

      {drawerExceptionId ? (
        <ExceptionDrawer
          key={drawerExceptionId}
          exceptionId={drawerExceptionId}
          onClose={closeDrawerWithFocus}
          onChanged={() => void load({ quiet: true })}
        />
      ) : null}

      {drawerAskId ? (
        <CoachAskDrawer
          askId={drawerAskId}
          clientName={
            nameByRid.get(
              coachAsks.find((a) => a.id === drawerAskId)?.relationshipId ??
                "",
            ) ?? "Client"
          }
          onClose={closeAskDrawerWithFocus}
          onChanged={markAskChanged}
        />
      ) : null}

      {toast ? (
        <div className="home-toast" role="status">
          <span>{toast.message}</span>
          {toast.undo ? (
            <button type="button" onClick={toast.undo}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
