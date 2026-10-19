import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  ClientWorkspace,
  MealAssignment,
  WorkspaceActivityItem,
  WorkspaceActivityType,
} from "@fitbud/contracts";
import { formatClockTime, formatHhMmTime, labelFor } from "@fitbud/core";
import { ActivityDayGroup } from "../components/activity/ActivityDayGroup";
import { ActivityDrawer } from "../components/activity/ActivityDrawer";
import type { NudgeUiState } from "../components/activity/ActivityRow";
import {
  type DateRangeMode,
  type MealStateFilter,
  type WorkoutStateFilter,
  groupByDay,
  mealDayHeaderSummary,
  parseItemParam,
  resolveDateRange,
  todayInTimezone,
} from "../components/activity/activityUtils";
import { Button } from "../components/Button";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StatePanels";
import { apiClient } from "../lib/api";
import { resolveTraineeTimezone } from "../lib/trainee-timezone";
import { useAuth } from "../auth/AuthProvider";
import type { WorkspaceOutletContext } from "./workspaceContext";

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
  const rangeMode = (searchParams.get("range") ??
    "this_week") as DateRangeMode;
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
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
          err instanceof ApiClientError
            ? err.message
            : "Could not load activity.",
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
            message: `Nudge waits until quiet hours end (${end}).`,
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
      setError(err instanceof ApiClientError ? err.message : "Could not nudge.");
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

  return (
    <div className="workspace-page activity-page" data-testid="screen-TW-17">
      <header className="workspace-page-head">
        <h1>Activity</h1>
      </header>

      <div
        className="segment activity-type-segment"
        role="group"
        aria-label="Activity type"
      >
        {(["workout", "meal", "checkin"] as const).map((type) => (
          <button
            key={type}
            type="button"
            className={
              activityType === type ? "segment-btn is-on" : "segment-btn"
            }
            aria-pressed={activityType === type}
            onClick={() =>
              patchParams({ type, state: null, item: null })
            }
          >
            {type === "workout"
              ? "Workouts"
              : type === "meal"
                ? "Meals"
                : "Check-ins"}
          </button>
        ))}
      </div>

      <div className="activity-filters">
        <div className="activity-state-pills" role="group" aria-label="State">
          {activityType === "meal"
            ? MEAL_PILLS.map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  className={
                    stateFilter === pill.value
                      ? "filter-pill is-on"
                      : "filter-pill"
                  }
                  aria-pressed={stateFilter === pill.value}
                  onClick={() => patchParams({ state: pill.value || null })}
                >
                  {pill.label}
                </button>
              ))
            : null}
          {activityType === "workout"
            ? WORKOUT_PILLS.map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  className={
                    stateFilter === pill.value
                      ? "filter-pill is-on"
                      : "filter-pill"
                  }
                  aria-pressed={stateFilter === pill.value}
                  onClick={() => patchParams({ state: pill.value || null })}
                >
                  {pill.label}
                </button>
              ))
            : null}
          {activityType === "checkin"
            ? CHECKIN_PILLS.map((value) => (
                <button
                  key={value || "all"}
                  type="button"
                  className={
                    stateFilter === value ? "filter-pill is-on" : "filter-pill"
                  }
                  aria-pressed={stateFilter === value}
                  onClick={() => patchParams({ state: value || null })}
                >
                  {value
                    ? labelFor("checkin_status", value)
                    : "All"}
                </button>
              ))
            : null}
        </div>

        <div
          className="segment activity-range-segment"
          role="group"
          aria-label="Date range"
        >
          {(
            [
              ["this_week", "This week"],
              ["last_week", "Last week"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={
                rangeMode === value ? "segment-btn is-on" : "segment-btn"
              }
              aria-pressed={rangeMode === value}
              onClick={() => patchParams({ range: value })}
            >
              {label}
            </button>
          ))}
        </div>
        {rangeMode === "custom" ? (
          <div className="activity-custom-range">
            <label className="field">
              <span>From</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) =>
                  patchParams({ from: event.target.value || null })
                }
              />
            </label>
            <label className="field">
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

      {groups.map((group) => (
        <ActivityDayGroup
          key={group.date}
          date={group.date}
          headerSuffix={
            activityType === "meal"
              ? mealDayHeaderSummary(group.items, mealAssignments)
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

      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
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
          You&apos;re offline. Nudges are unavailable until you reconnect.
        </p>
      ) : null}

      {workspaceLoading ? null : null}
    </div>
  );
}
