import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import {
  checkinStatusSchema,
  mealAssignmentStatusSchema,
  workoutAssignmentStatusSchema,
  type WorkspaceActivityItem,
  type WorkspaceActivityType,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import type { WorkspaceOutletContext } from "./workspaceContext";

function localDateUtc(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function typeLabel(type: WorkspaceActivityType): string {
  if (type === "workout") return "Workout";
  if (type === "meal") return "Meal";
  return "Check-in";
}

function isUnresolved(item: WorkspaceActivityItem): boolean {
  if (item.type === "workout") {
    return (
      item.state === "assigned" ||
      item.state === "in_progress" ||
      item.state === "paused" ||
      item.state === "missed"
    );
  }
  if (item.type === "meal") {
    return item.state === "pending" || item.state === "overdue";
  }
  return item.state === "scheduled" || item.state === "due" || item.state === "overdue";
}

function statesFor(type: WorkspaceActivityType): readonly string[] {
  if (type === "workout") return workoutAssignmentStatusSchema.options;
  if (type === "meal") return mealAssignmentStatusSchema.options;
  return checkinStatusSchema.options;
}

function PlanVersionReference({
  planVersionId,
  effectiveVersionId,
  effectiveTitle,
  workspaceReady,
}: {
  planVersionId: string | null;
  effectiveVersionId: string | null;
  effectiveTitle: string | null;
  workspaceReady: boolean;
}) {
  if (!planVersionId) return null;
  let label = "Plan version";
  if (workspaceReady) {
    if (planVersionId === effectiveVersionId) {
      label = effectiveTitle ? `Effective plan · ${effectiveTitle}` : "Effective plan";
    } else {
      label = "Earlier plan version";
    }
  }
  return (
    <p className="activity-plan-ref">
      {label}
      <span className="activity-plan-id">{planVersionId}</span>
    </p>
  );
}

export function ClientActivityPage() {
  const { relationshipId = "" } = useParams();
  const { workspace, workspaceLoading, refreshEpoch = 0 } =
    useOutletContext<WorkspaceOutletContext>();
  const generateFrom = useMemo(() => localDateUtc(-14), []);
  const generateTo = useMemo(() => localDateUtc(7), []);
  const [activityType, setActivityType] = useState<WorkspaceActivityType>("workout");
  const [state, setState] = useState("");
  const [occurredFrom, setOccurredFrom] = useState("");
  const [occurredTo, setOccurredTo] = useState("");
  const [items, setItems] = useState<WorkspaceActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [acting, setActing] = useState(false);
  const [nudgingId, setNudgingId] = useState<string | null>(null);
  const [nudgeNote, setNudgeNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const filterKey = `${relationshipId}|${activityType}|${state}|${occurredFrom}|${occurredTo}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const stateOptions = statesFor(activityType);
  const listReady = loadedKey === filterKey && !loading;

  const load = useCallback(
    async (cursor?: string | null) => {
      if (!relationshipId) return;
      const id = ++requestId.current;
      const appending = Boolean(cursor);
      if (appending) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setItems([]);
        setNextCursor(null);
      }
      setError(null);
      try {
        const result = await apiClient.listWorkspaceActivity(relationshipId, {
          type: activityType,
          state: state || undefined,
          occurredFrom: occurredFrom || undefined,
          occurredTo: occurredTo || undefined,
          cursor: cursor ?? undefined,
          limit: 30,
        });
        if (requestId.current !== id) return;
        setItems((current) =>
          appending ? [...current, ...result.items] : result.items,
        );
        setNextCursor(result.nextCursor);
        if (!appending) setLoadedKey(filterKey);
      } catch (err) {
        if (requestId.current !== id) return;
        setError(
          err instanceof ApiClientError
            ? err.message
            : "Could not load activity.",
        );
        if (!appending) setLoadedKey(filterKey);
      } finally {
        if (requestId.current === id) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [activityType, filterKey, occurredFrom, occurredTo, relationshipId, state],
  );

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  function changeType(next: WorkspaceActivityType) {
    setActivityType(next);
    setState("");
    setNudgeNote({});
  }

  async function nudge(item: WorkspaceActivityItem) {
    if (!relationshipId) return;
    setNudgingId(item.id);
    setError(null);
    try {
      const result = await apiClient.nudgeActivity(relationshipId, {
        activityType: item.type,
        activityId: item.id,
      });
      const note = result.deduped
        ? "Already nudged today."
        : result.notification.state === "deferred"
          ? "Nudge waits until quiet hours end."
          : result.notification.state === "suppressed"
            ? "Client notification settings suppressed this nudge."
            : "Nudge sent.";
      setNudgeNote((current) => ({ ...current, [item.id]: note }));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not nudge.");
    } finally {
      setNudgingId(null);
    }
  }

  async function generateAssignments() {
    if (!relationshipId) return;
    setActing(true);
    setError(null);
    try {
      const errors: string[] = [];
      try {
        await apiClient.generateWorkoutAssignments(
          relationshipId,
          { fromDate: generateFrom, toDate: generateTo },
          createIdempotencyKey(),
        );
      } catch (err) {
        errors.push(
          err instanceof ApiClientError
            ? `Workouts: ${err.message}`
            : "Workouts: could not generate.",
        );
      }
      try {
        await apiClient.generateMealAssignments(
          relationshipId,
          { fromDate: generateFrom, toDate: generateTo },
          createIdempotencyKey(),
        );
      } catch (err) {
        errors.push(
          err instanceof ApiClientError
            ? `Meals: ${err.message}`
            : "Meals: could not generate.",
        );
      }
      await load();
      if (errors.length > 0) {
        setError(errors.join(" "));
      }
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="workspace-page">
      <div className="workspace-toolbar">
        <div>
          <p className="workspace-kicker">Execution</p>
          <h2 className="workspace-card-title">Activity</h2>
          <p className="lede">
            Workout, meal, and check-in rows for this client. Type, state, and
            civil dates are one server filter each.
          </p>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={acting}
          onClick={() => {
            void generateAssignments();
          }}
        >
          {acting ? "Generating…" : "Generate assignments"}
        </button>
      </div>

      <form
        className="workspace-filters"
        aria-label="Activity filters"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="field">
          <span>Type</span>
          <select
            value={activityType}
            onChange={(event) =>
              changeType(event.target.value as WorkspaceActivityType)
            }
          >
            <option value="workout">Workout</option>
            <option value="meal">Meal</option>
            <option value="checkin">Check-in</option>
          </select>
        </label>
        <label className="field">
          <span>State</span>
          <select value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">Any state</option>
            {stateOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>From</span>
          <input
            type="date"
            value={occurredFrom}
            onChange={(event) => setOccurredFrom(event.target.value)}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input
            type="date"
            value={occurredTo}
            onChange={(event) => setOccurredTo(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="button-ghost"
          onClick={() => {
            setState("");
            setOccurredFrom("");
            setOccurredTo("");
          }}
        >
          Clear filters
        </button>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="workspace-card" aria-labelledby="activity-list-heading">
        <div className="workspace-card-head">
          <div>
            <p className="workspace-kicker">{typeLabel(activityType)}</p>
            <h2 id="activity-list-heading" className="workspace-card-title">
              {typeLabel(activityType)} activity
            </h2>
            <p className="lede">
              Generate assignments still uses {generateFrom} to {generateTo}.
            </p>
          </div>
        </div>

        {!listReady ? <p className="muted">Loading activity…</p> : null}
        {listReady && items.length === 0 && !error ? (
          <p className="workspace-empty" role="status">
            No {typeLabel(activityType).toLowerCase()} activity for these filters.
          </p>
        ) : null}
        {listReady && items.length > 0 ? (
          <ul className="activity-list">
            {items.map((item) => (
              <li key={`${item.type}:${item.id}`} className="activity-row">
                <div className="workspace-row-copy">
                  <p className="workspace-row-title">{item.title}</p>
                  <p className="workspace-row-meta">
                    <span>{item.localDate}</span>
                    <span className="workspace-kind">{typeLabel(item.type)}</span>
                  </p>
                  <PlanVersionReference
                    planVersionId={item.planVersionId}
                    effectiveVersionId={workspace?.plan.version?.id ?? null}
                    effectiveTitle={workspace?.plan.plan?.title ?? null}
                    workspaceReady={Boolean(workspace) && !workspaceLoading}
                  />
                </div>
                <div className="row-actions">
                  {isUnresolved(item) ? (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={nudgingId === item.id}
                      onClick={() => {
                        void nudge(item);
                      }}
                    >
                      {nudgingId === item.id ? "Nudging…" : "Nudge"}
                    </button>
                  ) : null}
                  {nudgeNote[item.id] ? (
                    <p className="workspace-row-meta" role="status">
                      {nudgeNote[item.id]}
                    </p>
                  ) : null}
                  <span className={`status-pill status-${item.state}`}>
                    {statusLabel(item.state)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {listReady && nextCursor ? (
          <button
            type="button"
            className="button-secondary"
            disabled={loadingMore}
            onClick={() => {
              void load(nextCursor);
            }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </section>
    </div>
  );
}
