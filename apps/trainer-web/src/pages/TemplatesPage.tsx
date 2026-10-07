import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  ExerciseLibraryItem,
  FoodLibraryItem,
  PlanTemplateSummary,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { createIdempotencyKey } from "../lib/idempotency";

function newId(): string {
  return crypto.randomUUID();
}

export function TemplatesPage() {
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([]);
  const [foods, setFoods] = useState<FoodLibraryItem[]>([]);
  const [relationships, setRelationships] = useState<CoachingRelationship[]>(
    [],
  );
  const [title, setTitle] = useState("Reusable strength block");
  const [dayName, setDayName] = useState("Day A");
  const [exerciseName, setExerciseName] = useState("Goblet squat");
  const [reps, setReps] = useState(8);
  const [loadLabel, setLoadLabel] = useState("Moderate");
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const [applyRelationshipId, setApplyRelationshipId] = useState("");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [templatePage, exercisePage, foodPage, relationshipPage] =
        await Promise.all([
          apiClient.listPlanTemplates(),
          apiClient.listExerciseLibrary(),
          apiClient.listFoodLibrary(),
          apiClient.listRelationships(),
        ]);
      setTemplates(templatePage.items);
      setExercises(exercisePage.items);
      setFoods(foodPage.items);
      const ready = relationshipPage.items.filter(
        (item) => item.status === "coaching_ready",
      );
      setRelationships(ready);
      setApplyTemplateId((current) => current || templatePage.items[0]?.id || "");
      setApplyRelationshipId((current) => current || ready[0]?.id || "");
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not load templates and libraries.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateTemplate(event: FormEvent) {
    event.preventDefault();
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.createPlanTemplate(
        {
          title: title.trim(),
          templateType: "workout",
          content: {
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
            mealPrescriptions: [],
          },
        },
        createIdempotencyKey(),
      );
      setMessage("Template saved. Apply it to a client to create a draft.");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not create template.",
      );
    } finally {
      setActing(false);
    }
  }

  async function onApplyTemplate(event: FormEvent) {
    event.preventDefault();
    if (!applyTemplateId || !applyRelationshipId) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      const result = await apiClient.applyPlanTemplate(
        applyRelationshipId,
        { templateId: applyTemplateId },
        createIdempotencyKey(),
      );
      setMessage(
        result.updatedExistingDraft
          ? `Updated draft v${result.version.versionNumber} from template (copied, not linked).`
          : `Created draft v${result.version.versionNumber} from template (copied, not linked).`,
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

  function useExercise(item: ExerciseLibraryItem) {
    setExerciseName(item.name);
    if (item.defaultReps != null) setReps(item.defaultReps);
    if (item.defaultLoadLabel) setLoadLabel(item.defaultLoadLabel);
    setMessage(`Copied “${item.name}” into the template draft form.`);
  }

  function useFood(item: FoodLibraryItem) {
    setMessage(
      `Food copy-source “${item.name}” (${item.portionLabel}) — use when editing meal prescriptions in a plan draft.`,
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Templates</h1>
          <p className="lede">
            Reusable coaching structures and libraries. Applying a template
            copies content into a client draft — it never aliases live plans.
          </p>
        </div>
      </header>

      {error ? (
        <p className="form-error" role="alert">
          {error}{" "}
          <button type="button" className="button-link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : null}
      {message ? <p className="form-success">{message}</p> : null}

      {loading ? (
        <p className="muted" aria-busy="true">
          Loading templates…
        </p>
      ) : (
        <div className="stack-lg">
          <section className="form-panel stack-lg" aria-labelledby="reuse-heading">
            <div>
              <h2 id="reuse-heading">Reuse into a client draft</h2>
              <p className="muted">
                Creates or updates a plan draft from a template copy. Publish
                remains on the client Plan tab.
              </p>
            </div>
            {templates.length === 0 || relationships.length === 0 ? (
              <p className="muted">
                {templates.length === 0
                  ? "Create a template below first."
                  : "No coaching-ready clients yet."}
              </p>
            ) : (
              <form className="stack-lg" onSubmit={(event) => void onApplyTemplate(event)}>
                <label className="field">
                  <span>Template</span>
                  <select
                    value={applyTemplateId}
                    onChange={(event) => setApplyTemplateId(event.target.value)}
                    required
                  >
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} ({item.templateType})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Client</span>
                  <select
                    value={applyRelationshipId}
                    onChange={(event) =>
                      setApplyRelationshipId(event.target.value)
                    }
                    required
                  >
                    {relationships.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.id.slice(0, 8)}… · {item.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row">
                  <button
                    type="submit"
                    className="button-primary"
                    disabled={acting}
                  >
                    {acting ? "Applying…" : "Apply to draft"}
                  </button>
                  {applyRelationshipId ? (
                    <Link
                      className="button-ghost"
                      to={`/clients/${applyRelationshipId}/plan`}
                    >
                      Open Plan
                    </Link>
                  ) : null}
                </div>
              </form>
            )}
          </section>

          <section aria-labelledby="templates-list-heading">
            <h2 id="templates-list-heading">Your templates</h2>
            {templates.length === 0 ? (
              <p className="muted">No templates yet.</p>
            ) : (
              <ul className="client-list">
                {templates.map((item) => (
                  <li key={item.id} className="client-row">
                    <div className="client-row-main">
                      <div>
                        <strong>{item.title}</strong>
                        <p className="muted">
                          {item.templateType} · v{item.recordVersion}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <form
            className="form-panel stack-lg"
            onSubmit={(event) => void onCreateTemplate(event)}
            aria-labelledby="create-template-heading"
          >
            <div>
              <h2 id="create-template-heading">Create workout template</h2>
              <p className="muted">
                Focused reuse structure — not a full programming IDE. Copy
                exercises from the library below.
              </p>
            </div>
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
              {acting ? "Saving…" : "Save template"}
            </button>
          </form>

          <section aria-labelledby="exercise-lib-heading">
            <h2 id="exercise-lib-heading">Exercise library</h2>
            <p className="muted">
              Global curated and your own items. Copy into the template form —
              no live link to client plans.
            </p>
            <ul className="library-list">
              {exercises.map((item) => (
                <li key={item.id} className="library-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">
                      {item.ownership}
                      {item.defaultReps != null ? ` · ${item.defaultReps} reps` : ""}
                      {item.defaultLoadLabel
                        ? ` · ${item.defaultLoadLabel}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => useExercise(item)}
                  >
                    Use in form
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="food-lib-heading">
            <h2 id="food-lib-heading">Indian food library</h2>
            <p className="muted">
              Household-portion copy-sources for meal prescriptions in drafts.
            </p>
            <ul className="library-list">
              {foods.map((item) => (
                <li key={item.id} className="library-row">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="muted">
                      {item.portionLabel}
                      {item.notes ? ` · ${item.notes}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => useFood(item)}
                  >
                    Note for draft
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </section>
  );
}
