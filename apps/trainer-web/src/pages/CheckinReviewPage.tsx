import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinReviewContext,
  CheckinReviewOutcome,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function CheckinReviewPage() {
  const navigate = useNavigate();
  const { relationshipId: routeRelationshipId = "", checkinId = "" } =
    useParams();
  const [context, setContext] = useState<CheckinReviewContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] =
    useState<CheckinReviewOutcome>("acknowledged");
  const [reviewNotes, setReviewNotes] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const relationshipId =
    routeRelationshipId || context?.checkin.coachingRelationshipId || "";

  const load = useCallback(async () => {
    if (!checkinId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getCheckinReviewContext(checkinId);
      setContext(result);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load review context.",
      );
    } finally {
      setLoading(false);
    }
  }, [checkinId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function recordOutcome() {
    if (!checkinId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.recordCheckinReview(
        checkinId,
        {
          outcome,
          notes: reviewNotes.trim() ? reviewNotes.trim() : null,
        },
        createIdempotencyKey(),
      );
      setMessage("Outcome recorded.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not record outcome.",
      );
    } finally {
      setActing(false);
    }
  }

  async function scheduleNext() {
    if (!relationshipId || !checkinId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.scheduleNextCheckin(
        relationshipId,
        { fromCheckinId: checkinId },
        createIdempotencyKey(),
      );
      setMessage(
        result.created
          ? `Next check-in scheduled for ${result.checkin.localDate}.`
          : `Next check-in already exists for ${result.checkin.localDate}.`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not schedule next check-in.",
      );
    } finally {
      setActing(false);
    }
  }

  async function recordNote() {
    if (!relationshipId || !noteBody.trim()) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.createTrainerNote(
        relationshipId,
        {
          body: noteBody.trim(),
          checkinId: checkinId || null,
        },
        createIdempotencyKey(),
      );
      setNoteBody("");
      setMessage("Note recorded.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not record note.",
      );
    } finally {
      setActing(false);
    }
  }

  async function adjustCoaching() {
    if (!relationshipId || !context?.currentPlan) {
      setError("An effective plan is required before adjusting coaching.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.createPlanDraftFromVersion(
        context.currentPlan.planId,
        {
          sourceVersionId: context.currentPlan.planVersionId,
          asAdjustment: true,
        },
        createIdempotencyKey(),
      );
      const exceptionId = context.activeExceptions[0]?.id ?? null;
      await apiClient.createIntervention(
        relationshipId,
        {
          kind: "plan_adjustment",
          summary: "Adjustment draft from check-in review",
          exceptionId,
        },
        createIdempotencyKey(),
      );
      setMessage("Adjustment draft created. Opening plan workspace.");
      navigate(`/clients/${relationshipId}/plan`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create plan adjustment.",
      );
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="page review-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <Link to="/checkins">Check-ins</Link> / Review
          </p>
          <h1>Check-in review</h1>
          <p className="lede">
            Submission, recent adherence, notes, and current plan — no invented
            risk scores.
          </p>
        </div>
        <button
          type="button"
          className="button-secondary"
          disabled={acting || !context?.currentPlan}
          onClick={() => {
            void adjustCoaching();
          }}
        >
          Adjust Coaching
        </button>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      {loading || !context ? (
        <p className="muted">Loading review context…</p>
      ) : (
        <div className="workspace-page workspace-overview">
          <section
            className="workspace-card"
            aria-labelledby="submission-heading"
          >
            <div className="workspace-card-head">
              <h2 id="submission-heading" className="workspace-card-title">
                Submission
              </h2>
              <span className={`status-pill status-${context.checkin.status}`}>
                {statusLabel(context.checkin.status)}
              </span>
            </div>
            <p className="workspace-summary">
              Due {context.checkin.localDate}
            </p>
            {context.checkin.answers ? (
              <dl className="detail-list">
                <div>
                  <dt>Wellbeing</dt>
                  <dd>{context.checkin.answers.wellbeing ?? "—"}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{context.checkin.answers.notes ?? "—"}</dd>
                </div>
                <div>
                  <dt>Body weight</dt>
                  <dd>
                    {context.checkin.answers.bodyWeightKg != null
                      ? `${context.checkin.answers.bodyWeightKg} kg`
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="workspace-empty">No answers submitted yet.</p>
            )}
          </section>

          <section
            className="workspace-card"
            aria-labelledby="adherence-heading"
          >
            <div className="workspace-card-head">
              <h2 id="adherence-heading" className="workspace-card-title">
                Recent adherence
              </h2>
            </div>
            <dl className="workspace-facts">
              <div>
                <dt className="section-kicker">Workouts completed</dt>
                <dd>{context.recentWorkoutAdherence.completed}</dd>
              </div>
              <div>
                <dt className="section-kicker">Workouts missed</dt>
                <dd>{context.recentWorkoutAdherence.missed}</dd>
              </div>
              <div>
                <dt className="section-kicker">Meals confirmed</dt>
                <dd>{context.recentMealCompliance.confirmed}</dd>
              </div>
              <div>
                <dt className="section-kicker">Meals overdue</dt>
                <dd>{context.recentMealCompliance.overdue}</dd>
              </div>
            </dl>
          </section>

          <section
            className="workspace-card"
            aria-labelledby="exceptions-heading"
          >
            <div className="workspace-card-head">
              <h2 id="exceptions-heading" className="workspace-card-title">
                Active exceptions
              </h2>
            </div>
            {context.activeExceptions.length === 0 ? (
              <p className="workspace-empty">
                No active exceptions for this client.
              </p>
            ) : (
              <ul className="activity-list">
                {context.activeExceptions.map((item) => (
                  <li key={item.id} className="activity-row">
                    <div className="workspace-row-copy">
                      <p className="workspace-row-title">
                        <span className={`status-pill status-${item.status}`}>
                          {statusLabel(item.status)}
                        </span>{" "}
                        {statusLabel(item.type)}
                      </p>
                      <p className="workspace-row-meta">
                        <Link to={`/exceptions/${item.id}`}>{item.summary}</Link>
                        <span>Detected {item.detectedAt}</span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="plan-heading">
            <div className="workspace-card-head">
              <h2 id="plan-heading" className="workspace-card-title">
                Current plan and configuration
              </h2>
            </div>
            {context.currentPlan ? (
              <p className="workspace-row-title">
                {context.currentPlan.title} · v
                {context.currentPlan.versionNumber}
              </p>
            ) : (
              <p className="workspace-empty">No effective plan.</p>
            )}
            {context.currentConfiguration ? (
              <p className="workspace-row-meta">
                Goal: {context.currentConfiguration.primaryGoal ?? "—"} · Cadence{" "}
                {context.currentConfiguration.checkinCadence} · Window{" "}
                {context.currentConfiguration.dueWindowHours}h
              </p>
            ) : null}
          </section>

          <section
            className="workspace-card workspace-span"
            aria-labelledby="notes-heading"
          >
            <div className="workspace-card-head">
              <h2 id="notes-heading" className="workspace-card-title">
                Previous notes
              </h2>
            </div>
            {context.previousNotes.length === 0 ? (
              <p className="workspace-empty">No trainer notes yet.</p>
            ) : (
              <ul className="activity-list">
                {context.previousNotes.map((note) => (
                  <li key={note.id} className="activity-row">
                    <div className="workspace-row-copy">
                      <p>{note.body}</p>
                      <p className="workspace-row-meta">{note.createdAt}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section
            className="workspace-card workspace-span"
            aria-labelledby="actions-heading"
          >
            <div className="workspace-card-head">
              <h2 id="actions-heading" className="workspace-card-title">
                Actions
              </h2>
            </div>

            {context.checkin.status === "submitted" ? (
              <div className="form-stack">
                <label className="field">
                  <span>Outcome</span>
                  <select
                    value={outcome}
                    onChange={(event) =>
                      setOutcome(event.target.value as CheckinReviewOutcome)
                    }
                  >
                    <option value="acknowledged">Acknowledged</option>
                    <option value="needs_follow_up">Needs follow-up</option>
                    <option value="adjust_coaching">Adjust coaching</option>
                  </select>
                </label>
                <label className="field">
                  <span>Outcome notes</span>
                  <textarea
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    rows={3}
                  />
                </label>
                <button
                  type="button"
                  className="button-primary"
                  disabled={acting}
                  onClick={() => {
                    void recordOutcome();
                  }}
                >
                  Record Outcome
                </button>
              </div>
            ) : (
              <p className="workspace-empty">
                Record Outcome is available after the trainee submits.
              </p>
            )}

            <div className="button-row">
              <button
                type="button"
                className="button-secondary"
                disabled={acting}
                onClick={() => {
                  void scheduleNext();
                }}
              >
                Schedule Next
              </button>
            </div>

            <div className="form-stack">
              <label className="field">
                <span>Trainer note</span>
                <textarea
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  rows={3}
                />
              </label>
              <button
                type="button"
                className="button-secondary"
                disabled={acting || !noteBody.trim()}
                onClick={() => {
                  void recordNote();
                }}
              >
                Record Note
              </button>
            </div>

            <p className="muted">
              WhatsApp remains a contextual escape hatch outside FitBud — not a
              workflow action here.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
