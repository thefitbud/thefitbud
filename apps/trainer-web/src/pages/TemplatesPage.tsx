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

function matchesName(name: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle);
}

function formatUpdated(value: string): string {
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
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [foodQuery, setFoodQuery] = useState("");
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

  const visibleExercises = exercises.filter((item) =>
    matchesName(item.name, exerciseQuery),
  );
  const visibleFoods = foods.filter((item) => matchesName(item.name, foodQuery));

  return (
    <section className="page templates-page">
      <header className="page-header">
        <div>
          <p className="section-kicker">Libraries</p>
          <h1>Templates & Libraries</h1>
          <p className="lede">
            Reusable workout structures, exercises, and foods.
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
        <>
          <dl className="templates-stats" aria-label="Loaded library counts">
            <div className="templates-stat">
              <span className="avatar" aria-hidden="true">
                T
              </span>
              <div>
                <dd>{templates.length}</dd>
                <dt>Templates</dt>
              </div>
            </div>
            <div className="templates-stat">
              <span className="avatar" aria-hidden="true">
                E
              </span>
              <div>
                <dd>{exercises.length}</dd>
                <dt>Exercises</dt>
              </div>
            </div>
            <div className="templates-stat">
              <span className="avatar" aria-hidden="true">
                F
              </span>
              <div>
                <dd>{foods.length}</dd>
                <dt>Foods</dt>
              </div>
            </div>
          </dl>

          <div className="templates-stack">
            <section className="templates-card" aria-labelledby="plan-templates-heading">
              <header className="templates-card-header">
                <span className="avatar" aria-hidden="true">
                  P
                </span>
                <div>
                  <p className="section-kicker">Templates</p>
                  <h2 id="plan-templates-heading">Plan templates</h2>
                  <p className="muted">
                    Save a workout structure, then copy it into a coaching-ready
                    client draft. Publish remains on the client Plan tab.
                  </p>
                </div>
              </header>

              <div className="templates-panels">
                <form
                  className="templates-panel templates-form"
                  onSubmit={(event) => void onCreateTemplate(event)}
                  aria-labelledby="create-template-heading"
                >
                  <div className="templates-panel-header">
                    <h3 id="create-template-heading">Create workout template</h3>
                    <p className="muted">
                      Focused reuse structure — not a full programming IDE.
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

                <section className="templates-panel" aria-labelledby="apply-template-heading">
                  <div className="templates-panel-header">
                    <h3 id="apply-template-heading">Apply to a client draft</h3>
                    <p className="muted">
                      Creates or updates a plan draft from a template copy.
                    </p>
                  </div>
                  {templates.length === 0 || relationships.length === 0 ? (
                    <p className="muted">
                      {templates.length === 0
                        ? "Create a template first."
                        : "No coaching-ready clients yet."}
                    </p>
                  ) : (
                    <form
                      className="templates-form"
                      onSubmit={(event) => void onApplyTemplate(event)}
                    >
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
                            className="button-secondary"
                            to={`/clients/${applyRelationshipId}/plan`}
                          >
                            Open Plan
                          </Link>
                        ) : null}
                      </div>
                    </form>
                  )}
                </section>
              </div>

              <div className="templates-table-scroll">
                <table className="templates-table" aria-labelledby="templates-list-heading">
                  <caption id="templates-list-heading" className="sr-only">
                    Your templates
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Title</th>
                      <th scope="col">Type</th>
                      <th scope="col">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templates.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="templates-empty">
                          No templates yet.
                        </td>
                      </tr>
                    ) : (
                      templates.map((item) => (
                        <tr key={item.id}>
                          <td className="templates-name">{item.title}</td>
                          <td>{item.templateType}</td>
                          <td>
                            <time dateTime={item.updatedAt}>
                              {formatUpdated(item.updatedAt)}
                            </time>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="templates-card" aria-labelledby="exercise-lib-heading">
              <header className="templates-card-header">
                <span className="avatar" aria-hidden="true">
                  E
                </span>
                <div>
                  <p className="section-kicker">Exercises</p>
                  <h2 id="exercise-lib-heading">Exercise library</h2>
                  <p className="muted">
                    Global curated items and your own. Names, ownership, and
                    default targets only.
                  </p>
                </div>
              </header>
              <label className="field templates-search" htmlFor="exercise-search">
                <span>Search exercises</span>
                <input
                  id="exercise-search"
                  type="search"
                  value={exerciseQuery}
                  onChange={(event) => setExerciseQuery(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="templates-table-scroll">
                <table className="templates-table" aria-label="Exercise library">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Ownership</th>
                      <th scope="col">Reps</th>
                      <th scope="col">Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exercises.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="templates-empty">
                          No exercises yet.
                        </td>
                      </tr>
                    ) : visibleExercises.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="templates-empty" role="status">
                          No exercises match that search.
                        </td>
                      </tr>
                    ) : (
                      visibleExercises.map((item) => (
                        <tr key={item.id}>
                          <td className="templates-name">{item.name}</td>
                          <td>{item.ownership}</td>
                          <td>{item.defaultReps != null ? item.defaultReps : "—"}</td>
                          <td>{item.defaultLoadLabel ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="templates-card" aria-labelledby="food-lib-heading">
              <header className="templates-card-header">
                <span className="avatar" aria-hidden="true">
                  F
                </span>
                <div>
                  <p className="section-kicker">Foods</p>
                  <h2 id="food-lib-heading">Food library</h2>
                  <p className="muted">
                    Household-portion copy-sources for meal prescriptions in drafts.
                  </p>
                </div>
              </header>
              <label className="field templates-search" htmlFor="food-search">
                <span>Search foods</span>
                <input
                  id="food-search"
                  type="search"
                  value={foodQuery}
                  onChange={(event) => setFoodQuery(event.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="templates-table-scroll">
                <table className="templates-table" aria-label="Food library">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Portion</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foods.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="templates-empty">
                          No foods yet.
                        </td>
                      </tr>
                    ) : visibleFoods.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="templates-empty" role="status">
                          No foods match that search.
                        </td>
                      </tr>
                    ) : (
                      visibleFoods.map((item) => (
                        <tr key={item.id}>
                          <td className="templates-name">{item.name}</td>
                          <td>{item.portionLabel}</td>
                          <td>{item.notes ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
