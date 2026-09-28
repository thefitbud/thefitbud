import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  MealComplianceSummaryResponse,
  WorkoutAdherenceResponse,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function localDateUtc(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

type WorkspaceOutlet = { refreshEpoch?: number };

export function ClientActivityPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const fromDate = useMemo(() => localDateUtc(-14), []);
  const toDate = useMemo(() => localDateUtc(7), []);
  const [adherence, setAdherence] = useState<WorkoutAdherenceResponse | null>(
    null,
  );
  const [meals, setMeals] = useState<MealComplianceSummaryResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    try {
      const [workoutResult, mealResult] = await Promise.all([
        apiClient.getWorkoutAdherence(relationshipId, { fromDate, toDate }),
        apiClient.getMealCompliance(relationshipId, { fromDate, toDate }),
      ]);
      setAdherence(workoutResult);
      setMeals(mealResult);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load activity.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  async function generateAssignments() {
    if (!relationshipId) return;
    setActing(true);
    setError(null);
    try {
      const errors: string[] = [];
      try {
        await apiClient.generateWorkoutAssignments(
          relationshipId,
          { fromDate, toDate },
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
          { fromDate, toDate },
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
        <p className="lede">
          Workout adherence and meal compliance from the same records (
          {fromDate} to {toDate}).
        </p>
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

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="muted">Loading activity…</p> : null}

      {!loading && adherence ? (
        <section
          className="workspace-card"
          aria-labelledby="workout-adherence-heading"
        >
          <div className="workspace-card-head">
            <div>
              <h2 id="workout-adherence-heading" className="workspace-card-title">
                Workouts
              </h2>
              <p className="lede">
                Assigned sessions and how they were completed in this window.
              </p>
            </div>
          </div>
          <dl className="kpi-row" aria-label="Workout adherence totals">
            <div className="kpi kpi-success">
              <dd>{adherence.totals.completed}</dd>
              <dt>Completed</dt>
            </div>
            <div className="kpi kpi-neutral">
              <dd>{adherence.totals.modified}</dd>
              <dt>Modified</dt>
            </div>
            <div className="kpi kpi-warning">
              <dd>{adherence.totals.skipped}</dd>
              <dt>Skipped</dt>
            </div>
            <div className="kpi kpi-warning">
              <dd>{adherence.totals.missed}</dd>
              <dt>Missed</dt>
            </div>
            <div className="kpi kpi-neutral">
              <dd>{adherence.totals.assigned}</dd>
              <dt>Assigned</dt>
            </div>
            <div className="kpi kpi-info">
              <dd>{adherence.totals.inProgress}</dd>
              <dt>In progress</dt>
            </div>
          </dl>

          {adherence.items.length === 0 ? (
            <div className="empty-state">
              <h3>No workout assignments yet</h3>
              <p>
                Publish an effective plan, then generate assignments for this
                window.
              </p>
            </div>
          ) : (
            <ul className="activity-list">
              {adherence.items.map((item) => (
                <li key={item.assignmentId} className="activity-row">
                  <div className="workspace-row-copy">
                    <p className="workspace-row-title">{item.workoutDayName}</p>
                    <p className="workspace-row-meta">
                      <span>{item.localDate}</span>
                      {item.sessionRpe != null ? (
                        <span>RPE {item.sessionRpe}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className={`status-pill status-${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!loading && meals ? (
        <section
          className="workspace-card"
          aria-labelledby="meal-compliance-heading"
        >
          <div className="workspace-card-head">
            <div>
              <h2 id="meal-compliance-heading" className="workspace-card-title">
                Meals
              </h2>
              <p className="lede">
                Meal assignments and compliance in the same window.
              </p>
            </div>
          </div>
          <dl className="kpi-row" aria-label="Meal compliance totals">
            <div className="kpi kpi-success">
              <dd>{meals.totals.confirmed}</dd>
              <dt>Confirmed</dt>
            </div>
            <div className="kpi kpi-neutral">
              <dd>{meals.totals.modified}</dd>
              <dt>Modified</dt>
            </div>
            <div className="kpi kpi-warning">
              <dd>{meals.totals.skipped}</dd>
              <dt>Skipped</dt>
            </div>
            <div className="kpi kpi-info">
              <dd>{meals.totals.loggedLater}</dd>
              <dt>Logged later</dt>
            </div>
            <div className="kpi kpi-warning">
              <dd>{meals.totals.overdue}</dd>
              <dt>Overdue</dt>
            </div>
            <div className="kpi kpi-neutral">
              <dd>{meals.totals.pending}</dd>
              <dt>Pending</dt>
            </div>
          </dl>

          {meals.items.length === 0 ? (
            <div className="empty-state">
              <h3>No meal assignments yet</h3>
              <p>
                Publish meal prescriptions on the effective plan, then generate
                assignments.
              </p>
            </div>
          ) : (
            <ul className="activity-list">
              {meals.items.map((item) => (
                <li key={item.assignmentId} className="activity-row">
                  <div className="workspace-row-copy">
                    <p className="workspace-row-title">{item.mealName}</p>
                    <p className="workspace-row-meta">
                      <span>{item.localDate}</span>
                      {item.photoRequired ? <span>Photo required</span> : null}
                      {item.hasPhotoIntent ? <span>Photo noted</span> : null}
                    </p>
                  </div>
                  <span className={`status-pill status-${item.status}`}>
                    {statusLabel(item.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
