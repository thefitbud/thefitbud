import { useState, type FormEvent } from "react";
import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
  FoodLibraryItem,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { errorText } from "./shared";
import { useCursorPage, useDebounced } from "./useCursorPage";

const DIFFICULTIES: ExerciseDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

function difficultyLabel(value: ExerciseDifficulty): string {
  switch (value) {
    case "beginner":
      return "Beginner";
    case "intermediate":
      return "Intermediate";
    case "advanced":
      return "Advanced";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function ownershipLabel(ownership: "global" | "trainer"): string {
  return ownership === "global" ? "Global" : "Yours";
}

function LabelEntry({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const next = draft.trim();
    if (!next || next.length > 80 || values.length >= 12) return;
    if (values.some((value) => value.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }

  return (
    <fieldset className="templates-options">
      <legend>{label}</legend>
      {values.length === 0 ? <p className="muted">None yet.</p> : null}
      <ul className="templates-label-list">
        {values.map((value) => (
          <li key={value}>
            <span>{value}</span>
            <button
              type="button"
              className="button-ghost"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="templates-option-row">
        <label className="field">
          <span className="sr-only">Add {label.toLowerCase()}</span>
          <input
            value={draft}
            maxLength={80}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button
          type="button"
          className="button-secondary"
          disabled={values.length >= 12 || draft.trim() === ""}
          onClick={add}
        >
          Add
        </button>
      </div>
    </fieldset>
  );
}

type ExerciseForm = {
  id: string | null;
  name: string;
  instructions: string;
  defaultLoadLabel: string;
  defaultReps: string;
  muscleGroups: string[];
  equipment: string[];
  difficulty: ExerciseDifficulty | "";
};

function emptyExerciseForm(): ExerciseForm {
  return {
    id: null,
    name: "",
    instructions: "",
    defaultLoadLabel: "",
    defaultReps: "",
    muscleGroups: [],
    equipment: [],
    difficulty: "",
  };
}

function exerciseFormFrom(item: ExerciseLibraryItem): ExerciseForm {
  return {
    id: item.id,
    name: item.name,
    instructions: item.instructions ?? "",
    defaultLoadLabel: item.defaultLoadLabel ?? "",
    defaultReps: item.defaultReps != null ? String(item.defaultReps) : "",
    muscleGroups: [...item.muscleGroups],
    equipment: [...item.equipment],
    difficulty: item.difficulty ?? "",
  };
}

type FoodForm = {
  id: string | null;
  name: string;
  portionLabel: string;
  calories: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  description: string;
  notes: string;
};

function emptyFoodForm(): FoodForm {
  return {
    id: null,
    name: "",
    portionLabel: "",
    calories: "",
    proteinGrams: "",
    carbsGrams: "",
    fatGrams: "",
    description: "",
    notes: "",
  };
}

function foodFormFrom(item: FoodLibraryItem): FoodForm {
  return {
    id: item.id,
    name: item.name,
    portionLabel: item.portionLabel,
    calories: item.calories != null ? String(item.calories) : "",
    proteinGrams: item.proteinGrams != null ? String(item.proteinGrams) : "",
    carbsGrams: item.carbsGrams != null ? String(item.carbsGrams) : "",
    fatGrams: item.fatGrams != null ? String(item.fatGrams) : "",
    description: item.description ?? "",
    notes: item.notes ?? "",
  };
}

function optionalInt(value: string, label: string, max: number): number | null | string {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    return `${label} must be a whole number from 0 to ${max}.`;
  }
  return parsed;
}

function optionalGrams(value: string, label: string): number | null | string {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2000) {
    return `${label} must be from 0 to 2000.`;
  }
  return parsed;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function LibrariesPanel() {
  return (
    <div className="templates-library-grid">
      <ExerciseLibrary />
      <FoodLibrary />
    </div>
  );
}

function ExerciseLibrary() {
  const [q, setQ] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty | "">("");
  const nameQuery = useDebounced(q);
  const muscleQuery = useDebounced(muscleGroup);
  const equipmentQuery = useDebounced(equipment);
  const queryKey = JSON.stringify({
    q: nameQuery.trim(),
    muscleGroup: muscleQuery.trim(),
    equipment: equipmentQuery.trim(),
    difficulty,
  });
  const page = useCursorPage(queryKey, (cursor) =>
    apiClient.listExerciseLibrary({
      cursor,
      limit: 50,
      q: nameQuery.trim() || undefined,
      muscleGroup: muscleQuery.trim() || undefined,
      equipment: equipmentQuery.trim() || undefined,
      difficulty: difficulty || undefined,
    }),
  );
  const [form, setForm] = useState<ExerciseForm | null>(null);
  const [readOnly, setReadOnly] = useState<ExerciseLibraryItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function select(item: ExerciseLibraryItem) {
    setError(null);
    setMessage(null);
    setPendingDelete(false);
    if (item.ownership === "global") {
      setReadOnly(item);
      setForm(null);
      return;
    }
    setReadOnly(null);
    setForm(exerciseFormFrom(item));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const reps = optionalInt(form.defaultReps, "Default reps", 100);
    if (typeof reps === "string") {
      setError(reps === "Default reps must be a whole number from 0 to 100."
        ? "Default reps must be a whole number from 1 to 100, or blank."
        : reps);
      return;
    }
    if (reps === 0) {
      setError("Default reps must be a whole number from 1 to 100, or blank.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    const body = {
      name: form.name.trim(),
      instructions: nullableText(form.instructions),
      defaultLoadLabel: nullableText(form.defaultLoadLabel),
      defaultReps: reps,
      muscleGroups: form.muscleGroups,
      equipment: form.equipment,
      difficulty: form.difficulty === "" ? null : form.difficulty,
    };
    try {
      if (form.id) {
        await apiClient.updateExerciseLibraryItem(form.id, body);
        setMessage("Exercise updated. Templates that already copied it stay unchanged.");
      } else {
        await apiClient.createExerciseLibraryItem(body);
        setMessage("Exercise added to your library.");
        setForm(emptyExerciseForm());
      }
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not save this exercise."));
    } finally {
      setActing(false);
    }
  }

  async function onDelete() {
    if (!form?.id) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.deleteExerciseLibraryItem(form.id);
      setForm(null);
      setPendingDelete(false);
      setMessage("Exercise deleted.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not delete this exercise."));
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="templates-card" aria-labelledby="exercise-lib-heading">
      <header className="templates-card-header">
        <div>
          <h2 id="exercise-lib-heading">Exercise library</h2>
          <p className="muted">
            Global rows are read-only. Create, update, and delete apply to
            exercises you own.
          </p>
        </div>
      </header>
      <div className="templates-library-filters">
        <label className="field">
          <span>Name</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Muscle group</span>
          <input
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
            placeholder="Exact match"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Equipment</span>
          <input
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
            placeholder="Exact match"
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span>Difficulty</span>
          <select
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as ExerciseDifficulty | "")
            }
          >
            <option value="">Any difficulty</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {difficultyLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}{" "}
          <button type="button" className="button-link" onClick={page.reload}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="templates-table-scroll">
        <table className="templates-table" aria-label="Exercise library">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Ownership</th>
              <th scope="col">Difficulty</th>
              <th scope="col">Defaults</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.loading ? (
              <tr>
                <td colSpan={5} className="templates-empty">
                  Loading exercises…
                </td>
              </tr>
            ) : page.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="templates-empty" role="status">
                  No exercises match these filters.
                </td>
              </tr>
            ) : (
              page.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="templates-name">{item.name}</span>
                    <span className="muted templates-sub">
                      {item.muscleGroups.length > 0
                        ? item.muscleGroups.join(", ")
                        : "No muscle groups"}
                      {item.equipment.length > 0
                        ? ` · ${item.equipment.join(", ")}`
                        : ""}
                    </span>
                  </td>
                  <td>{ownershipLabel(item.ownership)}</td>
                  <td>{item.difficulty ? difficultyLabel(item.difficulty) : "—"}</td>
                  <td>
                    {item.defaultReps != null ? `${item.defaultReps} reps` : "—"}
                    {item.defaultLoadLabel ? ` · ${item.defaultLoadLabel}` : ""}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => select(item)}
                    >
                      {item.ownership === "global" ? "View" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {page.nextCursor ? (
        <button
          type="button"
          className="button-ghost templates-more"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more exercises"}
        </button>
      ) : null}
      <div className="templates-library-editor">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="form-success">{message}</p> : null}
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setReadOnly(null);
            setForm(emptyExerciseForm());
            setPendingDelete(false);
            setError(null);
          }}
        >
          New exercise
        </button>
        {readOnly ? (
          <ExerciseReadOnly item={readOnly} />
        ) : form ? (
          <form className="templates-form" onSubmit={(event) => void onSubmit(event)}>
            <h3>{form.id ? "Edit exercise" : "New exercise"}</h3>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                maxLength={120}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                required
              />
            </label>
            <LabelEntry
              label="Muscle groups"
              values={form.muscleGroups}
              onChange={(muscleGroups) => setForm({ ...form, muscleGroups })}
            />
            <LabelEntry
              label="Equipment"
              values={form.equipment}
              onChange={(equipmentLabels) =>
                setForm({ ...form, equipment: equipmentLabels })
              }
            />
            <label className="field">
              <span>Difficulty</span>
              <select
                value={form.difficulty}
                onChange={(event) =>
                  setForm({
                    ...form,
                    difficulty: event.target.value as ExerciseDifficulty | "",
                  })
                }
              >
                <option value="">Not set</option>
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {difficultyLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Instructions</span>
              <textarea
                value={form.instructions}
                maxLength={2000}
                rows={3}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Default reps</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.defaultReps}
                  onChange={(event) =>
                    setForm({ ...form, defaultReps: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Default load</span>
                <input
                  value={form.defaultLoadLabel}
                  maxLength={80}
                  onChange={(event) =>
                    setForm({ ...form, defaultLoadLabel: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="field-row">
              <button type="submit" className="button-primary" disabled={acting}>
                {acting ? "Saving…" : form.id ? "Update exercise" : "Create exercise"}
              </button>
              {form.id ? (
                pendingDelete ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={acting}
                    onClick={() => {
                      void onDelete();
                    }}
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPendingDelete(true)}
                  >
                    Delete
                  </button>
                )
              ) : null}
            </div>
          </form>
        ) : (
          <p className="muted">Select an exercise, or create one you own.</p>
        )}
      </div>
    </section>
  );
}

function ExerciseReadOnly({ item }: { item: ExerciseLibraryItem }) {
  return (
    <div className="templates-readonly">
      <h3>{item.name}</h3>
      <p className="muted">Global exercise. Read-only.</p>
      <dl className="templates-facts">
        <div>
          <dt>Muscle groups</dt>
          <dd>{item.muscleGroups.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Equipment</dt>
          <dd>{item.equipment.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{item.difficulty ? difficultyLabel(item.difficulty) : "—"}</dd>
        </div>
        <div>
          <dt>Default reps</dt>
          <dd>{item.defaultReps ?? "—"}</dd>
        </div>
        <div>
          <dt>Default load</dt>
          <dd>{item.defaultLoadLabel ?? "—"}</dd>
        </div>
        <div>
          <dt>Instructions</dt>
          <dd>{item.instructions ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}

function FoodLibrary() {
  const [q, setQ] = useState("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(nameQuery.trim(), (cursor) =>
    apiClient.listFoodLibrary({
      cursor,
      limit: 50,
      q: nameQuery.trim() || undefined,
    }),
  );
  const [form, setForm] = useState<FoodForm | null>(null);
  const [readOnly, setReadOnly] = useState<FoodLibraryItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function select(item: FoodLibraryItem) {
    setError(null);
    setMessage(null);
    setPendingDelete(false);
    if (item.ownership === "global") {
      setReadOnly(item);
      setForm(null);
      return;
    }
    setReadOnly(null);
    setForm(foodFormFrom(item));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const calories = optionalInt(form.calories, "Calories", 20000);
    const proteinGrams = optionalGrams(form.proteinGrams, "Protein");
    const carbsGrams = optionalGrams(form.carbsGrams, "Carbs");
    const fatGrams = optionalGrams(form.fatGrams, "Fat");
    if (
      typeof calories === "string" ||
      typeof proteinGrams === "string" ||
      typeof carbsGrams === "string" ||
      typeof fatGrams === "string"
    ) {
      const problem = [calories, proteinGrams, carbsGrams, fatGrams].find(
        (value): value is string => typeof value === "string",
      );
      setError(problem ?? "Check the nutrition numbers.");
      return;
    }
    setActing(true);
    setError(null);
    setMessage(null);
    const body = {
      name: form.name.trim(),
      portionLabel: form.portionLabel.trim(),
      calories,
      proteinGrams,
      carbsGrams,
      fatGrams,
      description: nullableText(form.description),
      notes: nullableText(form.notes),
    };
    try {
      if (form.id) {
        await apiClient.updateFoodLibraryItem(form.id, body);
        setMessage("Food updated. Meal snapshots that already copied it stay unchanged.");
      } else {
        await apiClient.createFoodLibraryItem(body);
        setMessage("Food added to your library.");
        setForm(emptyFoodForm());
      }
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not save this food."));
    } finally {
      setActing(false);
    }
  }

  async function onDelete() {
    if (!form?.id) return;
    setActing(true);
    setError(null);
    setMessage(null);
    try {
      await apiClient.deleteFoodLibraryItem(form.id);
      setForm(null);
      setPendingDelete(false);
      setMessage("Food deleted.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not delete this food."));
    } finally {
      setActing(false);
    }
  }

  return (
    <section className="templates-card" aria-labelledby="food-lib-heading">
      <header className="templates-card-header">
        <div>
          <h2 id="food-lib-heading">Food library</h2>
          <p className="muted">
            Global rows are read-only. Foods store a name, portion, calories,
            protein, carbs, fat, description, and notes.
          </p>
        </div>
      </header>
      <div className="templates-library-filters">
        <label className="field">
          <span>Name</span>
          <input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search foods"
            autoComplete="off"
          />
        </label>
      </div>
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}{" "}
          <button type="button" className="button-link" onClick={page.reload}>
            Retry
          </button>
        </p>
      ) : null}
      <div className="templates-table-scroll">
        <table className="templates-table" aria-label="Food library">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Portion</th>
              <th scope="col">Calories</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {page.loading ? (
              <tr>
                <td colSpan={4} className="templates-empty">
                  Loading foods…
                </td>
              </tr>
            ) : page.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="templates-empty" role="status">
                  No foods match that search.
                </td>
              </tr>
            ) : (
              page.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="templates-name">{item.name}</span>
                    <span className="muted templates-sub">
                      {ownershipLabel(item.ownership)}
                    </span>
                  </td>
                  <td>{item.portionLabel}</td>
                  <td>{item.calories != null ? item.calories : "—"}</td>
                  <td>
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => select(item)}
                    >
                      {item.ownership === "global" ? "View" : "Edit"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {page.nextCursor ? (
        <button
          type="button"
          className="button-ghost templates-more"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more foods"}
        </button>
      ) : null}
      <div className="templates-library-editor">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? <p className="form-success">{message}</p> : null}
        <button
          type="button"
          className="button-secondary"
          onClick={() => {
            setReadOnly(null);
            setForm(emptyFoodForm());
            setPendingDelete(false);
            setError(null);
          }}
        >
          New food
        </button>
        {readOnly ? (
          <FoodReadOnly item={readOnly} />
        ) : form ? (
          <form className="templates-form" onSubmit={(event) => void onSubmit(event)}>
            <h3>{form.id ? "Edit food" : "New food"}</h3>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                maxLength={120}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Portion</span>
              <input
                value={form.portionLabel}
                maxLength={120}
                onChange={(event) =>
                  setForm({ ...form, portionLabel: event.target.value })
                }
                required
              />
            </label>
            <div className="field-row">
              <label className="field">
                <span>Calories</span>
                <input
                  type="number"
                  min={0}
                  max={20000}
                  value={form.calories}
                  onChange={(event) =>
                    setForm({ ...form, calories: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Protein (g)</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step="0.1"
                  value={form.proteinGrams}
                  onChange={(event) =>
                    setForm({ ...form, proteinGrams: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Carbs (g)</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step="0.1"
                  value={form.carbsGrams}
                  onChange={(event) =>
                    setForm({ ...form, carbsGrams: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Fat (g)</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step="0.1"
                  value={form.fatGrams}
                  onChange={(event) =>
                    setForm({ ...form, fatGrams: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>Description</span>
              <textarea
                value={form.description}
                maxLength={2000}
                rows={2}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea
                value={form.notes}
                maxLength={2000}
                rows={2}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
            </label>
            <div className="field-row">
              <button type="submit" className="button-primary" disabled={acting}>
                {acting ? "Saving…" : form.id ? "Update food" : "Create food"}
              </button>
              {form.id ? (
                pendingDelete ? (
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={acting}
                    onClick={() => {
                      void onDelete();
                    }}
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPendingDelete(true)}
                  >
                    Delete
                  </button>
                )
              ) : null}
            </div>
          </form>
        ) : (
          <p className="muted">Select a food, or create one you own.</p>
        )}
      </div>
    </section>
  );
}

function FoodReadOnly({ item }: { item: FoodLibraryItem }) {
  return (
    <div className="templates-readonly">
      <h3>{item.name}</h3>
      <p className="muted">Global food. Read-only.</p>
      <dl className="templates-facts">
        <div>
          <dt>Portion</dt>
          <dd>{item.portionLabel}</dd>
        </div>
        <div>
          <dt>Calories</dt>
          <dd>{item.calories ?? "—"}</dd>
        </div>
        <div>
          <dt>Protein (g)</dt>
          <dd>{item.proteinGrams ?? "—"}</dd>
        </div>
        <div>
          <dt>Carbs (g)</dt>
          <dd>{item.carbsGrams ?? "—"}</dd>
        </div>
        <div>
          <dt>Fat (g)</dt>
          <dd>{item.fatGrams ?? "—"}</dd>
        </div>
        <div>
          <dt>Description</dt>
          <dd>{item.description ?? "—"}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>{item.notes ?? "—"}</dd>
        </div>
      </dl>
    </div>
  );
}
