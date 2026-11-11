import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type { CoachLogMealRequest, MealAssignment } from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/Button";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { apiClient } from "../../lib/api";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import type { WorkspaceOutletContext } from "../workspaceContext";
import { putClientMeal } from "./coachLogApi";
import {
  EndedState,
  EntryHead,
  FailureBanner,
  IconCalendar,
  classifyFailure,
  firstName,
  isReloadFailure,
  useFrozenRequest,
  type SaveFailure,
} from "./entryShared";
import {
  LOG_WINDOW_DAYS,
  MEAL_DEVIATION_KINDS,
  MEAL_OUTCOMES,
  NOTE_MAX,
  buildMealRequest,
  coachEntryTag,
  hasClientFoodList,
  isWithinWindow,
  mealDraftFrom,
  mealDraftProblem,
  mealDraftsEqual,
  type MealDraft,
} from "./logEntryModel";

/** Log a client's meal, or correct the entry that is already there (one PUT does both). */
export function LogMealPage() {
  const { relationshipId = "", assignmentId = "" } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { workspace, ended = false, online = true } =
    useOutletContext<WorkspaceOutletContext>();
  const header = workspace?.header;
  const clientName = header?.traineeDisplayName ?? "Client";
  const first = firstName(clientName);
  const timezone = header
    ? resolveTraineeTimezone(header).timezone
    : (me?.timezone ?? "Asia/Kolkata");
  const today = useMemo(() => formatLocalDate(new Date(), timezone), [timezone]);
  const earliest = addDaysToLocalDate(today, -LOG_WINDOW_DAYS);
  const activityHref = `/clients/${relationshipId}/activity?type=meal&item=meal:${assignmentId}`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignment, setAssignment] = useState<MealAssignment | null>(null);
  const [draft, setDraft] = useState<MealDraft>(mealDraftFrom(null));
  const [initial, setInitial] = useState<MealDraft>(mealDraftFrom(null));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const frozen = useFrozenRequest<CoachLogMealRequest>();
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!assignmentId || ended) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const found = await apiClient.getMealAssignment(assignmentId);
      if (seq !== loadSeq.current) return;
      setAssignment(found);
      const next = mealDraftFrom(found.compliance);
      setDraft(next);
      setInitial(next);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(
        err instanceof ApiClientError ? err.message : "Could not load this meal.",
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [assignmentId, ended]);

  useEffect(() => {
    void load();
  }, [load]);

  /** After a conflict: refetch what is saved and start from it (unsaved edits are dropped). */
  async function reload() {
    setFailure(null);
    setFormProblem(null);
    frozen.reset();
    setNotice("Reloaded the latest saved meal. Your unsaved changes were discarded.");
    await load();
  }

  const existing = assignment?.compliance ?? null;
  const mode = existing ? "edit" : "create";
  const foodList = hasClientFoodList(existing);
  const outsideWindow =
    assignment !== null && !isWithinWindow(assignment.localDate, today);
  const unscheduled = assignment !== null && assignment.scheduleStatus !== "scheduled";
  const changed = !mealDraftsEqual(draft, initial);
  const canSave =
    online &&
    !saving &&
    assignment !== null &&
    !outsideWindow &&
    !unscheduled &&
    (mode === "create" || changed);
  const reloadNeeded = isReloadFailure(failure);

  function patch(next: Partial<MealDraft>) {
    setFormProblem(null);
    setDraft((current) => ({ ...current, ...next }));
  }

  async function save() {
    if (!canSave || !assignment) return;
    const problem = mealDraftProblem(draft);
    if (problem) {
      setFormProblem(problem);
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const recordVersion = existing ? existing.recordVersion : null;
      const body = buildMealRequest(draft, recordVersion);
      // The body is the whole form plus the version read, so it is its own fingerprint.
      const request = frozen.take(JSON.stringify(body), () => body);
      await putClientMeal(
        assignment.id,
        assignment.localDate,
        request.body,
        request.key,
      );
      navigate(activityHref);
    } catch (err) {
      setFailure(classifyFailure(err, "LOG-MEAL"));
      setSaving(false);
    }
  }

  const title = mode === "create" ? "Log meal" : "Edit meal";
  const head = <EntryHead title={title} clientName={clientName} backTo={activityHref} />;

  if (ended) {
    return (
      <EndedState
        testId="log-meal-ended"
        head={head}
        first={first}
        gender={header?.traineeProfile.gender}
        relationshipId={relationshipId}
        what="meals"
      />
    );
  }

  if (loading) {
    return (
      <div className="lw-page">
        {head}
        <LoadingBlock label="Loading meal…" />
      </div>
    );
  }

  if (loadError || !assignment) {
    return (
      <div className="lw-page">
        {head}
        <ErrorState
          message={loadError ?? "Could not load this meal."}
          onRetry={() => void load()}
          screenId="TW-17"
        />
      </div>
    );
  }

  const tag = existing ? coachEntryTag(existing, timezone) : null;

  return (
    <div className="lw-page" data-testid="log-meal-page">
      {head}

      {notice && !failure ? (
        <div className="lw-banner" role="status" data-testid="log-meal-notice">
          <IconCalendar />
          <p>{notice}</p>
        </div>
      ) : null}

      {failure ? (
        <FailureBanner failure={failure} testId="log-meal-not-saved" screen="LOG-MEAL" />
      ) : null}

      <section aria-labelledby="le-meal-label">
        <h2 className="lw-eyebrow" id="le-meal-label">
          Meal
        </h2>
        <div className="lw-card lw-workout-card">
          <h3>{assignment.mealName}</h3>
          <p>
            {formatCivilDate(assignment.localDate)} · window ends{" "}
            {formatClockTime(assignment.windowEndsAt, timezone)}
          </p>
          {tag ? (
            <p className="le-tag" data-testid="log-meal-tag">
              <strong>{tag}</strong>
            </p>
          ) : null}
        </div>
        {outsideWindow ? (
          <div className="lw-banner" data-testid="log-meal-date-limit">
            <IconCalendar />
            <p>
              This meal is dated {formatCivilDate(assignment.localDate)}. You can{" "}
              {mode === "create" ? "log" : "edit"} up to {LOG_WINDOW_DAYS} days back,
              so {formatCivilDate(earliest)} is the earliest. Older meals can’t be{" "}
              {mode === "create" ? "added" : "changed"}.
            </p>
          </div>
        ) : null}
        {unscheduled ? (
          <div className="lw-banner" data-testid="log-meal-unscheduled">
            <IconCalendar />
            <p>This meal is no longer on {first}’s plan, so it can’t be logged or edited.</p>
          </div>
        ) : null}
      </section>

      {!outsideWindow && !unscheduled ? (
        <>
          <section aria-labelledby="le-outcome-label">
            <h2 className="lw-eyebrow" id="le-outcome-label">
              What happened
            </h2>
            <div className="le-choices" role="group" aria-labelledby="le-outcome-label">
              {MEAL_OUTCOMES.map((outcome) => (
                <button
                  key={outcome}
                  type="button"
                  className="le-choice"
                  aria-pressed={draft.outcome === outcome}
                  disabled={saving || foodList}
                  onClick={() =>
                    patch({
                      outcome,
                      deviationKind: outcome === "modified" ? draft.deviationKind : null,
                    })
                  }
                >
                  {labelFor("meal_compliance_outcome", outcome)}
                </button>
              ))}
            </div>
            {foodList ? (
              <p className="le-locked" data-testid="log-meal-food-list">
                {first} logged the foods for this meal, so only the note can be changed.
              </p>
            ) : null}
          </section>

          {draft.outcome === "modified" && !foodList ? (
            <section aria-labelledby="le-kind-label">
              <h2 className="lw-eyebrow" id="le-kind-label">
                What changed
              </h2>
              <div className="le-choices" role="group" aria-labelledby="le-kind-label">
                {MEAL_DEVIATION_KINDS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="le-choice"
                    aria-pressed={draft.deviationKind === kind}
                    disabled={saving}
                    onClick={() => patch({ deviationKind: kind })}
                  >
                    {labelFor("meal_deviation_kind", kind)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <label className="le-field">
              Note (optional)
              <textarea
                value={draft.notes}
                maxLength={NOTE_MAX}
                disabled={saving}
                onChange={(event) => patch({ notes: event.target.value })}
              />
              <span className="le-count">
                {draft.notes.length} / {NOTE_MAX}
              </span>
            </label>
          </section>

          {formProblem ? (
            <p className="form-error" role="alert" data-testid="log-meal-problem">
              {formProblem}
            </p>
          ) : null}

          <div className="lw-actions">
            <Button
              variant="primary"
              className="lw-save"
              disabled={reloadNeeded ? !online || saving : !canSave}
              aria-busy={saving}
              onClick={() => (reloadNeeded ? void reload() : void save())}
            >
              {saving
                ? "Saving…"
                : reloadNeeded
                  ? "Reload"
                  : failure
                    ? "Try again"
                    : "Save meal"}
            </Button>
          </div>
        </>
      ) : (
        <div className="lw-actions">
          <Link className="button-secondary" to={activityHref}>
            Back to activity
          </Link>
        </div>
      )}
      {!online ? (
        <p className="muted" role="status">
          You’re offline. Saving is unavailable until you reconnect.
        </p>
      ) : null}
    </div>
  );
}
