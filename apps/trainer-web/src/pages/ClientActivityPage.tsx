import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { userFacingMessage } from "@fitbud/api-client";
import type {
  ClientWorkspace,
  MealAssignment,
  WorkspaceActivityItem,
  WorkspaceActivityType,
} from "@fitbud/contracts";
import { formatClockTime, formatHhMmTime, labelFor } from "@fitbud/core";
import { ActivityDayGroup } from "../components/activity/ActivityDayGroup";
import { ActivityDrawer } from "../components/activity/ActivityDrawer";
import { ChipMenu } from "../components/activity/ChipMenu";
import {
  ActivityRemovedRow,
  type NudgeUiState,
} from "../components/activity/ActivityRow";
import { UnreadLogEditsContext } from "../components/activity/unreadLogEdits";
import {
  type DateRangeMode,
  type MealStateFilter,
  type WorkoutStateFilter,
  feedCardTitle,
  groupByDay,
  mealDayHeaderSummary,
  parseItemParam,
  plannedDailyKcalMeta,
  rangeLabel,
  resolveDateRange,
  todayInTimezone,
} from "../components/activity/activityUtils";
import { ClipboardCheck, Dumbbell, UtensilsCrossed, CalendarDays } from "lucide-react";
import { Button } from "../components/ui";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StatePanels";
import { apiClient } from "../lib/api";
import { stage1Api } from "../lib/stage1-api";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import { useAuth } from "../auth/AuthProvider";
import type { WorkspaceOutletContext } from "./workspaceContext";
import "../components/activity/activity.css";

/** The parts of a feed event the removed-log rows read (activityFeedEventSchema). */
type FeedEvent = {
  id: string;
  type: string;
  summary: string;
  occurredAt: string;
  traineeDisplayName: string | null;
  mealDate?: string | null;
  previousKcal?: number | null;
};

const RANGE_OPTIONS: Array<{ value: string; label: string; chipLabel: string }> = [
  { value: "this_week", label: "This week", chipLabel: "This week" },
  { value: "last_week", label: "Last week", chipLabel: "Last week" },
  { value: "custom", label: "Custom range", chipLabel: "Custom" },
];

const MEAL_PILLS: Array<{ value: MealStateFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Logged" },
  { value: "modified", label: "Changed" },
  { value: "skipped", label: "Skipped" },
  { value: "logged_later", label: "Logged late" },
  { value: "overdue", label: "Overdue" },
];

const WORKOUT_PILLS: Array<{ value: WorkoutStateFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "assigned", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "modified", label: "Modified" },
  { value: "skipped", label: "Skipped" },
  { value: "missed", label: "Missed" },
];

const CHECKIN_PILLS = [
  "",
  "scheduled",
  "due",
  "overdue",
  "submitted",
  "reviewed",
] as const;

function mealOverrideLines(
  displayName: string,
  overrides: ClientWorkspace["header"]["mealTimeOverrides"],
): string[] {
  if (!overrides?.length) return [];
  const first = displayName.trim().split(/\s+/)[0] || "Client";
  return overrides.map((row) => {
    const slot = row.slotKey.replaceAll("_", " ");
    const title = slot.charAt(0).toUpperCase() + slot.slice(1);
    const time = formatHhMmTime(row.time);
    return `${first} changed ${title} time to ${time}`;
  });
}

export function ClientActivityPage() {
  const { relationshipId = "" } = useParams();
  const { me } = useAuth();
  const trainerTimezone =
    me?.timezone ??
    Intl.DateTimeFormat().resolvedOptions().timeZone ??
    "UTC";
  const {
    workspace,
    workspaceLoading,
    refreshEpoch = 0,
    online = true,
    ended = false,
  } = useOutletContext<WorkspaceOutletContext>();
  const header = workspace?.header;
  const { timezone: clientTimezone } = resolveTraineeTimezone(
    header ?? {
      relationshipId,
      traineeDisplayName: "Client",
      onboardingStatus: "coaching_ready",
      effectivePlan: null,
      goalShort: null,
      renewalState: null,
      adherenceState: "on_track",
      traineeProfile: { displayName: "Client", age: null, gender: null },
      traineeTimezone: "Asia/Kolkata",
      hasCustomMealTimes: false,
      trainerWhatsappE164: null,
      clientWhatsappE164: null,
    },
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const activityType = (searchParams.get("type") ??
    "meal") as WorkspaceActivityType;
  const stateFilter = searchParams.get("state") ?? "";
  // Z14-16: `?date=&entry=` (the web bell's link for a client's meal-log
  // change) shows that day and opens the entry's meal panel.
  const dateParam = searchParams.get("date");
  const entryParam = searchParams.get("entry");
  const rangeMode = (searchParams.get("range") ??
    (dateParam ? "custom" : "this_week")) as DateRangeMode;
  const customFrom = searchParams.get("from") ?? dateParam ?? "";
  const customTo = searchParams.get("to") ?? dateParam ?? "";
  const itemParam = searchParams.get("item");

  const today = useMemo(() => todayInTimezone(clientTimezone), [clientTimezone]);
  const range = useMemo(
    () => resolveDateRange(rangeMode, today, customFrom, customTo),
    [rangeMode, today, customFrom, customTo],
  );

  const [items, setItems] = useState<WorkspaceActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mealAssignments, setMealAssignments] = useState<
    Map<string, MealAssignment>
  >(() => new Map());
  const [nudgeState, setNudgeState] = useState<Record<string, NudgeUiState>>(
    {},
  );
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<
    { type: "meal" | "workout"; id: string } | null
  >(null);
  const requestId = useRef(0);

  const loadMealDetails = useCallback(async (rows: WorkspaceActivityItem[]) => {
    const mealIds = rows.filter((row) => row.type === "meal").map((row) => row.id);
    if (mealIds.length === 0) {
      setMealAssignments(new Map());
      return;
    }
    const entries = await Promise.all(
      mealIds.map(async (id) => {
        try {
          const assignment = await apiClient.getMealAssignment(id);
          return [id, assignment] as const;
        } catch {
          return null;
        }
      }),
    );
    const map = new Map<string, MealAssignment>();
    for (const entry of entries) {
      if (entry) map.set(entry[0], entry[1]);
    }
    setMealAssignments(map);
  }, []);

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const id = ++requestId.current;
      const appending = Boolean(cursor);
      if (appending) setLoadingMore(true);
      else {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
      }
      setError(null);
      try {
        const result = await apiClient.listWorkspaceActivity(relationshipId, {
          type: activityType,
          state: stateFilter || undefined,
          occurredFrom: range.from,
          occurredTo: range.to,
          cursor: cursor ?? undefined,
          limit: 40,
        });
        if (requestId.current !== id) return;
        setItems((current) => {
          const merged = appending
            ? [...current, ...result.items]
            : result.items;
          if (activityType === "meal") {
            void loadMealDetails(merged);
          }
          return merged;
        });
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (requestId.current !== id) return;
        setError(
          userFacingMessage(err, { fallback: "Could not load activity." }),
        );
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      activityType,
      loadMealDetails,
      range.from,
      range.to,
      relationshipId,
      stateFilter,
    ],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  useEffect(() => {
    const parsed = parseItemParam(itemParam);
    if (parsed) setDrawer(parsed);
  }, [itemParam]);

  // Z14-16: unread "client changed a meal log" notifications for this client
  // (entry id -> notification id) and the client's removed meal logs. Both are
  // extras on top of the feed: if they cannot be read, the feed still shows.
  const [unreadEdits, setUnreadEdits] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [removals, setRemovals] = useState<FeedEvent[]>([]);
  useEffect(() => {
    if (!relationshipId) return;
    let cancelled = false;
    void apiClient.listNotifications().then(
      (inbox) => {
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const row of inbox.items) {
          if (
            row.type === "trainer_client_log_edited" &&
            row.coachingRelationshipId === relationshipId &&
            !row.readAt &&
            row.logEdit?.action === "edited"
          ) {
            next.set(row.logEdit.entryId, row.id);
          }
        }
        setUnreadEdits(next);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [relationshipId, refreshEpoch]);
  useEffect(() => {
    if (!relationshipId || activityType !== "meal") {
      setRemovals([]);
      return;
    }
    let cancelled = false;
    void stage1Api.getActivityFeed({ rid: relationshipId, limit: 50 }).then(
      (feed) => {
        if (cancelled) return;
        const events = (feed as unknown as { events: FeedEvent[] }).events;
        setRemovals(
          events.filter(
            (event) =>
              event.type === "client_removed" &&
              event.mealDate != null &&
              event.mealDate >= range.from &&
              event.mealDate <= range.to,
          ),
        );
      },
      () => {
        if (!cancelled) setRemovals([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [relationshipId, activityType, range.from, range.to, refreshEpoch]);

  const markEntryRead = useCallback(
    (entryId: string | undefined) => {
      const notificationId = entryId ? unreadEdits.get(entryId) : undefined;
      if (!notificationId) return;
      setUnreadEdits((current) => {
        const next = new Map(current);
        next.delete(entryId!);
        return next;
      });
      void (
        apiClient as unknown as {
          markNotificationRead: (id: string) => Promise<unknown>;
        }
      )
        .markNotificationRead(notificationId)
        .catch(() => undefined); // the dot is a convenience; the next load shows it again
    },
    [unreadEdits],
  );

  useEffect(() => {
    if (!entryParam) return;
    for (const assignment of mealAssignments.values()) {
      if (assignment.compliance?.id !== entryParam) continue;
      setDrawer({ type: "meal", id: assignment.id });
      const next = new URLSearchParams(searchParams);
      next.delete("entry");
      next.set("item", `meal:${assignment.id}`);
      setSearchParams(next, { replace: true });
      markEntryRead(entryParam);
      return;
    }
  }, [entryParam, mealAssignments]);

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next, { replace: true });
  }

  async function nudge(item: WorkspaceActivityItem) {
    if (!relationshipId || ended) return;
    setNudgingId(item.id);
    try {
      const result = await apiClient.nudgeActivity(relationshipId, {
        activityType: item.type,
        activityId: item.id,
      });
      if (result.deferredForQuietHours) {
        const end = result.quietHoursEnd
          ? formatHhMmTime(result.quietHoursEnd)
          : "later";
        setNudgeState((current) => ({
          ...current,
          [item.id]: {
            kind: "limited",
            message: `The reminder waits until quiet hours end (${end}).`,
          },
        }));
      } else if (
        result.deduped ||
        result.notification.state === "deferred" ||
        result.notification.state === "suppressed"
      ) {
        setNudgeState((current) => ({
          ...current,
          [item.id]: {
            kind: "sent",
            label: formatClockTime(
              result.notification.createdAt,
              clientTimezone,
            ),
          },
        }));
      } else {
        setNudgeState((current) => ({
          ...current,
          [item.id]: {
            kind: "sent",
            label: formatClockTime(
              result.notification.createdAt,
              clientTimezone,
            ),
          },
        }));
      }
    } catch (err) {
      setError(userFacingMessage(err, { fallback: "Could not send the reminder." }));
    } finally {
      setNudgingId(null);
    }
  }

  function openPanel(item: WorkspaceActivityItem) {
    if (item.type === "checkin") {
      window.location.assign(
        `/clients/${relationshipId}/check-ins/${item.id}`,
      );
      return;
    }
    const target = { type: item.type, id: item.id };
    if (item.type === "meal") {
      markEntryRead(mealAssignments.get(item.id)?.compliance?.id);
    }
    setDrawer(target);
    patchParams({ item: `${item.type}:${item.id}` });
  }

  function closePanel() {
    setDrawer(null);
    patchParams({ item: null });
  }

  const groups = useMemo(
    () => groupByDay(items, activityType),
    [activityType, items],
  );

  const overrideEvents =
    activityType === "meal" && header
      ? mealOverrideLines(header.traineeDisplayName, header.mealTimeOverrides)
      : [];

  const emptyCopy =
    activityType === "meal"
      ? items.length === 0 && !loading
        ? "No meals in this range."
        : null
      : items.length === 0 && !loading
        ? `No ${labelFor("workspace_activity_type", activityType).toLowerCase()} in this range.`
        : null;

  const noSchedule =
    activityType !== "checkin" &&
    items.length === 0 &&
    !loading &&
    !error &&
    rangeMode === "this_week";

  const unreadEntryIds = useMemo(
    () => new Set(unreadEdits.keys()),
    [unreadEdits],
  );
  const cardTitle = feedCardTitle(activityType, rangeMode);
  // One "Status Any" menu replaces the old row of state pills (W-158).
  const statusOptions =
    activityType === "meal"
      ? MEAL_PILLS.map((pill) => ({ value: pill.value, label: pill.value ? pill.label : "Any" }))
      : activityType === "workout"
        ? WORKOUT_PILLS.map((pill) => ({ value: pill.value, label: pill.value ? pill.label : "Any" }))
        : CHECKIN_PILLS.map((value) => ({
            value,
            label: value ? labelFor("checkin_status", value) : "Any",
          }));
  const plannedMeta =
    activityType === "meal" ? plannedDailyKcalMeta(mealAssignments) : null;

  return (
    <div className="workspace-page activity-page" data-testid="screen-TW-17">
      <h1 className="sr-only">Activity</h1>

      <div className="activity-toolbar" role="group" aria-label="Activity filters">
        <div
          className="ui-seg activity-type-segment"
          role="group"
          aria-label="Activity type"
        >
          {(
            [
              ["workout", "Workouts", Dumbbell],
              ["meal", "Meals", UtensilsCrossed],
              ["checkin", "Check-ins", ClipboardCheck],
            ] as const
          ).map(([type, label, TypeIcon]) => (
            <button
              key={type}
              type="button"
              className={activityType === type ? "is-on" : undefined}
              aria-pressed={activityType === type}
              onClick={() => patchParams({ type, state: null, item: null })}
            >
              <TypeIcon className="ui-i" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <div className="activity-toolbar-end">
          <ChipMenu
            label="Status"
            aria-label="Status"
            options={statusOptions}
            value={stateFilter}
            onChange={(value) => patchParams({ state: value || null })}
            alignEnd
          />
          {rangeMode === "custom" ? (
            <div className="activity-custom-range">
              <label className="activity-date-field">
                <span>From</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) =>
                    patchParams({ from: event.target.value || null })
                  }
                />
              </label>
              <label className="activity-date-field">
                <span>To</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) =>
                    patchParams({ to: event.target.value || null })
                  }
                />
              </label>
            </div>
          ) : null}
          <ChipMenu
            icon={<CalendarDays className="ui-i" aria-hidden="true" />}
            aria-label="Date range"
            options={RANGE_OPTIONS}
            value={rangeMode}
            valueLabel={`${
              RANGE_OPTIONS.find((option) => option.value === rangeMode)?.chipLabel ??
              "This week"
            } · ${rangeLabel(range.from, range.to)}`}
            onChange={(value) => patchParams({ range: value })}
            alignEnd
          />
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} screenId="TW-17" />
      ) : null}

      {loading && items.length === 0 ? (
        <LoadingBlock label="Loading activity…" />
      ) : null}

      {!loading && emptyCopy ? (
        <EmptyState title={emptyCopy}>
          {noSchedule ? (
            <p>No schedule yet. Publish a plan to create one.</p>
          ) : null}
        </EmptyState>
      ) : null}

      {overrideEvents.length > 0 ? (
        <ul className="activity-events" aria-label="Meal time changes">
          {overrideEvents.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {!loading && !emptyCopy && (groups.length > 0 || removals.length > 0) ? (
        <section className="activity-feed" aria-labelledby="activity-feed-title">
          <h2 id="activity-feed-title" className="sr-only">
            {cardTitle}
          </h2>
          {plannedMeta ? (
            <p className="activity-feed-card-meta">{plannedMeta}</p>
          ) : null}
          <UnreadLogEditsContext.Provider value={unreadEntryIds}>
          {groups.map((group) => (
            <ActivityDayGroup
              key={group.date}
              date={group.date}
              today={today}
              headerSuffix={
                activityType === "meal"
                  ? mealDayHeaderSummary(group.items)
                  : null
              }
              items={group.items}
              clientTimezone={clientTimezone}
              trainerTimezone={trainerTimezone}
              mealAssignments={mealAssignments}
              nudgeState={nudgeState}
              nudgingId={nudgingId}
              online={online}
              readOnly={ended}
              onNudge={(item) => void nudge(item)}
              onView={openPanel}
            />
          ))}
          </UnreadLogEditsContext.Provider>
          {removals.length > 0 ? (
            <section className="activity-day-group" data-testid="activity-removals">
              <header className="activity-day-head">
                <h2 className="activity-day-header">Removed logs</h2>
              </header>
              <ul className="activity-feed-list">
                {removals.map((event) => (
                  <ActivityRemovedRow
                    key={event.id}
                    clientName={header?.traineeDisplayName ?? event.traineeDisplayName}
                    summary={event.summary}
                    mealDate={event.mealDate ?? null}
                    previousKcal={event.previousKcal ?? null}
                    occurredAt={event.occurredAt}
                    clientTimezone={clientTimezone}
                    trainerTimezone={trainerTimezone}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      ) : null}

      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          className="activity-load-more"
          disabled={loadingMore}
          onClick={() => void load(nextCursor)}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      <ActivityDrawer
        target={drawer}
        clientTimezone={clientTimezone}
        onClose={closePanel}
      />

      {!online ? (
        <p className="muted" role="status">
          You&apos;re offline. Reminders are unavailable until you reconnect.
        </p>
      ) : null}

      {workspaceLoading ? null : null}
    </div>
  );
}
