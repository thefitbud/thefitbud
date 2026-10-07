import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "@fitbud/api-client";
import type {
  CoachingRelationship,
  ExerciseLibraryItem,
  FoodLibraryItem,
  Invitation,
  PlanTemplateSummary,
  PlanTemplateType,
} from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import { buildClientDirectoryRows } from "../lib/clients";
import { createIdempotencyKey } from "../lib/idempotency";

type LibrarySurface = "templates" | "libraries";
type TemplateTypeFilter = "all" | PlanTemplateType;

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

function templateTypeLabel(type: PlanTemplateType): string {
  switch (type) {
    case "workout":
      return "Workout";
    case "nutrition":
      return "Nutrition";
    case "combined":
      return "Combined";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function iconProps() {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    focusable: false as const,
  };
}

function IconPlus() {
  return (
    <svg {...iconProps()}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconTemplate() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconExercise() {
  return (
    <svg {...iconProps()}>
      <path d="M7 8h10" />
      <path d="M7 16h10" />
      <rect x="3" y="6" width="4" height="12" rx="1.5" />
      <rect x="17" y="6" width="4" height="12" rx="1.5" />
    </svg>
  );
}

function IconFood() {
  return (
    <svg {...iconProps()}>
      <path d="M8 3v10" />
      <path d="M6 5c0 2 2 3 2 5" />
      <path d="M10 5c0 2-2 3-2 5" />
      <path d="M16 4v7a2 2 0 0 1-2 2h0V4" />
      <path d="M8 13v8" />
      <path d="M16 13v8" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg {...iconProps()}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconAssign() {
  return (
    <svg {...iconProps()} width={14} height={14}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function TemplatesPage() {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const applyClientRef = useRef<HTMLSelectElement>(null);
  const [templates, setTemplates] = useState<PlanTemplateSummary[]>([]);
  const [exercises, setExercises] = useState<ExerciseLibraryItem[]>([]);
  const [foods, setFoods] = useState<FoodLibraryItem[]>([]);
  const [relationships, setRelationships] = useState<CoachingRelationship[]>(
    [],
  );
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [title, setTitle] = useState("Reusable strength block");
  const [dayName, setDayName] = useState("Day A");
  const [exerciseName, setExerciseName] = useState("Goblet squat");
  const [reps, setReps] = useState(8);
  const [loadLabel, setLoadLabel] = useState("Moderate");
  const [applyTemplateId, setApplyTemplateId] = useState("");
  const [applyRelationshipId, setApplyRelationshipId] = useState("");
  const [surface, setSurface] = useState<LibrarySurface>("templates");
  const [typeFilter, setTypeFilter] = useState<TemplateTypeFilter>("all");
  const [templateQuery, setTemplateQuery] = useState("");
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
      const [templatePage, exercisePage, foodPage, relationshipPage, invitationOutcome] =
        await Promise.all([
          apiClient.listPlanTemplates(),
          apiClient.listExerciseLibrary(),
          apiClient.listFoodLibrary(),
          apiClient.listRelationships(),
          apiClient.listInvitations().then(
            (value) => ({ ok: true as const, value }),
            () => ({ ok: false as const }),
          ),
        ]);
      setTemplates(templatePage.items);
      setExercises(exercisePage.items);
      setFoods(foodPage.items);
      setInvitations(invitationOutcome.ok ? invitationOutcome.value.items : []);
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

  const clientNames = useMemo(() => {
    const rows = buildClientDirectoryRows({
      invitations,
      relationships,
    });
    const names = new Map<string, string>();
    for (const row of rows) {
      if (row.relationshipId) {
        names.set(row.relationshipId, row.name);
      }
    }
    return names;
  }, [invitations, relationships]);

  const presentTypes = useMemo(() => {
    const seen = new Set<PlanTemplateType>();
    for (const item of templates) {
      seen.add(item.templateType);
    }
    const order: PlanTemplateType[] = ["workout", "nutrition", "combined"];
    return order.filter((type) => seen.has(type));
  }, [templates]);

  const visibleTemplates = useMemo(() => {
    return templates.filter((item) => {
      if (typeFilter !== "all" && item.templateType !== typeFilter) {
        return false;
      }
      return matchesName(item.title, templateQuery);
    });
  }, [templates, typeFilter, templateQuery]);

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
      setSurface("templates");
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

  function focusCreate() {
    setSurface("templates");
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  }

  function selectTemplate(id: string) {
    setApplyTemplateId(id);
    window.requestAnimationFrame(() => {
      applyClientRef.current?.focus();
      applyClientRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  const visibleExercises = exercises.filter((item) =>
    matchesName(item.name, exerciseQuery),
  );
  const visibleFoods = foods.filter((item) => matchesName(item.name, foodQuery));
  const libraryCount = exercises.length + foods.length;
  const kpiValue = (value: number) => (loading ? "—" : value);

  return (
    <section className="page templates-page">
      <header className="page-header templates-hero">
        <div>
          <h1>Templates & Libraries</h1>
          <p className="lede">
            Reusable workout structures, exercises, and foods you can copy into
            a client draft.
          </p>
        </div>
        <div className="templates-hero-actions">
          <div
            className="templates-switch"
            role="group"
            aria-label="Templates or libraries"
          >
            <button
              type="button"
              className={surface === "templates" ? "segment-btn is-on" : "segment-btn"}
              aria-pressed={surface === "templates"}
              onClick={() => setSurface("templates")}
            >
              Templates
              <span className="segment-count">{loading ? "—" : templates.length}</span>
            </button>
            <button
              type="button"
              className={surface === "libraries" ? "segment-btn is-on" : "segment-btn"}
              aria-pressed={surface === "libraries"}
              onClick={() => setSurface("libraries")}
            >
              Libraries
              <span className="segment-count">{loading ? "—" : libraryCount}</span>
            </button>
          </div>
          <button type="button" className="button-primary" onClick={focusCreate}>
            <IconPlus />
            Create template
          </button>
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

      <dl className="templates-stats" aria-label="Loaded library counts">
        <div className="templates-stat">
          <div>
            <dt>Templates</dt>
            <dd>{kpiValue(templates.length)}</dd>
          </div>
          <span className="templates-stat-icon" aria-hidden="true">
            <IconTemplate />
          </span>
        </div>
        <div className="templates-stat">
          <div>
            <dt>Exercises</dt>
            <dd>{kpiValue(exercises.length)}</dd>
          </div>
          <span className="templates-stat-icon" aria-hidden="true">
            <IconExercise />
          </span>
        </div>
        <div className="templates-stat">
          <div>
            <dt>Foods</dt>
            <dd>{kpiValue(foods.length)}</dd>
          </div>
          <span className="templates-stat-icon" aria-hidden="true">
            <IconFood />
          </span>
        </div>
        <div className="templates-stat">
          <div>
            <dt>Ready clients</dt>
            <dd>{kpiValue(relationships.length)}</dd>
          </div>
          <span className="templates-stat-icon" aria-hidden="true">
            <IconAssign />
          </span>
        </div>
      </dl>

      {loading ? (
        <p className="muted" aria-busy="true">
          Loading templates…
        </p>
      ) : surface === "templates" ? (
        <div className="templates-stack">
          <div className="templates-toolbar">
            <div className="segment" role="group" aria-label="Filter by template type">
              <button
                type="button"
                className={typeFilter === "all" ? "segment-btn is-on" : "segment-btn"}
                aria-pressed={typeFilter === "all"}
                onClick={() => setTypeFilter("all")}
              >
                All templates
                <span className="segment-count">{templates.length}</span>
              </button>
              {presentTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={
                    typeFilter === type ? "segment-btn is-on" : "segment-btn"
                  }
                  aria-pressed={typeFilter === type}
                  onClick={() => setTypeFilter(type)}
                >
                  {templateTypeLabel(type)}
                  <span className="segment-count">
                    {templates.filter((item) => item.templateType === type).length}
                  </span>
                </button>
              ))}
            </div>
            <label className="templates-filter-search">
              <span className="sr-only">Filter templates by title</span>
              <IconSearch />
              <input
                type="search"
                value={templateQuery}
                onChange={(event) => setTemplateQuery(event.target.value)}
                placeholder="Filter by title"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="templates-panels">
            <form
              className="templates-panel templates-form"
              onSubmit={(event) => void onCreateTemplate(event)}
              aria-labelledby="create-template-heading"
            >
              <div className="templates-panel-header">
                <h2 id="create-template-heading">Create workout template</h2>
                <p className="muted">
                  Save a reusable workout day, then copy it into a coaching-ready
                  client draft.
                </p>
              </div>
              <label className="field">
                <span>Title</span>
                <input
                  ref={titleInputRef}
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

            <section
              className="templates-panel"
              aria-labelledby="apply-template-heading"
            >
              <div className="templates-panel-header">
                <h2 id="apply-template-heading">Apply to a client draft</h2>
                <p className="muted">
                  Copies template content into a draft. Publish remains on the
                  client Plan tab.
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
                          {item.title} ({templateTypeLabel(item.templateType)})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Client</span>
                    <select
                      ref={applyClientRef}
                      value={applyRelationshipId}
                      onChange={(event) =>
                        setApplyRelationshipId(event.target.value)
                      }
                      required
                    >
                      {relationships.map((item) => (
                        <option key={item.id} value={item.id}>
                          {clientNames.get(item.id) ??
                            `Client ${item.id.slice(0, 8)}`}
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

          {visibleTemplates.length === 0 ? (
            <div className="empty-state" role="status">
              <h2>No matching templates</h2>
              <p>
                {templates.length === 0
                  ? "Save a workout template to reuse it across clients."
                  : "No loaded templates match this search or type."}
              </p>
            </div>
          ) : (
            <ul className="templates-grid">
              {visibleTemplates.map((item) => {
                const selected = item.id === applyTemplateId;
                return (
                  <li key={item.id}>
                    <article
                      className={
                        selected
                          ? "templates-item is-selected"
                          : "templates-item"
                      }
                    >
                      <header className="templates-item-top">
                        <span
                          className={`templates-type templates-type-${item.templateType}`}
                        >
                          {templateTypeLabel(item.templateType)}
                        </span>
                        <time dateTime={item.updatedAt}>
                          Updated {formatUpdated(item.updatedAt)}
                        </time>
                      </header>
                      <h3>{item.title}</h3>
                      <p className="muted">
                        Copied into a client draft when applied. Not linked live.
                      </p>
                      <div className="templates-item-actions">
                        <button
                          type="button"
                          className="button-primary"
                          disabled={
                            acting ||
                            !applyRelationshipId ||
                            relationships.length === 0
                          }
                          onClick={() => selectTemplate(item.id)}
                        >
                          <IconAssign />
                          Assign to client
                        </button>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="templates-library-grid">
          <section className="templates-card" aria-labelledby="exercise-lib-heading">
            <header className="templates-card-header">
              <span className="templates-stat-icon" aria-hidden="true">
                <IconExercise />
              </span>
              <div>
                <h2 id="exercise-lib-heading">Exercise library</h2>
                <p className="muted">
                  Global curated items and your own. Names, ownership, and
                  default targets only.
                </p>
              </div>
              <span className="templates-count-chip">{exercises.length}</span>
            </header>
            <label className="templates-filter-search templates-search" htmlFor="exercise-search">
              <span className="sr-only">Search exercises</span>
              <IconSearch />
              <input
                id="exercise-search"
                type="search"
                value={exerciseQuery}
                onChange={(event) => setExerciseQuery(event.target.value)}
                placeholder="Search exercises"
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
              <span className="templates-stat-icon" aria-hidden="true">
                <IconFood />
              </span>
              <div>
                <h2 id="food-lib-heading">Food library</h2>
                <p className="muted">
                  Household-portion copy-sources for meal prescriptions in drafts.
                </p>
              </div>
              <span className="templates-count-chip">{foods.length}</span>
            </header>
            <label className="templates-filter-search templates-search" htmlFor="food-search">
              <span className="sr-only">Search foods</span>
              <IconSearch />
              <input
                id="food-search"
                type="search"
                value={foodQuery}
                onChange={(event) => setFoodQuery(event.target.value)}
                placeholder="Search foods"
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
      )}
    </section>
  );
}
