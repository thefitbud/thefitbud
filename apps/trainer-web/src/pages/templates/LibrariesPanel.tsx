import { useState, type FormEvent } from "react";
import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
  FoodClassification,
  FoodLibraryItem,
  NutritionBasis,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE, scaleDecimal } from "@fitbud/contracts";
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
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  difficulty: ExerciseDifficulty | "";
};

function emptyExerciseForm(): ExerciseForm {
  return {
    id: null,
    name: "",
    instructions: "",
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    difficulty: "",
  };
}

function exerciseFormFrom(item: ExerciseLibraryItem): ExerciseForm {
  return {
    id: item.id,
    name: item.name,
    instructions: item.instructions ?? "",
    primaryMuscles: [...item.primaryMuscles],
    secondaryMuscles: [...item.secondaryMuscles],
    equipment: [...item.equipment],
    difficulty: item.difficulty ?? "",
  };
}

const FOOD_CLASSIFICATIONS: FoodClassification[] = [
  "raw_ingredient",
  "generic_food",
  "prepared_food",
  "branded_product",
];

function classificationLabel(value: FoodClassification): string {
  switch (value) {
    case "raw_ingredient":
      return "Raw ingredient";
    case "generic_food":
      return "Generic food";
    case "prepared_food":
      return "Prepared food";
    case "branded_product":
      return "Branded product";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

type ServingForm = {
  label: string;
  unit: string;
  conversion: string;
};

type FoodForm = {
  id: string | null;
  name: string;
  classification: FoodClassification | "";
  basis: NutritionBasis | "";
  energyKcal: string;
  proteinGrams: string;
  carbsGrams: string;
  fatGrams: string;
  servings: ServingForm[];
  description: string;
  notes: string;
};

function emptyServing(): ServingForm {
  return { label: "", unit: "", conversion: "" };
}

function scaledField(value: number | null): string {
  if (value == null) return "";
  const whole = Math.trunc(value / NUTRIENT_SCALE);
  const fraction = value % NUTRIENT_SCALE;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(6, "0").replace(/0+$/, "")}`;
}

function emptyFoodForm(): FoodForm {
  return {
    id: null,
    name: "",
    classification: "",
    basis: "",
    energyKcal: "",
    proteinGrams: "",
    carbsGrams: "",
    fatGrams: "",
    servings: [emptyServing()],
    description: "",
    notes: "",
  };
}

function foodFormFrom(item: FoodLibraryItem): FoodForm {
  return {
    id: item.id,
    name: item.name,
    classification: item.classification ?? "",
    basis: item.basis ?? "",
    energyKcal: scaledField(item.energyKcalScaled),
    proteinGrams: scaledField(item.proteinScaled),
    carbsGrams: scaledField(item.carbsScaled),
    fatGrams: scaledField(item.fatScaled),
    servings:
      item.servings.length > 0
        ? item.servings.map((serving) => ({
            label: serving.label,
            unit: serving.unit,
            conversion: scaledField(serving.conversionScaled),
          }))
        : [emptyServing()],
    description: item.description ?? "",
    notes: item.notes ?? "",
  };
}

function optionalDecimal(
  value: string,
  label: string,
  max: number,
): number | null | string {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    return `${label} must be from 0 to ${max}. Leave it blank when it is unknown.`;
  }
  try {
    scaleDecimal(parsed);
  } catch (error) {
    return error instanceof Error ? error.message : `${label} is not a valid number.`;
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
    setActing(true);
    setError(null);
    setMessage(null);
    const body = {
      name: form.name.trim(),
      instructions: nullableText(form.instructions),
      primaryMuscles: form.primaryMuscles,
      secondaryMuscles: form.secondaryMuscles,
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
      setMessage("Exercise archived. Plans that already copied it stay unchanged.");
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
            Global rows are read-only. Create, update, and archive apply to
            exercises you own. Reps and load belong on the plan, not here.
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
              <th scope="col">Primary muscles</th>
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
                      {item.secondaryMuscles.length > 0
                        ? `Secondary: ${item.secondaryMuscles.join(", ")}`
                        : "No secondary muscles"}
                      {item.equipment.length > 0
                        ? ` · ${item.equipment.join(", ")}`
                        : ""}
                    </span>
                  </td>
                  <td>{ownershipLabel(item.ownership)}</td>
                  <td>{item.difficulty ? difficultyLabel(item.difficulty) : "—"}</td>
                  <td>
                    {item.primaryMuscles.length > 0
                      ? item.primaryMuscles.join(", ")
                      : "—"}
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
              label="Primary muscles"
              values={form.primaryMuscles}
              onChange={(primaryMuscles) => setForm({ ...form, primaryMuscles })}
            />
            <LabelEntry
              label="Secondary muscles"
              values={form.secondaryMuscles}
              onChange={(secondaryMuscles) =>
                setForm({ ...form, secondaryMuscles })
              }
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
                    Confirm archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPendingDelete(true)}
                  >
                    Archive
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
          <dt>Primary muscles</dt>
          <dd>{item.primaryMuscles.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt>Secondary muscles</dt>
          <dd>{item.secondaryMuscles.join(", ") || "—"}</dd>
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
    if (form.classification === "" || form.basis === "") {
      setError("Choose a classification and a nutrition basis.");
      return;
    }
    const energyKcal = optionalDecimal(form.energyKcal, "Energy", 2000);
    const proteinGrams = optionalDecimal(form.proteinGrams, "Protein", 100);
    const carbsGrams = optionalDecimal(form.carbsGrams, "Carbs", 100);
    const fatGrams = optionalDecimal(form.fatGrams, "Fat", 100);
    if (
      typeof energyKcal === "string" ||
      typeof proteinGrams === "string" ||
      typeof carbsGrams === "string" ||
      typeof fatGrams === "string"
    ) {
      const problem = [energyKcal, proteinGrams, carbsGrams, fatGrams].find(
        (value): value is string => typeof value === "string",
      );
      setError(problem ?? "Check the nutrition numbers.");
      return;
    }
    const servings: { label: string; unit: string; conversion: number }[] = [];
    for (const serving of form.servings) {
      const conversion = optionalDecimal(serving.conversion, "Serving amount", 5000);
      if (typeof conversion === "string") {
        setError(conversion);
        return;
      }
      if (
        serving.label.trim() === "" ||
        serving.unit.trim() === "" ||
        conversion == null ||
        conversion <= 0
      ) {
        setError("Each serving needs a label, a unit, and a positive conversion.");
        return;
      }
      servings.push({
        label: serving.label.trim(),
        unit: serving.unit.trim(),
        conversion,
      });
    }
    setActing(true);
    setError(null);
    setMessage(null);
    const body = {
      name: form.name.trim(),
      classification: form.classification,
      basis: form.basis,
      energyKcal,
      proteinGrams,
      carbsGrams,
      fatGrams,
      servings,
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
      setMessage("Food archived. Meal snapshots that already copied it stay unchanged.");
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
            Global rows are read-only. Nutrition is stored per 100 g or per 100 ml.
            Servings convert to that basis. Blank nutrients stay unknown.
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
              <th scope="col">Basis</th>
              <th scope="col">Servings</th>
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
                  <td>
                    {item.basis === "per_100_g"
                      ? "per 100 g"
                      : item.basis === "per_100_ml"
                        ? "per 100 ml"
                        : "—"}
                  </td>
                  <td>{item.servings.map((serving) => serving.label).join(", ") || "—"}</td>
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
              <span>Classification</span>
              <select
                value={form.classification}
                required
                onChange={(event) =>
                  setForm({
                    ...form,
                    classification: event.target.value as FoodClassification | "",
                  })
                }
              >
                <option value="">Choose classification</option>
                {FOOD_CLASSIFICATIONS.map((value) => (
                  <option key={value} value={value}>
                    {classificationLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Nutrition basis</span>
              <select
                value={form.basis}
                required
                onChange={(event) =>
                  setForm({
                    ...form,
                    basis: event.target.value as NutritionBasis | "",
                  })
                }
              >
                <option value="">Choose basis</option>
                <option value="per_100_g">Per 100 g</option>
                <option value="per_100_ml">Per 100 ml</option>
              </select>
            </label>
            <div className="field-row">
              <label className="field">
                <span>Energy (kcal per basis)</span>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step="0.1"
                  value={form.energyKcal}
                  onChange={(event) =>
                    setForm({ ...form, energyKcal: event.target.value })
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
            <fieldset className="templates-options">
              <legend>Servings</legend>
              {form.servings.map((serving, index) => (
                <div className="field-row" key={index}>
                  <label className="field">
                    <span>Label</span>
                    <input
                      value={serving.label}
                      maxLength={120}
                      onChange={(event) => {
                        const servings = form.servings.slice();
                        const current = servings[index];
                        if (!current) return;
                        servings[index] = { ...current, label: event.target.value };
                        setForm({ ...form, servings });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Unit</span>
                    <input
                      value={serving.unit}
                      maxLength={40}
                      onChange={(event) => {
                        const servings = form.servings.slice();
                        const current = servings[index];
                        if (!current) return;
                        servings[index] = { ...current, unit: event.target.value };
                        setForm({ ...form, servings });
                      }}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>{form.basis === "per_100_ml" ? "Millilitres" : "Grams"}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={serving.conversion}
                      onChange={(event) => {
                        const servings = form.servings.slice();
                        const current = servings[index];
                        if (!current) return;
                        servings[index] = {
                          ...current,
                          conversion: event.target.value,
                        };
                        setForm({ ...form, servings });
                      }}
                      required
                    />
                  </label>
                  {form.servings.length > 1 ? (
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() =>
                        setForm({
                          ...form,
                          servings: form.servings.filter((_, itemIndex) => itemIndex !== index),
                        })
                      }
                    >
                      Remove serving
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                className="button-secondary"
                disabled={form.servings.length >= 12}
                onClick={() =>
                  setForm({ ...form, servings: [...form.servings, emptyServing()] })
                }
              >
                Add serving
              </button>
            </fieldset>
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
                    Confirm archive
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setPendingDelete(true)}
                  >
                    Archive
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
          <dt>Classification</dt>
          <dd>
            {item.classification ? classificationLabel(item.classification) : "—"}
          </dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>
            {item.basis === "per_100_g"
              ? "per 100 g"
              : item.basis === "per_100_ml"
                ? "per 100 ml"
                : "—"}
          </dd>
        </div>
        <div>
          <dt>Energy (kcal)</dt>
          <dd>{scaledField(item.energyKcalScaled) || "Unknown"}</dd>
        </div>
        <div>
          <dt>Protein (g)</dt>
          <dd>{scaledField(item.proteinScaled) || "Unknown"}</dd>
        </div>
        <div>
          <dt>Carbs (g)</dt>
          <dd>{scaledField(item.carbsScaled) || "Unknown"}</dd>
        </div>
        <div>
          <dt>Fat (g)</dt>
          <dd>{scaledField(item.fatScaled) || "Unknown"}</dd>
        </div>
        <div>
          <dt>Servings</dt>
          <dd>
            {item.servings
              .map(
                (serving) =>
                  `${serving.label} (${serving.unit}${
                    serving.conversionScaled == null
                      ? ", no conversion"
                      : `, ${scaledField(serving.conversionScaled)}`
                  })`,
              )
              .join("; ") || "—"}
          </dd>
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
