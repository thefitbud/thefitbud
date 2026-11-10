import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError } from "@fitbud/api-client";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";
import type {
  AttentionGroupsResponse,
  CoachAsk,
  RealtimeEvent,
  ReengagementCandidatesResponse,
  SubscriptionAttentionItem,
  TrainerCheckinInboxItem,
} from "@fitbud/contracts";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];
import {
  errorKindFromFailure,
  type ErrorKind,
} from "../../components/StatePanels";
import { apiClient } from "../../lib/api";
import { stage1Api } from "../../lib/stage1-api";
import { useRealtimeHints } from "../../realtime/useRealtimeHints";

/** Home poll. Paused while the tab is hidden. */
export const HOME_POLL_MS = 45_000;

const SECTION_CAP = 5;

/**
 * visibilitychange and focus from one return to the tab count as one refresh.
 * A return inside this window skips the refetch, but the poll must still be running.
 */
export const VISIBLE_REFRESH_GAP_MS = 2_000;

export const HOME_SECTIONS = [
  "attention",
  "asks",
  "checkins",
  "renewals",
  "gettingStarted",
  "reviewed",
] as const;

export type HomeSectionId = (typeof HOME_SECTIONS)[number];

export type GettingStartedRow = {
  id: string;
  kind: "intake" | "invite";
  name: string;
  subtitle: string;
  href?: string;
  inviteId?: string;
};

export type HomeActivityEvent = {
  id: string;
  traineeDisplayName: string | null;
  summary: string;
  occurredAt: string;
  traineeLocalTime: string | null;
};

export type HomeLoadError = {
  message: string;
  requestId?: string | null;
  kind?: ErrorKind;
};

type ReengagementCandidate = ReengagementCandidatesResponse["items"][number];

type SectionData = {
  attention: AttentionGroup[];
  reviewed: AttentionGroup[];
  asks: CoachAsk[];
  checkins: TrainerCheckinInboxItem[];
  renewals: SubscriptionAttentionItem[];
  gettingStarted: GettingStartedRow[];
};

type RefreshOpts = {
  quiet?: boolean;
  /** Loud attention failure replaces the page. Section refreshes leave it. */
  reportPageError?: boolean;
};

/**
 * Realtime hints name one Home section. Exception hints refresh attention;
 * reviewed is the acknowledged slice of that same payload, so one response
 * updates both counts. Asks, renewals and getting started have no hint type
 * and stay on the poll.
 */
export function sectionForRealtimeEvent(event: RealtimeEvent): HomeSectionId {
  switch (event.eventType) {
    case "exception_created":
    case "exception_acknowledged":
    case "exception_resolved":
    case "exception_changed":
    case "workout_execution_changed":
    case "meal_compliance_changed":
    case "effective_plan_changed":
      // A published plan changes what is expected of the client, and so the
      // derived missed/overdue exceptions. It has nothing to do with renewals,
      // which come from the subscription, not the training plan.
      return "attention";
    case "checkin_submitted":
    case "checkin_reviewed":
      return "checkins";
    default: {
      const unreachable: never = event.eventType;
      return unreachable;
    }
  }
}

function applyHolds(
  groups: AttentionGroup[],
  holds: ReadonlyMap<string, { original: AttentionGroupItem["status"] }>,
): AttentionGroup[] {
  if (holds.size === 0) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      const hold = holds.get(item.id);
      return hold ? { ...item, status: "acknowledged" as const } : item;
    }),
  }));
}

function pageErrorFrom(err: unknown): HomeLoadError {
  const kind =
    err instanceof ApiClientError
      ? errorKindFromFailure({
          status: err.status,
          code: err.code,
          message: err.message,
        })
      : "server";
  return {
    message:
      err instanceof ApiClientError
        ? err.message
        : "Could not load your home feed.",
    requestId: err instanceof ApiClientError ? err.requestId : null,
    kind,
  };
}

/**
 * One fetcher per Home section. Mutations refetch only the section they
 * change; the 45s poll and a tab becoming visible refresh every section.
 * Rows held for Undo stay acknowledged across those refreshes.
 */
export function useHomeSections(options: { timeZone: string }) {
  const { timeZone } = options;
  const [groups, setGroups] = useState<AttentionGroup[]>([]);
  const [coachAsks, setCoachAsks] = useState<CoachAsk[]>([]);
  const [reengage, setReengage] = useState<ReengagementCandidate[]>([]);
  const [renewals, setRenewals] = useState<SubscriptionAttentionItem[]>([]);
  const [checkins, setCheckins] = useState<TrainerCheckinInboxItem[]>([]);
  const [activity, setActivity] = useState<HomeActivityEvent[]>([]);
  const [gettingStarted, setGettingStarted] = useState<GettingStartedRow[]>([]);
  const [nameByRid, setNameByRid] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<HomeLoadError | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>(
    {},
  );

  const groupsRef = useRef(groups);
  const asksRef = useRef(coachAsks);
  const checkinsRef = useRef(checkins);
  const renewalsRef = useRef(renewals);
  const gettingStartedRef = useRef(gettingStarted);
  const holdsRef = useRef(
    new Map<string, { original: AttentionGroupItem["status"] }>(),
  );
  const groupsRequestRef = useRef<ReturnType<
    typeof stage1Api.getAttentionGroups
  > | null>(null);
  const inflightRef = useRef(new Map<HomeSectionId, Promise<void>>());
  const rerunRef = useRef(new Set<HomeSectionId>());
  const allInflightRef = useRef<Promise<void> | null>(null);
  const allRerunRef = useRef(false);

  const requestGroups = useCallback(() => {
    if (!groupsRequestRef.current) {
      groupsRequestRef.current = stage1Api.getAttentionGroups().finally(() => {
        groupsRequestRef.current = null;
      });
    }
    return groupsRequestRef.current;
  }, []);

  const mergeNames = useCallback((entries: Iterable<[string, string]>) => {
    const list = [...entries];
    if (list.length === 0) return;
    setNameByRid((prev) => {
      const next = new Map(prev);
      for (const [id, name] of list) next.set(id, name);
      return next;
    });
  }, []);

  const adoptGroups = useCallback(
    (next: AttentionGroup[]) => {
      const held = applyHolds(next, holdsRef.current);
      groupsRef.current = held;
      setGroups(held);
      mergeNames(
        held.map((group) => [group.relationshipId, group.traineeDisplayName]),
      );
    },
    [mergeNames],
  );

  const refreshSection = useCallback(
    async (section: HomeSectionId, opts?: RefreshOpts): Promise<void> => {
      const existing = inflightRef.current.get(section);
      if (existing) {
        rerunRef.current.add(section);
        await existing;
        if (rerunRef.current.has(section)) {
          rerunRef.current.delete(section);
          await refreshSection(section, opts);
        }
        return;
      }

      const quiet = opts?.quiet === true;
      const run = (async () => {
        try {
          await loadSection(section, quiet, opts?.reportPageError === true);
        } finally {
          inflightRef.current.delete(section);
        }
      })();
      inflightRef.current.set(section, run);
      await run;

      async function loadSection(
        id: HomeSectionId,
        isQuiet: boolean,
        reportPageError: boolean,
      ): Promise<void> {
        if (id === "attention" || id === "reviewed") {
          try {
            const attention = await requestGroups();
            adoptGroups(attention.groups);
            if (!isQuiet) {
              setSectionErrors((prev) => {
                if (!prev.attention) return prev;
                const next = { ...prev };
                delete next.attention;
                return next;
              });
              if (reportPageError) setError(null);
            }
          } catch (err) {
            // Keep the rows already on screen. Clearing them makes Home look
            // all clear, and the attention error only renders while rows remain.
            if (isQuiet) return;
            setSectionErrors((prev) => ({
              ...prev,
              attention: "Couldn't load needs attention",
            }));
            if (reportPageError) setError(pageErrorFrom(err));
          }
          return;
        }

        if (id === "asks") {
          try {
            const res = (await stage1Api.listCoachAsks({ status: "open" })) as {
              items: CoachAsk[];
            };
            asksRef.current = res.items;
            setCoachAsks(res.items);
            if (!isQuiet) {
              setSectionErrors((prev) => {
                if (!prev.asks) return prev;
                const next = { ...prev };
                delete next.asks;
                return next;
              });
            }
          } catch {
            if (isQuiet) return;
            setSectionErrors((prev) => ({
              ...prev,
              asks: "Couldn't load asked-coach items",
            }));
          }
          return;
        }

        if (id === "checkins") {
          try {
            const res = await apiClient.listTrainerCheckinInbox();
            const submitted = res.items.filter(
              (item) => item.checkin.status === "submitted",
            );
            checkinsRef.current = submitted;
            setCheckins(submitted);
            if (!isQuiet) {
              setSectionErrors((prev) => {
                if (!prev.checkins) return prev;
                const next = { ...prev };
                delete next.checkins;
                return next;
              });
            }
          } catch {
            if (isQuiet) return;
            setSectionErrors((prev) => ({
              ...prev,
              checkins: "Couldn't load check-ins",
            }));
          }
          return;
        }

        if (id === "renewals") {
          try {
            const res = await apiClient.listSubscriptionAttention();
            renewalsRef.current = res.items;
            setRenewals(res.items);
            if (!isQuiet) {
              setSectionErrors((prev) => {
                if (!prev.renewals) return prev;
                const next = { ...prev };
                delete next.renewals;
                return next;
              });
            }
          } catch {
            if (isQuiet) return;
            setSectionErrors((prev) => ({
              ...prev,
              renewals: "Couldn't load renewals",
            }));
          }
          return;
        }

        const started: GettingStartedRow[] = [];
        const names: Array<[string, string]> = [];
        let anyOk = false;
        const [clients, invitations] = await Promise.allSettled([
          apiClient.listClients({ limit: 100 }),
          apiClient.listInvitations(),
        ]);
        if (clients.status === "fulfilled") {
          anyOk = true;
          for (const row of clients.value.items) {
            if (row.relationshipId && row.traineeDisplayName) {
              names.push([row.relationshipId, row.traineeDisplayName]);
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
        if (invitations.status === "fulfilled") {
          anyOk = true;
          for (const inv of invitations.value.items) {
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
        if (!anyOk) return;
        const capped = started.slice(0, SECTION_CAP);
        gettingStartedRef.current = capped;
        setGettingStarted(capped);
        mergeNames(names);
      }
    },
    [adoptGroups, mergeNames, requestGroups, timeZone],
  );

  const loadActivity = useCallback(async () => {
    try {
      const res = (await stage1Api.getActivityFeed({ limit: 8 })) as {
        events: HomeActivityEvent[];
      };
      setActivity(res.events.slice(0, 6));
    } catch {
      // Keep the previous feed. A failed refetch must not blank the section.
    }
  }, []);

  const loadReengage = useCallback(async () => {
    try {
      const res = await stage1Api.getReengagementCandidates();
      setReengage(res.items);
    } catch {
      // Keep the previous candidates. A failed refetch must not blank the section.
    }
  }, []);

  const refreshAll = useCallback(
    async (opts?: { quiet?: boolean }): Promise<void> => {
      const quiet = opts?.quiet === true;
      if (allInflightRef.current) {
        // A quiet refresh (poll, tab shown, focus) joins the one in flight:
        // it would fetch the same data. A loud Retry runs again afterwards.
        if (quiet) {
          await allInflightRef.current;
          return;
        }
        allRerunRef.current = true;
        await allInflightRef.current;
        if (allRerunRef.current) {
          allRerunRef.current = false;
          await refreshAll({ quiet: false });
        }
        return;
      }
      const run = (async () => {
        if (!quiet) {
          setLoading(true);
          setError(null);
          setSectionErrors({});
        }
        try {
          await Promise.all([
            refreshSection("attention", {
              quiet,
              reportPageError: !quiet,
            }),
            refreshSection("asks", { quiet }),
            refreshSection("checkins", { quiet }),
            refreshSection("renewals", { quiet }),
            refreshSection("gettingStarted", { quiet }),
            refreshSection("reviewed", { quiet }),
            loadActivity(),
            loadReengage(),
          ]);
        } finally {
          if (!quiet) setLoading(false);
        }
      })();
      allInflightRef.current = run;
      try {
        await run;
      } finally {
        allInflightRef.current = null;
      }
    },
    [loadActivity, loadReengage, refreshSection],
  );

  useEffect(() => {
    let stopped = false;
    let timer: number | null = null;
    let visibleCoalesce: Promise<void> | null = null;
    // visibilitychange and focus usually both fire when the trainer comes
    // back to the tab, not always in the same task. One refresh covers both.
    let lastVisibleRefreshAt = Number.NEGATIVE_INFINITY;

    const stopPoll = () => {
      if (timer != null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const startPoll = () => {
      stopPoll();
      if (document.hidden) return;
      timer = window.setInterval(() => {
        if (stopped || document.hidden) return;
        void refreshAll({ quiet: true });
      }, HOME_POLL_MS);
    };

    const refreshBecauseVisible = () => {
      if (stopped || document.hidden) {
        stopPoll();
        return;
      }
      if (visibleCoalesce) return;
      if (Date.now() - lastVisibleRefreshAt < VISIBLE_REFRESH_GAP_MS) {
        // Hide already cleared the interval. Skipping the refetch must not
        // leave the 45s poll stopped until a later return outside this window.
        startPoll();
        return;
      }
      visibleCoalesce = Promise.resolve().then(() => {
        visibleCoalesce = null;
        if (stopped || document.hidden) return;
        lastVisibleRefreshAt = Date.now();
        startPoll();
        return refreshAll({ quiet: true });
      });
    };

    void refreshAll({ quiet: false }).finally(() => {
      if (!stopped) startPoll();
    });

    const onVisibility = () => {
      if (document.hidden) {
        stopPoll();
        return;
      }
      refreshBecauseVisible();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshBecauseVisible);
    return () => {
      stopped = true;
      stopPoll();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshBecauseVisible);
    };
  }, [refreshAll]);

  const relationshipIds = useMemo(() => [...nameByRid.keys()], [nameByRid]);

  useRealtimeHints(apiClient, relationshipIds, (event) => {
    // Callers that invoke the hint with no payload (the row-selection tests)
    // still refresh attention, which is what that quiet refetch displayed.
    const section = event ? sectionForRealtimeEvent(event) : "attention";
    void refreshSection(section);
  });

  const readSection = useCallback(
    <S extends HomeSectionId>(section: S): SectionData[S] => {
      switch (section) {
        case "attention":
        case "reviewed":
          return groupsRef.current as SectionData[S];
        case "asks":
          return asksRef.current as SectionData[S];
        case "checkins":
          return checkinsRef.current as SectionData[S];
        case "renewals":
          return renewalsRef.current as SectionData[S];
        case "gettingStarted":
          return gettingStartedRef.current as SectionData[S];
        default: {
          const unreachable: never = section;
          return unreachable;
        }
      }
    },
    [],
  );

  const writeSection = useCallback(
    <S extends HomeSectionId>(section: S, value: SectionData[S]) => {
      switch (section) {
        case "attention":
        case "reviewed": {
          const next = value as AttentionGroup[];
          groupsRef.current = next;
          setGroups(next);
          return;
        }
        case "asks": {
          const next = value as CoachAsk[];
          asksRef.current = next;
          setCoachAsks(next);
          return;
        }
        case "checkins": {
          const next = value as TrainerCheckinInboxItem[];
          checkinsRef.current = next;
          setCheckins(next);
          return;
        }
        case "renewals": {
          const next = value as SubscriptionAttentionItem[];
          renewalsRef.current = next;
          setRenewals(next);
          return;
        }
        case "gettingStarted": {
          const next = value as GettingStartedRow[];
          gettingStartedRef.current = next;
          setGettingStarted(next);
          return;
        }
        default: {
          const unreachable: never = section;
          return unreachable;
        }
      }
    },
    [],
  );

  const mutateSection = useCallback(
    async <S extends HomeSectionId>(
      section: S,
      optimistic: (prev: SectionData[S]) => SectionData[S],
      commit: () => Promise<unknown>,
    ): Promise<void> => {
      const snapshot = readSection(section);
      writeSection(section, optimistic(snapshot));
      try {
        await commit();
      } catch (err) {
        writeSection(section, snapshot);
        throw err;
      }
      await refreshSection(section);
    },
    [readSection, refreshSection, writeSection],
  );

  const holdException = useCallback(
    (exceptionId: string) => {
      if (!holdsRef.current.has(exceptionId)) {
        let original: AttentionGroupItem["status"] = "active";
        for (const group of groupsRef.current) {
          const item = group.items.find((candidate) => candidate.id === exceptionId);
          if (item) {
            original = item.status;
            break;
          }
        }
        holdsRef.current.set(exceptionId, { original });
      }
      adoptGroups(groupsRef.current);
    },
    [adoptGroups],
  );

  const releaseException = useCallback((exceptionId: string) => {
    const hold = holdsRef.current.get(exceptionId);
    if (!hold) return;
    holdsRef.current.delete(exceptionId);
    const next = groupsRef.current.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.id === exceptionId ? { ...item, status: hold.original } : item,
      ),
    }));
    groupsRef.current = next;
    setGroups(next);
  }, []);

  /** Drop an Undo hold without restoring the previous status (the write landed). */
  const clearHold = useCallback((exceptionId: string) => {
    holdsRef.current.delete(exceptionId);
  }, []);

  const counts = useMemo(
    () => ({
      attention: groups.filter((group) =>
        group.items.some(
          (item) => item.status === "detected" || item.status === "active",
        ),
      ).length,
      asks: coachAsks.length,
      checkins: checkins.length,
      renewals: renewals.length,
      gettingStarted: gettingStarted.length,
      reviewed: groups.filter((group) =>
        group.items.some((item) => item.status === "acknowledged"),
      ).length,
    }),
    [groups, coachAsks, checkins, renewals, gettingStarted],
  );

  return {
    groups,
    coachAsks,
    reengage,
    renewals,
    checkins,
    activity,
    gettingStarted,
    nameByRid,
    loading,
    error,
    sectionErrors,
    counts,
    refreshAll,
    refreshSection,
    mutateSection,
    holdException,
    releaseException,
    clearHold,
  };
}
