import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  EffectivePlanResponse,
  PlanTemplateSummary,
  PlanVersion,
  WorkoutDay,
  WorkoutExercise,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";
import "../styles/plan.css";

function newId(): string {
  return crypto.randomUUID();
}

type WorkspaceOutlet = { refreshEpoch?: number };
type PlanSurface = "summary" | "builder";

function formatWhen(value: string | null | undefined): string {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function versionStatusLabel(status: PlanVersion["status"]): string {
  return status.replace(/_/g, " ");
}

function dayBadge(day: WorkoutDay): string {
  return `D${day.order}`;
}

function setCount(day: WorkoutDay): number {
  return day.exercises.reduce((total, exercise) => {
    return total + exercise.setTargets.length;
  }, 0);
}

function applyExerciseToForm(
  exercise: WorkoutExercise | undefined,
  setters: {
    setExerciseName: (value: string) => void;
    setReps: (value: number) => void;
    setLoadLabel: (value: string) => void;
  },
) {
  if (!exercise) return;
  setters.setExerciseName(exercise.name);
  const set = exercise.setTargets[0];
  if (set?.reps != null) setters.setReps(set.reps);
  if (set?.loadLabel) setters.setLoadLabel(set.loadLabel);
}

function collectInstructions(version: PlanVersion): {
  title: string;
  body: string;
}[] {
  const notes: { title: string; body: string }[] = [];
  for (const day of version.content.workoutDays) {
    for (const exercise of day.exercises) {
      const body = exercise.instructions?.trim();
      if (body) {
        notes.push({ title: exercise.name, body });
      }
    }
  }
  for (const meal of version.content.mealPrescriptions) {
    const body = meal.instructions?.trim();
    if (body) {
      notes.push({ title: meal.name, body });
    }
  }
  return notes;
}

function IconAdjust() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function ClientPlanPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const [effective, setEffective] = useState<EffectivePlanResponse | null>(
    null,
  );
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draftPreview, setDraftPreview] = useState<PlanVersion | null>(null);
  const [surface, setSurface] = useState<PlanSurface>("summary");
  const [selectedDayId, setSelectedDayId] = useState("");
  const [title, setTitle] = useState("Training block");
  const [dayName, setDayName] = useState("Day A");
  const [exerciseName, setExerciseName] = useState("Squat");
  const [reps, setReps] = useState(5);
  const [loadLabel, setLoadLabel] = useState("RPE 7");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const didInitSurface = useRef(false);

  useEffect(() => {
    didInitSurface.current = false;
  }, [relationshipId]);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
    let nextVersion: PlanVersion | null = null;
    try {
      const [result, templatePage] = await Promise.all([
        apiClient.getEffectivePlan(relationshipId),
        apiClient.listPlanTemplates(),
      ]);
      setEffective(result);
      setTemplates(templatePage.items);
      setSelectedTemplateId(
        (current) => current || templatePage.items[0]?.id || "",
      );
      if (result.plan) {
        setTitle(result.plan.title);
      }
      nextVersion = result.version;
      const firstDay = result.version?.content.workoutDays[0];
      if (firstDay) {
        setSelectedDayId((current) => current || firstDay.id);
      }
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load effective plan.",
      );
    } finally {
      setLoading(false);
      if (!didInitSurface.current) {
        didInitSurface.current = true;
        setSurface(nextVersion ? "summary" : "builder");
      }
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

  const version: PlanVersion | null = effective?.version ?? null;
  const sourceVersion = draftPreview ?? version;
  const splitDays = sourceVersion?.content.workoutDays ?? [];
  const workoutDays = version?.content.workoutDays ?? [];
  const meals = version?.content.mealPrescriptions ?? [];
  const coachNotes = version ? collectInstructions(version) : [];
  const selectedDay =
    splitDays.find((day) => day.id === selectedDayId) ?? splitDays[0] ?? null;
  const selectedExercise = selectedDay?.exercises[0];
  const snapshotRpe = selectedExercise?.setTargets[0]?.rpe ?? null;

  const selectedDayMeta = useMemo(() => {
    if (!selectedDay) return null;
    return {
      exercises: selectedDay.exercises.length,
      sets: setCount(selectedDay),
    };
  }, [selectedDay]);

  function buildContent() {
    return {
      workoutDays: [
        {
          id: newId(),
          order: 1,
          name: dayName.trim() || "Day A",
          exercises: [
            {
              id: newId(),
              order: 1,
              name: exerciseName.trim() || "Exercise",
              instructions: selectedExercise?.instructions ?? null,
              setTargets: [
                {
                  id: newId(),
                  order: 1,
                  reps,
                  loadLabel: loadLabel.trim() || null,
                  rpe: snapshotRpe,
                },
              ],
            },
          ],
        },
      ],
      mealPrescriptions: [] as never[],
    };
  }

  function selectDay(day: WorkoutDay) {
    setSelectedDayId(day.id);
    setDayName(day.name);
    applyExerciseToForm(day.exercises[0], {
      setExerciseName,
      setReps,
      setLoadLabel,
    });
  }

  async function onApplyTemplate(event: FormEvent) {
    event.preventDefault();
    if (!relationshipId || !selectedTemplateId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.applyPlanTemplate(
        relationshipId,
        { templateId: selectedTemplateId },
        createIdempotencyKey(),
      );
      setDraftPreview(result.version);
      setTitle(result.plan.title);
      const day = result.version.content.workoutDays[0];
      if (day) {
        setSelectedDayId(day.id);
        setDayName(day.name);
        applyExerciseToForm(day.exercises[0], {
          setExerciseName,
          setReps,
          setLoadLabel,
        });
      }
      setSurface("builder");
      setMessage(
        result.updatedExistingDraft
          ? `Draft v${result.version.versionNumber} updated from template (copied). Customize below, then publish.`
          : `Draft v${result.version.versionNumber} created from template (copied). Customize below, then publish.`,
      );
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not apply template.",
      );
    } finally {
      setActing(false);
    }
  }

  async function onPublish(event: FormEvent) {
    event.preventDefault();
    if (!relationshipId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const content = buildContent();
      let planId: string;
      let publishVersion: PlanVersion;

      if (draftPreview) {
        const updated = await apiClient.updatePlanDraft(
          draftPreview.planId,
          draftPreview.id,
          {
            expectedRecordVersion: draftPreview.recordVersion,
            title: title.trim(),
            content,
          },
        );
        planId = draftPreview.planId;
        publishVersion = await apiClient.publishPlanVersion(
          planId,
          updated.id,
          {
            expectedRecordVersion: updated.recordVersion,
            mode: "immediate",
          },
          createIdempotencyKey(),
        );
        setDraftPreview(null);
      } else if (effective?.plan && effective.version) {
        const draft = await apiClient.createPlanDraftFromVersion(
          effective.plan.id,
          {
            sourceVersionId: effective.version.id,
            asAdjustment: true,
          },
          createIdempotencyKey(),
        );
        planId = effective.plan.id;
        const updated = await apiClient.updatePlanDraft(planId, draft.id, {
          expectedRecordVersion: draft.recordVersion,
          title: title.trim(),
          content,
        });
        publishVersion = await apiClient.publishPlanVersion(
          planId,
          updated.id,
          {
            expectedRecordVersion: updated.recordVersion,
            mode: "immediate",
          },
          createIdempotencyKey(),
        );
        await apiClient.createIntervention(
          relationshipId,
          {
            kind: "plan_adjustment",
            summary: `Published plan adjustment v${publishVersion.versionNumber}`,
            resultingPlanVersionId: publishVersion.id,
          },
          createIdempotencyKey(),
        );
      } else {
        const created = await apiClient.createPlan(
          relationshipId,
          {
            title: title.trim(),
            content,
          },
          createIdempotencyKey(),
        );
        planId = created.plan.id;
        publishVersion = await apiClient.publishPlanVersion(
          planId,
          created.version.id,
          {
            expectedRecordVersion: created.version.recordVersion,
            mode: "immediate",
          },
          createIdempotencyKey(),
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      const toDate = new Date(Date.now() + 13 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      await apiClient.generateWorkoutAssignments(
        relationshipId,
        { fromDate: today, toDate },
        createIdempotencyKey(),
      );
      setMessage(
        `Published plan version ${publishVersion.versionNumber} and generated assignments.`,
      );
      setSurface("summary");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not publish plan.",
      );
    } finally {
      setActing(false);
    }
  }

  const showSummary = surface === "summary" && Boolean(version);

  return (
    <div className="plan-page">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      {loading ? (
        <p className="muted">Loading plan…</p>
      ) : showSummary && version ? (
        <div className="plan-tab">
          <section className="plan-card plan-effective" aria-labelledby="effective-plan-heading">
            <div className="plan-card-head">
              <div>
                <p className="plan-kicker">Current effective plan</p>
                <h2 id="effective-plan-heading">{effective?.plan?.title}</h2>
                <p className="plan-meta">
                  <span className="plan-chip plan-chip-success">
                    Effective {formatWhen(version.effectiveFrom)} (Version{" "}
                    {version.versionNumber})
                  </span>
                  <span className="plan-status">
                    {versionStatusLabel(version.status)}
                  </span>
                </p>
              </div>
              <div className="plan-head-actions">
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => setSurface("builder")}
                >
                  <IconAdjust />
                  Modify plan
                </button>
                <Link
                  className="button-ghost"
                  to={`/clients/${relationshipId}/history`}
                >
                  View plan history
                </Link>
              </div>
            </div>
          </section>

          <div className={coachNotes.length > 0 ? "plan-tab-grid has-notes" : "plan-tab-grid"}>
            <section className="plan-card" aria-labelledby="workout-protocol-heading">
              <div className="plan-protocol-head">
                <h3 id="workout-protocol-heading" className="plan-section-title">
                  Workout protocol
                  {workoutDays.length > 0
                    ? ` (${workoutDays.length}-day split)`
                    : ""}
                </h3>
              </div>
              {workoutDays.length === 0 ? (
                <p className="muted">No workout days on this version.</p>
              ) : (
                <ul className="plan-protocol-list">
                  {workoutDays.map((day) => (
                    <li key={day.id} className="plan-protocol-row">
                      <span className="plan-protocol-badge" aria-hidden="true">
                        {dayBadge(day)}
                      </span>
                      <div className="plan-day-copy">
                        <h4>{day.name}</h4>
                        {day.exercises.length > 0 ? (
                          <p className="muted">
                            {day.exercises
                              .slice(0, 3)
                              .map((exercise) => exercise.name)
                              .join(" · ")}
                            {day.exercises.length > 3
                              ? ` · +${day.exercises.length - 3}`
                              : ""}
                          </p>
                        ) : (
                          <p className="muted">No exercises on this day.</p>
                        )}
                      </div>
                      <span className="plan-day-count">
                        {day.exercises.length}{" "}
                        {day.exercises.length === 1 ? "exercise" : "exercises"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {meals.length > 0 ? (
                <div className="plan-meals">
                  <h3 className="plan-section-title">Nutrition protocol</h3>
                  <ul className="plan-protocol-list">
                    {meals.map((meal) => (
                      <li key={meal.id} className="plan-protocol-row">
                        <span
                          className="plan-protocol-badge plan-protocol-badge-meal"
                          aria-hidden="true"
                        >
                          {meal.order}
                        </span>
                        <div className="plan-day-copy">
                          <h4>{meal.name}</h4>
                          <p className="muted">
                            {meal.scheduleHint ?? "Meal prescription"}
                            {meal.photoRequired ? " · photo required" : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            {coachNotes.length > 0 ? (
              <aside className="plan-card" aria-labelledby="coach-notes-heading">
                <h3 id="coach-notes-heading" className="plan-section-title">
                  Coach instructions
                </h3>
                <p className="muted">Stored with this published version.</p>
                <ul className="plan-note-list">
                  {coachNotes.map((note) => (
                    <li key={`${note.title}:${note.body}`} className="plan-note">
                      <h4>{note.title}</h4>
                      <p>{note.body}</p>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </div>
        </div>
      ) : error && !version ? null : (
        <div className="plan-builder">
          <aside className="plan-card plan-split" aria-labelledby="split-heading">
            <p className="plan-kicker">Weekly split</p>
            <h2 id="split-heading">Program cadence</h2>
            {splitDays.length === 0 ? (
              <p className="muted">
                No days on a draft yet. Name the day in the editor, then publish.
              </p>
            ) : (
              <ul className="plan-split-list">
                {splitDays.map((day) => {
                  const selected = day.id === (selectedDay?.id ?? "");
                  return (
                    <li key={day.id}>
                      <button
                        type="button"
                        className={
                          selected ? "plan-split-day is-selected" : "plan-split-day"
                        }
                        onClick={() => selectDay(day)}
                      >
                        <span className="plan-split-label">
                          {dayBadge(day)} · {day.name}
                        </span>
                        <span className="muted">
                          {day.exercises.length} ex · {setCount(day)} sets
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <form
              className="plan-form plan-split-apply"
              onSubmit={(event) => void onApplyTemplate(event)}
            >
              <h3 className="plan-section-title">Apply a template</h3>
              <p className="muted">
                Copies into a draft.{" "}
                <Link to="/templates">Manage templates</Link>
              </p>
              {templates.length === 0 ? (
                <p className="muted">No templates yet.</p>
              ) : (
                <>
                  <label className="field">
                    <span>Template</span>
                    <select
                      value={selectedTemplateId}
                      onChange={(event) =>
                        setSelectedTemplateId(event.target.value)
                      }
                      required
                    >
                      {templates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} ({item.templateType})
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="button-secondary"
                    disabled={acting}
                  >
                    {acting ? "Applying…" : "Apply to draft"}
                  </button>
                </>
              )}
            </form>
          </aside>

          <section className="plan-card plan-composer" aria-labelledby="draft-change-heading">
            <header className="plan-composer-head">
              <div className="plan-composer-tags">
                {draftPreview ? (
                  <span className="plan-chip">Active draft</span>
                ) : version ? (
                  <span className="plan-chip">Adjustment</span>
                ) : (
                  <span className="plan-chip">New plan</span>
                )}
                {selectedDayMeta ? (
                  <span className="muted">
                    {selectedDayMeta.exercises} exercises · {selectedDayMeta.sets}{" "}
                    sets on this day
                  </span>
                ) : null}
              </div>
              <label className="field plan-title-field">
                <span className="sr-only">Title</span>
                <input
                  id="draft-change-heading"
                  className="plan-title-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                />
              </label>
              <p className="muted">
                {draftPreview
                  ? `Draft from ${draftPreview.creationSource}. Publish creates an immutable version.`
                  : version
                    ? "Creates a new draft from the effective version, then publishes it. Does not edit published content."
                    : "Creates a new immutable version. Does not edit published content."}
              </p>
            </header>

            <form
              className="plan-form"
              onSubmit={(event) => void onPublish(event)}
            >
              <label className="field">
                <span>Workout day</span>
                <input
                  value={dayName}
                  onChange={(event) => setDayName(event.target.value)}
                  required
                />
              </label>

              <article className="plan-exercise-card">
                <div className="plan-exercise-head">
                  <span className="plan-protocol-badge" aria-hidden="true">
                    1
                  </span>
                  <label className="field plan-exercise-name">
                    <span className="sr-only">Exercise</span>
                    <input
                      value={exerciseName}
                      onChange={(event) => setExerciseName(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <table className="plan-sets-table">
                  <thead>
                    <tr>
                      <th scope="col">Set</th>
                      <th scope="col">Load</th>
                      <th scope="col">Reps</th>
                      {snapshotRpe != null ? <th scope="col">RPE</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1</td>
                      <td>
                        <input
                          value={loadLabel}
                          onChange={(event) => setLoadLabel(event.target.value)}
                          aria-label="Load"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={reps}
                          onChange={(event) =>
                            setReps(Number(event.target.value))
                          }
                          required
                          aria-label="Reps"
                        />
                      </td>
                      {snapshotRpe != null ? (
                        <td>
                          <span className="plan-rpe">{snapshotRpe}</span>
                        </td>
                      ) : null}
                    </tr>
                  </tbody>
                </table>
                {selectedExercise?.instructions ? (
                  <p className="plan-cue">{selectedExercise.instructions}</p>
                ) : null}
              </article>

              <div className="plan-composer-actions">
                <button type="submit" className="button-primary" disabled={acting}>
                  {acting
                    ? "Publishing…"
                    : draftPreview
                      ? "Publish draft"
                      : version
                        ? "Publish adjustment"
                        : "Publish plan"}
                </button>
                {version ? (
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => setSurface("summary")}
                  >
                    Back to plan
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
