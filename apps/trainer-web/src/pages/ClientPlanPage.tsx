import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  EffectivePlanResponse,
  PlanTemplateSummary,
  PlanVersion,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function newId(): string {
  return crypto.randomUUID();
}

type WorkspaceOutlet = { refreshEpoch?: number };

export function ClientPlanPage() {
  const { relationshipId = "" } = useParams();
  const { refreshEpoch = 0 } = useOutletContext<WorkspaceOutlet>();
  const [effective, setEffective] = useState<EffectivePlanResponse | null>(
    null,
  );
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [draftPreview, setDraftPreview] = useState<PlanVersion | null>(null);
  const [title, setTitle] = useState("Training block");
  const [dayName, setDayName] = useState("Day A");
  const [exerciseName, setExerciseName] = useState("Squat");
  const [reps, setReps] = useState(5);
  const [loadLabel, setLoadLabel] = useState("RPE 7");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!relationshipId) return;
    setLoading(true);
    setError(null);
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
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load effective plan.",
      );
    } finally {
      setLoading(false);
    }
  }, [relationshipId]);

  useEffect(() => {
    void load();
  }, [load, refreshEpoch]);

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
              instructions: null,
              setTargets: [
                {
                  id: newId(),
                  order: 1,
                  reps,
                  loadLabel: loadLabel.trim() || null,
                  rpe: null,
                },
              ],
            },
          ],
        },
      ],
      mealPrescriptions: [] as never[],
    };
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
        setDayName(day.name);
        const exercise = day.exercises[0];
        if (exercise) {
          setExerciseName(exercise.name);
          const set = exercise.setTargets[0];
          if (set?.reps != null) setReps(set.reps);
          if (set?.loadLabel) setLoadLabel(set.loadLabel);
        }
      }
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

  const version: PlanVersion | null = effective?.version ?? null;

  return (
    <div className="workspace-page workspace-plan">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      <section className="workspace-card" aria-labelledby="effective-plan-heading">
        <div className="workspace-card-head">
          <div>
            <h2 id="effective-plan-heading" className="workspace-card-title">
              Effective plan
            </h2>
            <p className="lede">
              The published version this client is following.
            </p>
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading plan…</p>
        ) : version ? (
          <div className="stack-lg">
            <p className="muted">
              {effective?.plan?.title ? `${effective.plan.title} · ` : ""}
              Version {version.versionNumber} · effective{" "}
              {version.effectiveFrom ?? "now"}
            </p>
            <ul className="plan-day-list">
              {version.content.workoutDays.map((day) => (
                <li key={day.id} className="plan-day">
                  <h3>{day.name}</h3>
                  <ul>
                    {day.exercises.map((exercise) => (
                      <li key={exercise.id}>
                        <strong>{exercise.name}</strong>
                        {exercise.setTargets.length > 0 ? (
                          <span className="muted">
                            {" "}
                            · {exercise.setTargets.length} sets
                            {exercise.setTargets[0]?.reps != null
                              ? ` × ${exercise.setTargets[0].reps}`
                              : ""}
                            {exercise.setTargets[0]?.loadLabel
                              ? ` @ ${exercise.setTargets[0].loadLabel}`
                              : ""}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : error ? null : (
          <div className="empty-state">
            <h3>No effective plan</h3>
            <p>Reuse a template or publish a simple workout day to start.</p>
          </div>
        )}
      </section>

      <section className="workspace-card" aria-labelledby="draft-change-heading">
        <div className="workspace-card-head">
          <div>
            <h2 id="draft-change-heading" className="workspace-card-title">
              Draft a change
            </h2>
            <p className="lede">
              Reuse a template or publish a new version. Published versions stay
              unchanged.
            </p>
          </div>
        </div>
        <div className="workspace-draft">
      <form
        className="stack-lg form-panel"
        onSubmit={(event) => void onApplyTemplate(event)}
      >
        <h3>Reuse template</h3>
        <p className="muted">
          Copies template content into a draft for this client.{" "}
          <Link to="/templates">Manage templates</Link>
        </p>
        {templates.length === 0 ? (
          <p className="muted">No templates yet. Create one under Templates.</p>
        ) : (
          <>
            <label className="field">
              <span>Template</span>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                required
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} ({item.templateType})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="button-primary" disabled={acting}>
              {acting ? "Applying…" : "Apply template to draft"}
            </button>
          </>
        )}
      </form>

      <form
        className="stack-lg form-panel"
        onSubmit={(event) => void onPublish(event)}
      >
        <h3>
          {draftPreview
            ? "Customize and publish draft"
            : version
              ? "Publish adjustment"
              : "Publish first plan"}
        </h3>
        <p className="muted">
          {draftPreview
            ? `Draft from ${draftPreview.creationSource}. Publish creates an immutable version.`
            : version
              ? "Creates a new draft from the effective version, then publishes it. Does not edit published content."
              : "Creates a new immutable version. Does not edit published content."}
        </p>
        <label className="field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Workout day name</span>
          <input
            value={dayName}
            onChange={(event) => setDayName(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Exercise</span>
          <input
            value={exerciseName}
            onChange={(event) => setExerciseName(event.target.value)}
            required
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Reps</span>
            <input
              type="number"
              min={1}
              max={100}
              value={reps}
              onChange={(event) => setReps(Number(event.target.value))}
              required
            />
          </label>
          <label className="field">
            <span>Load label</span>
            <input
              value={loadLabel}
              onChange={(event) => setLoadLabel(event.target.value)}
            />
          </label>
        </div>
        <button type="submit" className="button-primary" disabled={acting}>
          {acting
            ? "Publishing…"
            : draftPreview
              ? "Publish draft"
              : version
                ? "Publish adjustment"
                : "Publish plan"}
        </button>
      </form>
        </div>
      </section>
    </div>
  );
}
