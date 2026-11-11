import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachLogWorkoutRequest,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatCivilDate,
  formatLocalDate,
} from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/Button";
import { ErrorState, LoadingBlock } from "../../components/StatePanels";
import { apiClient } from "../../lib/api";
import { resolveTraineeTimezone } from "../../lib/trainee-timezone";
import type { WorkspaceOutletContext } from "../workspaceContext";
import {
  type ExerciseDraft,
  LOG_WINDOW_DAYS,
  buildEditRequest,
  buildLogRequest,
  changedSetCount,
  draftsFromAssignment,
  draftsFromExecution,
  draftsProblem,
  isWithinWindow,
  performedAtFor,
  setProblem,
  windowDates,
} from "./logWorkoutModel";
import "./log-workout.css";

type Mode = "create" | "edit";

/** One banner per failed save; "network" is the only cause we actually checked. */
type SaveFailure =
  | { kind: "network" }
  | { kind: "api"; message: string; code: string }
  | { kind: "unknown" };

/**
 * API codes for which sending the same save again can never succeed: the
 * entry changed under the trainer (edit) or is already logged (create). The
 * only way forward is to reload what is saved.
 */
const RELOAD_CODES = new Set([
  "VERSION_CONFLICT",
  "WORKOUT_ALREADY_FINISHED",
  "WORKOUT_IN_PROGRESS",
]);

function classifyFailure(err: unknown): SaveFailure {
  if (err instanceof ApiClientError) {
    return { kind: "api", message: err.message, code: err.code };
  }
  // A rejected fetch is a TypeError; anything else (a ZodError, say) is a
  // client/server disagreement and must not read as a connection problem.
  if (err instanceof TypeError) return { kind: "network" };
  if (import.meta.env.DEV) {
    console.warn("[log-workout]", err instanceof Error ? err.name : typeof err);
  }
  return { kind: "unknown" };
}

function pronoun(gender: string | null | undefined): string {
  const value = (gender ?? "").toLowerCase();
  if (value === "male") return "his";
  if (value === "female") return "her";
  return "their";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "your client";
}

function newKey(): string {
  return crypto.randomUUID();
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v5.5M12 16.2v.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function dayChipLabel(localDate: string): { weekday: string; day: string } {
  const [weekday = "", day = ""] = formatCivilDate(localDate).split(" ");
  return { weekday, day };
}

export function LogWorkoutPage({ mode }: { mode: Mode }) {
  const { relationshipId = "", assignmentId, executionId } = useParams();
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
  const dates = useMemo(() => windowDates(today), [today]);
  const activityHref = `/clients/${relationshipId}/activity?type=workout`;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<WorkoutAssignment[]>([]);
  const [execution, setExecution] = useState<WorkoutExecution | null>(null);
  const [editAssignment, setEditAssignment] = useState<WorkoutAssignment | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [pickedAssignmentId, setPickedAssignmentId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [drafts, setDrafts] = useState<ExerciseDraft[]>([]);
  const [initialDrafts, setInitialDrafts] = useState<ExerciseDraft[]>([]);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // One logical create: the key and the exact request body travel together, so
  // a retry resends the identical body (performedAt included). Both are
  // renewed only when the form changes.
  const idempotency = useRef<{
    fingerprint: string;
    key: string;
    body: CoachLogWorkoutRequest;
  } | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async (keepSelection = false) => {
    if (!relationshipId || ended) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      if (mode === "edit") {
        if (!executionId) throw new Error("missing execution");
        const found = await apiClient.getWorkoutExecution(executionId);
        const assignment = await apiClient.getWorkoutAssignment(found.assignmentId);
        if (seq !== loadSeq.current) return;
        setExecution(found);
        setEditAssignment(assignment);
        const performed = formatLocalDate(
          new Date(found.completedAt ?? found.startedAt),
          timezone,
        );
        setSelectedDate(performed);
        const next = draftsFromExecution(found);
        setDrafts(next);
        setInitialDrafts(next);
        setOpenExercise(next[0]?.exerciseId ?? null);
      } else {
        const list = await apiClient.listWorkoutAssignments(relationshipId, {
          fromDate: earliest,
          toDate: today,
        });
        if (seq !== loadSeq.current) return;
        const rows = list.items;
        setAssignments(rows);
        const fromParam = assignmentId
          ? rows.find((row) => row.id === assignmentId)
          : undefined;
        const loggable = rows.filter(
          (row) => row.scheduleStatus === "scheduled" && !row.execution,
        );
        const initial =
          fromParam?.localDate ??
          [...loggable].sort((a, b) => b.localDate.localeCompare(a.localDate))[0]
            ?.localDate ??
          today;
        if (!keepSelection) {
          setSelectedDate(initial);
          setPickedAssignmentId(fromParam?.id ?? null);
        }
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setLoadError(
        err instanceof ApiClientError ? err.message : "Could not load this workout.",
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [assignmentId, earliest, ended, executionId, mode, relationshipId, timezone, today]);

  useEffect(() => {
    void load();
  }, [load]);

  /** After a conflict: refetch what is saved and start from it (unsaved edits are dropped). */
  async function reload() {
    setFailure(null);
    idempotency.current = null;
    setNotice(
      mode === "edit"
        ? "Reloaded the latest saved version. Your unsaved changes were discarded."
        : "Reloaded the latest saved workouts.",
    );
    await load(true);
  }

  const dayAssignments = useMemo(
    () => assignments.filter((row) => row.localDate === selectedDate),
    [assignments, selectedDate],
  );
  const loggableOnDay = dayAssignments.filter(
    (row) => row.scheduleStatus === "scheduled" && !row.execution,
  );
  const loggedOnDay = dayAssignments.find(
    (row) =>
      row.execution &&
      (row.execution.status === "completed" || row.execution.status === "modified"),
  );
  const allLoggable = assignments.filter(
    (row) => row.scheduleStatus === "scheduled" && !row.execution,
  );
  // A workout picked from another day is logged on the selected date (DS8 d2).
  const createAssignment =
    mode === "create"
      ? ((pickedAssignmentId
          ? allLoggable.find((row) => row.id === pickedAssignmentId)
          : undefined) ??
        loggableOnDay[0] ??
        null)
      : null;
  const otherLoggable = allLoggable.filter((row) => row.id !== createAssignment?.id);

  // Prefill from the plan whenever the workout being logged changes.
  const draftSourceId = createAssignment?.id ?? null;
  useEffect(() => {
    if (mode !== "create") return;
    const next = createAssignment ? draftsFromAssignment(createAssignment) : [];
    setDrafts(next);
    setInitialDrafts(next);
    setOpenExercise(next[0]?.exerciseId ?? null);
    setFailure(null);
    setFormProblem(null);
    setNotice(null);
    idempotency.current = null;
  }, [draftSourceId, mode]);

  function patchSet(
    exerciseId: string,
    key: string,
    patch: Partial<ExerciseDraft["sets"][number]>,
  ) {
    setFormProblem(null);
    setDrafts((current) =>
      current.map((exercise) =>
        exercise.exerciseId !== exerciseId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.key === key ? { ...set, ...patch } : set,
              ),
            },
      ),
    );
  }

  const entryDate =
    mode === "edit" && execution
      ? formatLocalDate(new Date(execution.completedAt ?? execution.startedAt), timezone)
      : null;
  const dateChanged = mode === "edit" && entryDate !== null && selectedDate !== entryDate;
  const editedCount = changedSetCount(initialDrafts, drafts);
  const entryOutsideWindow =
    mode === "edit" && entryDate !== null && !isWithinWindow(entryDate, today);
  const canSave =
    online &&
    !saving &&
    drafts.length > 0 &&
    (mode === "create" ? createAssignment !== null : !entryOutsideWindow && (editedCount > 0 || dateChanged));

  const reloadNeeded = failure?.kind === "api" && RELOAD_CODES.has(failure.code);

  async function save() {
    if (!canSave) return;
    const problem = draftsProblem(drafts);
    if (problem) {
      setFormProblem(problem);
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      if (mode === "create" && createAssignment) {
        // The fingerprint is the form (workout, day, sets), not the request,
        // because performedAt for today is "now" and would differ per attempt.
        const fingerprint = JSON.stringify({
          id: createAssignment.id,
          day: selectedDate,
          sets: drafts.map((exercise) => exercise.sets),
        });
        if (idempotency.current?.fingerprint !== fingerprint) {
          idempotency.current = {
            fingerprint,
            key: newKey(),
            body: buildLogRequest({
              drafts,
              performedAt: performedAtFor(selectedDate, timezone),
            }),
          };
        }
        const saved = await apiClient.logClientWorkout(
          createAssignment.id,
          idempotency.current.body,
          idempotency.current.key,
        );
        navigate(
          `/clients/${relationshipId}/activity?type=workout&item=workout:${saved.assignmentId}`,
        );
      } else if (mode === "edit" && execution) {
        const body = buildEditRequest({
          recordVersion: execution.recordVersion,
          initial: initialDrafts,
          drafts,
          performedAt: dateChanged
            ? performedAtFor(selectedDate, timezone)
            : null,
        });
        const saved = await apiClient.editClientWorkout(execution.id, body);
        navigate(
          `/clients/${relationshipId}/activity?type=workout&item=workout:${saved.assignmentId}`,
        );
      }
    } catch (err) {
      setFailure(classifyFailure(err));
      setSaving(false);
    }
  }

  const title = mode === "create" ? "Log workout" : "Edit workout";

  const head = (
    <header className="lw-head">
      <Link className="lw-back" to={activityHref} aria-label="Back to activity">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <div>
        <h1>{title}</h1>
        <p className="lw-sub">{clientName}</p>
      </div>
    </header>
  );

  if (ended) {
    return (
      <div className="lw-page" data-testid="log-workout-ended">
        {head}
        <div className="lw-ended">
          <span className="lw-ended-icon">
            <IconLock />
          </span>
          <h2>Coaching with {first} has ended</h2>
          <p>
            Ended clients are read-only, so you can’t{" "}
            {mode === "create" ? "log" : "edit"} workouts for them. Reactivate
            coaching from {pronoun(header?.traineeProfile.gender)} client page to{" "}
            {mode === "create" ? "log again" : "edit again"}.
          </p>
          <Link className="button-secondary" to={`/clients/${relationshipId}/overview`}>
            Open {first}’s page
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="lw-page">
        {head}
        <LoadingBlock label="Loading workout…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lw-page">
        {head}
        <ErrorState message={loadError} onRetry={() => void load()} screenId="TW-17" />
      </div>
    );
  }

  const planned =
    mode === "create" ? createAssignment : editAssignment;
  const workoutName = planned?.workoutDayName ?? "";
  const exerciseCount = drafts.length;
  const showForm = drafts.length > 0 && planned !== null;

  return (
    <div className="lw-page" data-testid="log-workout-page">
      {head}

      {notice && !failure ? (
        <div className="lw-banner" role="status" data-testid="log-workout-notice">
          <IconCalendar />
          <p>{notice}</p>
        </div>
      ) : null}

      {failure ? (
        <div className="lw-banner is-error" role="alert" data-testid="log-workout-not-saved">
          <IconAlert />
          <p>
            {failure.kind === "network"
              ? "Not saved. We couldn’t reach FitBud, so nothing was saved. Your entries are still here. Check your connection and try again."
              : failure.kind === "api"
                ? RELOAD_CODES.has(failure.code)
                  ? `Not saved. ${failure.message} Reload to see what is saved.`
                  : `Not saved. ${failure.message} Your entries are still here.`
                : "Not saved. Something went wrong on our side (LOG-WORKOUT). Your entries are still here. Try again."}
          </p>
        </div>
      ) : null}

      <section aria-labelledby="lw-date-label">
        <h2 className="lw-eyebrow" id="lw-date-label">
          Date · up to {LOG_WINDOW_DAYS} days back
        </h2>
        <div className="lw-days" role="group" aria-label="Date">
          {dates.map((date) => {
            const chip = dayChipLabel(date);
            const on = date === selectedDate;
            return (
              <button
                key={date}
                type="button"
                className={on ? "lw-day is-on" : "lw-day"}
                aria-pressed={on}
                aria-label={formatCivilDate(date)}
                disabled={saving}
                onClick={() => {
                  setSelectedDate(date);
                  setPickedAssignmentId(null);
                  setChoosing(false);
                  setFailure(null);
                  setNotice(null);
                }}
              >
                <span>{chip.weekday}</span>
                <strong>{chip.day}</strong>
              </button>
            );
          })}
        </div>
        {selectedDate === earliest ? (
          <div className="lw-banner" data-testid="log-workout-date-limit">
            <IconCalendar />
            <p>
              You can {mode === "create" ? "log" : "edit"} up to {LOG_WINDOW_DAYS} days back,
              so {formatCivilDate(earliest)} is the earliest. Older workouts can’t be{" "}
              {mode === "create" ? "added" : "changed"}.
            </p>
          </div>
        ) : null}
        {entryOutsideWindow && entryDate ? (
          <div className="lw-banner" data-testid="log-workout-date-limit">
            <IconCalendar />
            <p>
              This workout is dated {formatCivilDate(entryDate)}. You can edit up to{" "}
              {LOG_WINDOW_DAYS} days back, so {formatCivilDate(earliest)} is the earliest.
              Older workouts can’t be changed.
            </p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="lw-workout-label">
        <h2 className="lw-eyebrow" id="lw-workout-label">
          Workout
        </h2>

        {mode === "create" && !createAssignment ? (
          loggedOnDay?.execution ? (
            <div className="lw-card lw-empty" data-testid="log-workout-already">
              <h3>
                {loggedOnDay.workoutDayName} is already logged for {formatCivilDate(selectedDate)}
              </h3>
              <p>A finished workout is edited, not logged twice.</p>
              <Link
                className="button-secondary"
                to={`/clients/${relationshipId}/workouts/${loggedOnDay.execution.id}/edit`}
              >
                Edit workout
              </Link>
            </div>
          ) : (
            <div className="lw-card lw-empty" data-testid="log-workout-nothing-planned">
              <h3>Nothing planned on {formatCivilDate(selectedDate)}</h3>
              <p>
                Pick another day{otherLoggable.length > 0 ? `, or choose a workout from ${first}’s current plan` : ""}.
              </p>
              {otherLoggable.length > 0 ? (
                <>
                  <Button
                    variant="secondary"
                    aria-expanded={choosing}
                    onClick={() => setChoosing((value) => !value)}
                  >
                    Choose a workout
                  </Button>
                  {choosing ? (
                    <ul className="lw-choices">
                      {otherLoggable.map((row) => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="lw-choice"
                            onClick={() => {
                              setPickedAssignmentId(row.id);
                              setChoosing(false);
                            }}
                          >
                            <strong>{row.workoutDayName}</strong>
                            <span>Planned {formatCivilDate(row.localDate)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          )
        ) : null}

        {mode === "edit" && drafts.length === 0 ? (
          <div className="lw-card lw-empty" data-testid="log-workout-no-sets">
            <h3>No sets to edit</h3>
            <p>This workout was saved without any sets, so there is nothing to change.</p>
          </div>
        ) : null}

        {showForm ? (
          <>
            <div className="lw-card lw-workout-card">
              <div className="lw-workout-row">
                <div>
                  <h3>{workoutName}</h3>
                  <p>
                    Planned for {formatCivilDate(planned.localDate)} · {exerciseCount}{" "}
                    {exerciseCount === 1 ? "exercise" : "exercises"}
                  </p>
                </div>
                {mode === "create" && otherLoggable.length > 0 ? (
                  <Button
                    variant="secondary"
                    aria-expanded={choosing}
                    disabled={saving}
                    onClick={() => setChoosing((value) => !value)}
                  >
                    Choose a workout
                  </Button>
                ) : null}
              </div>
              {mode === "create" && choosing ? (
                <ul className="lw-choices">
                  {otherLoggable.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="lw-choice"
                        onClick={() => {
                          setPickedAssignmentId(row.id);
                          setChoosing(false);
                        }}
                      >
                        <strong>{row.workoutDayName}</strong>
                        <span>Planned {formatCivilDate(row.localDate)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="lw-exercises">
              {drafts.map((exercise, index) => {
                const open = openExercise === exercise.exerciseId;
                return (
                  <section
                    key={exercise.exerciseId}
                    className="lw-card lw-exercise"
                    aria-label={exercise.name}
                  >
                    <button
                      type="button"
                      className="lw-exercise-head"
                      aria-expanded={open}
                      onClick={() =>
                        setOpenExercise(open ? null : exercise.exerciseId)
                      }
                    >
                      <span className="lw-index" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="lw-exercise-title">
                        <strong>{exercise.name}</strong>
                        <span>
                          {exercise.plannedSummary ? `${exercise.plannedSummary} · ` : ""}
                          {mode === "create" ? "prefilled from plan" : "as logged"}
                        </span>
                      </span>
                      <svg
                        className={open ? "lw-chev is-open" : "lw-chev"}
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    {open ? (
                      <div className="lw-sets" role="table" aria-label={`${exercise.name} sets`}>
                        <div className="lw-set-row lw-set-head" role="row">
                          <span role="columnheader">Set</span>
                          <span role="columnheader">Planned</span>
                          <span role="columnheader">Load</span>
                          <span role="columnheader">Reps</span>
                          <span role="columnheader">Done</span>
                        </div>
                        {exercise.sets.map((set) => {
                          const problem = setProblem(set);
                          return (
                            <div className="lw-set-row" role="row" key={set.key}>
                              <span className="lw-num" role="cell">
                                {set.order}
                              </span>
                              <span className="lw-planned" role="cell">
                                {set.plannedLabel}
                              </span>
                              <span className="lw-load" role="cell">
                                <label className="lw-input">
                                  <input
                                    aria-label={`${exercise.name} set ${set.order} load in kg`}
                                    inputMode="decimal"
                                    value={set.bodyweight ? "" : set.loadText}
                                    placeholder={set.bodyweight ? "Bodyweight" : "kg"}
                                    disabled={!set.done || set.bodyweight || saving}
                                    aria-invalid={problem ? true : undefined}
                                    onChange={(event) =>
                                      patchSet(exercise.exerciseId, set.key, {
                                        loadText: event.target.value.trim(),
                                      })
                                    }
                                  />
                                  {!set.bodyweight ? <em>kg</em> : null}
                                </label>
                                <label className="lw-check">
                                  <input
                                    type="checkbox"
                                    aria-label={`${exercise.name} set ${set.order} bodyweight`}
                                    checked={set.bodyweight}
                                    disabled={!set.done || saving}
                                    onChange={(event) =>
                                      patchSet(exercise.exerciseId, set.key, {
                                        bodyweight: event.target.checked,
                                      })
                                    }
                                  />
                                  <span>Bodyweight</span>
                                </label>
                              </span>
                              <span role="cell">
                                <label className="lw-input">
                                  <input
                                    aria-label={`${exercise.name} set ${set.order} reps`}
                                    inputMode="numeric"
                                    value={set.repsText}
                                    disabled={!set.done || saving}
                                    aria-invalid={problem ? true : undefined}
                                    onChange={(event) =>
                                      patchSet(exercise.exerciseId, set.key, {
                                        repsText: event.target.value.trim(),
                                      })
                                    }
                                  />
                                </label>
                              </span>
                              <span role="cell">
                                <label className="lw-check">
                                  <input
                                    type="checkbox"
                                    aria-label={`${exercise.name} set ${set.order} done`}
                                    checked={set.done}
                                    disabled={saving}
                                    onChange={(event) =>
                                      patchSet(exercise.exerciseId, set.key, {
                                        done: event.target.checked,
                                      })
                                    }
                                  />
                                  <span>{set.done ? "Done" : "Skipped"}</span>
                                </label>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </>
        ) : null}
      </section>

      {formProblem ? (
        <p className="form-error" role="alert" data-testid="log-workout-problem">
          {formProblem}
        </p>
      ) : null}

      {showForm ? (
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
                  : "Save workout"}
          </Button>
        </div>
      ) : null}
      {!online ? (
        <p className="muted" role="status">
          You’re offline. Saving is unavailable until you reconnect.
        </p>
      ) : null}
    </div>
  );
}

export function LogWorkoutCreateRoute() {
  return <LogWorkoutPage mode="create" />;
}

export function LogWorkoutEditRoute() {
  return <LogWorkoutPage mode="edit" />;
}
