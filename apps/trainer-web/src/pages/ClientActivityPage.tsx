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
    <div className="workspace-panel">
      <div className="page-header compact">
        <div>
          <h2>Activity</h2>
          <p className="muted">
            Workout adherence and meal compliance from the same records (
            {fromDate} → {toDate}).
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

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="muted">Loading activity…</p>
      ) : (
        <div className="stack-lg">
          {adherence ? (
            <section aria-labelledby="workout-adherence-heading">
              <h3 id="workout-adherence-heading">Workouts</h3>
              <dl className="stat-strip" aria-label="Workout adherence totals">
                <div>
                  <dt>Completed</dt>
                  <dd>{adherence.totals.completed}</dd>
                </div>
                <div>
                  <dt>Modified</dt>
                  <dd>{adherence.totals.modified}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{adherence.totals.skipped}</dd>
                </div>
                <div>
                  <dt>Missed</dt>
                  <dd>{adherence.totals.missed}</dd>
                </div>
                <div>
                  <dt>Assigned</dt>
                  <dd>{adherence.totals.assigned}</dd>
                </div>
                <div>
                  <dt>In progress</dt>
                  <dd>{adherence.totals.inProgress}</dd>
                </div>
              </dl>

              {adherence.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No workout assignments yet</h3>
                  <p>
                    Publish an effective plan, then generate assignments for
                    this window.
                  </p>
                </div>
              ) : (
                <ul className="activity-list">
                  {adherence.items.map((item) => (
                    <li key={item.assignmentId} className="activity-row">
                      <div>
                        <p className="client-name">{item.workoutDayName}</p>
                        <p className="client-subtitle">
                          {item.localDate}
                          {item.sessionRpe != null
                            ? ` · RPE ${item.sessionRpe}`
                            : ""}
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

          {meals ? (
            <section aria-labelledby="meal-compliance-heading">
              <h3 id="meal-compliance-heading">Meals</h3>
              <dl className="stat-strip" aria-label="Meal compliance totals">
                <div>
                  <dt>Confirmed</dt>
                  <dd>{meals.totals.confirmed}</dd>
                </div>
                <div>
                  <dt>Modified</dt>
                  <dd>{meals.totals.modified}</dd>
                </div>
                <div>
                  <dt>Skipped</dt>
                  <dd>{meals.totals.skipped}</dd>
                </div>
                <div>
                  <dt>Logged later</dt>
                  <dd>{meals.totals.loggedLater}</dd>
                </div>
                <div>
                  <dt>Overdue</dt>
                  <dd>{meals.totals.overdue}</dd>
                </div>
                <div>
                  <dt>Pending</dt>
                  <dd>{meals.totals.pending}</dd>
                </div>
              </dl>

              {meals.items.length === 0 ? (
                <div className="empty-state">
                  <h3>No meal assignments yet</h3>
                  <p>
                    Publish meal prescriptions on the effective plan, then
                    generate assignments.
                  </p>
                </div>
              ) : (
                <ul className="activity-list">
                  {meals.items.map((item) => (
                    <li key={item.assignmentId} className="activity-row">
                      <div>
                        <p className="client-name">{item.mealName}</p>
                        <p className="client-subtitle">
                          {item.localDate}
                          {item.photoRequired ? " · Photo required" : ""}
                          {item.hasPhotoIntent ? " · Photo noted" : ""}
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
      )}
    </div>
  );
}
