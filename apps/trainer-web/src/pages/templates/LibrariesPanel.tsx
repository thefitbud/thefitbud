import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
  FoodClassification,
  FoodLibraryItem,
  NutritionBasis,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { Button } from "../../components/Button";
import { OverflowMenu } from "../../components/OverflowMenu";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { LibraryThumb } from "./LibraryThumb";
import { errorText } from "./shared";
import { useCursorPage, useDebounced } from "./useCursorPage";

const PAGE_SIZE = 25;

const MUSCLE_OPTIONS = [
  "chest",
  "upper_back",
  "lower_back",
  "lats",
  "shoulders",
  "biceps",
  "triceps",
  "core",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "full_body",
  "legs",
  "back",
] as const;

const EQUIPMENT_OPTIONS = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "cable",
  "bodyweight",
  "band",
  "smith_machine",
  "medicine_ball",
  "other",
  "none",
] as const;

const DIFFICULTIES: ExerciseDifficulty[] = [
  "beginner",
  "intermediate",
  "advanced",
];

const FOOD_CLASSIFICATIONS: FoodClassification[] = [
  "raw_ingredient",
  "generic_food",
  "prepared_food",
  "branded_product",
];

function classificationLabel(value: FoodClassification): string {
  switch (value) {
    case "raw_ingredient":
      return "Raw";
    case "generic_food":
      return "Generic";
    case "prepared_food":
      return "Prepared";
    case "branded_product":
      return "Branded";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function basisLabel(value: NutritionBasis): string {
  return value === "per_100_g" ? "per 100 g" : "per 100 ml";
}

function scaledDisplay(value: number | null): string {
  if (value == null) return "—";
  const whole = value / NUTRIENT_SCALE;
  return Number.isInteger(whole) ? String(whole) : whole.toFixed(1);
}

function joinLabels(values: string[], namespace: "body_part" | "equipment"): string {
  if (values.length === 0) return "—";
  return values.map((value) => labelFor(namespace, value)).join(", ");
}

export function LibrariesPanel() {
  const { segment } = useParams();
  const initial =
    segment === "foods" ? "foods" : ("exercises" as "exercises" | "foods");
  const [tab, setTab] = useState<"exercises" | "foods">(initial);

  return (
    <div className="templates-tab-panel" data-testid="screen-TW-26">
      <header className="templates-tab-header">
        <h2 className="templates-tab-title">Libraries</h2>
        <p className="lede">
          Exercises and foods used in plan builders. Global items are read-only.
        </p>
      </header>
      <div className="segment" role="group" aria-label="Library type">
        <Link
          to="/templates/libraries/exercises"
          className={tab === "exercises" ? "segment-btn is-on" : "segment-btn"}
          onClick={() => setTab("exercises")}
        >
          Exercises
        </Link>
        <Link
          to="/templates/libraries/foods"
          className={tab === "foods" ? "segment-btn is-on" : "segment-btn"}
          onClick={() => setTab("foods")}
        >
          Foods
        </Link>
      </div>
      {tab === "exercises" ? <ExerciseLibrary /> : <FoodLibrary />}
    </div>
  );
}

function ExerciseLibrary() {
  const online = useOnline();
  const [q, setQ] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [equipment, setEquipment] = useState("");
  const [difficulty, setDifficulty] = useState<ExerciseDifficulty | "">("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(
    JSON.stringify({
      q: nameQuery.trim(),
      muscleGroup,
      equipment,
      difficulty,
    }),
    (cursor) =>
      apiClient.listExerciseLibrary({
        cursor,
        limit: PAGE_SIZE,
        q: nameQuery.trim() || undefined,
        muscleGroup: muscleGroup || undefined,
        equipment: equipment || undefined,
        difficulty: difficulty || undefined,
      }),
  );
  const [form, setForm] = useState<{
    id: string | null;
    name: string;
    instructions: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    equipment: string[];
    difficulty: ExerciseDifficulty | "";
  } | null>(null);
  const [archiveTarget, setArchiveTarget] =
    useState<ExerciseLibraryItem | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const emptySearch = Boolean(nameQuery.trim()) && page.items.length === 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setActing(true);
    setError(null);
    try {
      const body = {
        name: form.name.trim(),
        instructions: form.instructions.trim() || null,
        primaryMuscles: form.primaryMuscles,
        secondaryMuscles: form.secondaryMuscles,
        equipment: form.equipment,
        difficulty: form.difficulty || null,
      };
      if (form.id) {
        await apiClient.updateExerciseLibraryItem(form.id, body);
        setMessage("Exercise updated.");
      } else {
        await apiClient.createExerciseLibraryItem(body);
        setMessage("Exercise created.");
      }
      setForm(null);
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not save exercise."));
    } finally {
      setActing(false);
    }
  }

  async function duplicate(item: ExerciseLibraryItem) {
    setActing(true);
    setError(null);
    try {
      await apiClient.createExerciseLibraryItem({
        name: `${item.name} (mine)`,
        instructions: item.instructions,
        primaryMuscles: item.primaryMuscles,
        secondaryMuscles: item.secondaryMuscles,
        equipment: item.equipment,
        difficulty: item.difficulty,
      });
      setMessage("Duplicated to mine.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not duplicate."));
    } finally {
      setActing(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setActing(true);
    setError(null);
    try {
      await apiClient.deleteExerciseLibraryItem(archiveTarget.id);
      setArchiveTarget(null);
      setMessage("Archived.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not archive. It may be referenced."));
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="library-panel">
      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-26"
          title="You're offline"
          message="Reconnect to browse the library."
        />
      ) : null}
      <div className="library-toolbar">
        <label className="field">
          <span className="sr-only">Search exercises</span>
          <input
            type="search"
            placeholder="Search exercises"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="sr-only">Muscle</span>
          <select
            value={muscleGroup}
            onChange={(event) => setMuscleGroup(event.target.value)}
          >
            <option value="">All muscles</option>
            {MUSCLE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {labelFor("body_part", value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="sr-only">Equipment</span>
          <select
            value={equipment}
            onChange={(event) => setEquipment(event.target.value)}
          >
            <option value="">All equipment</option>
            {EQUIPMENT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {labelFor("equipment", value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="sr-only">Difficulty</span>
          <select
            value={difficulty}
            onChange={(event) =>
              setDifficulty(event.target.value as ExerciseDifficulty | "")
            }
          >
            <option value="">All levels</option>
            {DIFFICULTIES.map((value) => (
              <option key={value} value={value}>
                {labelFor("exercise_difficulty", value)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="primary"
          onClick={() =>
            setForm({
              id: null,
              name: "",
              instructions: "",
              primaryMuscles: [],
              secondaryMuscles: [],
              equipment: [],
              difficulty: "",
            })
          }
        >
          New exercise
        </Button>
      </div>

      {error || page.error ? (
        <ErrorState
          message={error ?? page.error ?? "Could not load exercises."}
          onRetry={page.reload}
          screenId="TW-26"
        />
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {page.loading && page.items.length === 0 ? (
        <LoadingBlock label="Loading exercises…" />
      ) : null}

      {!page.loading && emptySearch ? (
        <EmptyState
          title={`No exercises match '${nameQuery.trim()}'. Create it?`}
          action={
            <Button
              variant="primary"
              onClick={() =>
                setForm({
                  id: null,
                  name: nameQuery.trim(),
                  instructions: "",
                  primaryMuscles: [],
                  secondaryMuscles: [],
                  equipment: [],
                  difficulty: "",
                })
              }
            >
              Create exercise
            </Button>
          }
        />
      ) : null}

      {page.items.length > 0 ? (
        <div className="library-table-wrap" tabIndex={0}>
          <table className="library-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Primary muscles</th>
                <th scope="col">Secondary</th>
                <th scope="col">Equipment</th>
                <th scope="col">Difficulty</th>
                <th scope="col">Media</th>
                <th scope="col">Owner</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="library-name-cell">
                      <LibraryThumb name={item.name} kind="exercise" />
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td>{joinLabels(item.primaryMuscles, "body_part")}</td>
                  <td>{joinLabels(item.secondaryMuscles, "body_part")}</td>
                  <td>{joinLabels(item.equipment, "equipment")}</td>
                  <td>
                    {item.difficulty
                      ? labelFor("exercise_difficulty", item.difficulty)
                      : "—"}
                  </td>
                  <td>—</td>
                  <td>
                    {item.ownership === "global" ? "FitBud" : "Mine"}
                  </td>
                  <td>
                    <OverflowMenu
                      label={`Actions for ${item.name}`}
                      items={
                        item.ownership === "global"
                          ? [
                              {
                                id: "dup",
                                label: "Duplicate to mine",
                                onSelect: () => void duplicate(item),
                              },
                            ]
                          : [
                              {
                                id: "edit",
                                label: "Edit",
                                onSelect: () =>
                                  setForm({
                                    id: item.id,
                                    name: item.name,
                                    instructions: item.instructions ?? "",
                                    primaryMuscles: [...item.primaryMuscles],
                                    secondaryMuscles: [
                                      ...item.secondaryMuscles,
                                    ],
                                    equipment: [...item.equipment],
                                    difficulty: item.difficulty ?? "",
                                  }),
                              },
                              {
                                id: "archive",
                                label: "Archive",
                                destructive: true,
                                onSelect: () => setArchiveTarget(item),
                              },
                            ]
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {page.nextCursor ? (
        <Button
          variant="secondary"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      {form ? (
        <div className="modal-scrim" role="presentation" onClick={() => setForm(null)}>
          <form
            className="modal-card library-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? "Edit exercise" : "Create exercise"}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void save(event)}
          >
            <h2>{form.id ? "Edit exercise" : "New exercise"}</h2>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                required
                maxLength={120}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Primary muscles</span>
              <select
                multiple
                value={form.primaryMuscles}
                onChange={(event) =>
                  setForm({
                    ...form,
                    primaryMuscles: [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  })
                }
              >
                {MUSCLE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {labelFor("body_part", value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Secondary muscles</span>
              <select
                multiple
                value={form.secondaryMuscles}
                onChange={(event) =>
                  setForm({
                    ...form,
                    secondaryMuscles: [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  })
                }
              >
                {MUSCLE_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {labelFor("body_part", value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Equipment</span>
              <select
                multiple
                value={form.equipment}
                onChange={(event) =>
                  setForm({
                    ...form,
                    equipment: [...event.target.selectedOptions].map(
                      (option) => option.value,
                    ),
                  })
                }
              >
                {EQUIPMENT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {labelFor("equipment", value)}
                  </option>
                ))}
              </select>
            </label>
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
                <option value="">None</option>
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {labelFor("exercise_difficulty", value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Instructions</span>
              <textarea
                rows={4}
                value={form.instructions}
                onChange={(event) =>
                  setForm({ ...form, instructions: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Media link</span>
              <input type="url" placeholder="https://" />
            </label>
            <div className="button-row">
              <Button variant="primary" disabled={acting} type="submit">
                {acting ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="tertiary"
                type="button"
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {archiveTarget ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setArchiveTarget(null)}
        >
          <dialog
            open
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Archive exercise?</h2>
            <p>
              Archive <em>{archiveTarget.name}</em>? Referenced items are
              archived, not deleted.
            </p>
            <div className="button-row">
              <Button
                variant="destructive"
                disabled={acting}
                onClick={() => void confirmArchive()}
              >
                Archive
              </Button>
              <Button
                variant="tertiary"
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}

function FoodLibrary() {
  const online = useOnline();
  const [q, setQ] = useState("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(`foods-${nameQuery}`, (cursor) =>
    apiClient.listFoodLibrary({
      cursor,
      limit: PAGE_SIZE,
      q: nameQuery.trim() || undefined,
    }),
  );
  const [form, setForm] = useState<{
    id: string | null;
    name: string;
    classification: FoodClassification | "";
    basis: NutritionBasis | "";
    energyKcal: string;
    proteinGrams: string;
    carbsGrams: string;
    fatGrams: string;
    servings: Array<{ label: string; unit: string; conversion: string }>;
    aliases: string;
    description: string;
  } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FoodLibraryItem | null>(
    null,
  );
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const emptySearch = Boolean(nameQuery.trim()) && page.items.length === 0;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || !form.classification || !form.basis) return;
    setActing(true);
    setError(null);
    try {
      const servings = form.servings
        .filter((s) => s.label.trim() && s.unit.trim() && s.conversion.trim())
        .map((s) => ({
          label: s.label.trim(),
          unit: s.unit.trim(),
          conversion: Number(s.conversion),
        }));
      if (servings.length === 0) {
        setError("Add at least one serving.");
        setActing(false);
        return;
      }
      const aliasNote = form.aliases.trim()
        ? `Aliases: ${form.aliases.trim()}`
        : null;
      const body = {
        name: form.name.trim(),
        classification: form.classification,
        basis: form.basis,
        energyKcal:
          form.energyKcal.trim() === "" ? null : Number(form.energyKcal),
        proteinGrams:
          form.proteinGrams.trim() === "" ? null : Number(form.proteinGrams),
        carbsGrams:
          form.carbsGrams.trim() === "" ? null : Number(form.carbsGrams),
        fatGrams: form.fatGrams.trim() === "" ? null : Number(form.fatGrams),
        servings,
        description: form.description.trim() || null,
        notes: aliasNote,
      };
      if (form.id) {
        await apiClient.updateFoodLibraryItem(form.id, body);
        setMessage("Food updated.");
      } else {
        await apiClient.createFoodLibraryItem(body);
        setMessage("Food created.");
      }
      setForm(null);
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not save food."));
    } finally {
      setActing(false);
    }
  }

  async function duplicate(item: FoodLibraryItem) {
    if (!item.classification || !item.basis || item.servings.length === 0) {
      setError("This food is missing classification or servings.");
      return;
    }
    setActing(true);
    try {
      await apiClient.createFoodLibraryItem({
        name: `${item.name} (mine)`,
        classification: item.classification,
        basis: item.basis,
        energyKcal:
          item.energyKcalScaled == null
            ? null
            : item.energyKcalScaled / NUTRIENT_SCALE,
        proteinGrams:
          item.proteinScaled == null
            ? null
            : item.proteinScaled / NUTRIENT_SCALE,
        carbsGrams:
          item.carbsScaled == null ? null : item.carbsScaled / NUTRIENT_SCALE,
        fatGrams:
          item.fatScaled == null ? null : item.fatScaled / NUTRIENT_SCALE,
        servings: item.servings.map((serving) => ({
          label: serving.label,
          unit: serving.unit,
          conversion:
            (serving.conversionScaled ?? NUTRIENT_SCALE) / NUTRIENT_SCALE,
        })),
        description: item.description,
        notes: item.notes,
      });
      setMessage("Duplicated to mine.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not duplicate."));
    } finally {
      setActing(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setActing(true);
    try {
      await apiClient.deleteFoodLibraryItem(archiveTarget.id);
      setArchiveTarget(null);
      setMessage("Archived.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not archive. It may be referenced."));
    } finally {
      setActing(false);
    }
  }

  const customLoggedHint = useMemo(
    () =>
      "Logged by clients, not in library — open a client workspace to review custom foods.",
    [],
  );

  return (
    <div className="library-panel">
      {!online ? (
        <ErrorState
          kind="network"
          screenId="TW-26"
          title="You're offline"
          message="Reconnect to browse the library."
        />
      ) : null}
      <div className="library-toolbar">
        <label className="field">
          <span className="sr-only">Search foods</span>
          <input
            type="search"
            placeholder="Search foods"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <Button
          variant="primary"
          onClick={() =>
            setForm({
              id: null,
              name: "",
              classification: "generic_food",
              basis: "per_100_g",
              energyKcal: "",
              proteinGrams: "",
              carbsGrams: "",
              fatGrams: "",
              servings: [{ label: "1 katori", unit: "g", conversion: "150" }],
              aliases: "",
              description: "",
            })
          }
        >
          New food
        </Button>
      </div>
      <p className="muted">{customLoggedHint}</p>

      {error || page.error ? (
        <ErrorState
          message={error ?? page.error ?? "Could not load foods."}
          onRetry={page.reload}
          screenId="TW-26"
        />
      ) : null}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      {page.loading && page.items.length === 0 ? (
        <LoadingBlock label="Loading foods…" />
      ) : null}

      {!page.loading && emptySearch ? (
        <EmptyState title={`No foods match '${nameQuery.trim()}'.`} />
      ) : null}

      {page.items.length > 0 ? (
        <div className="library-table-wrap" tabIndex={0}>
          <table className="library-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Classification</th>
                <th scope="col">Basis</th>
                <th scope="col">kcal</th>
                <th scope="col">P</th>
                <th scope="col">C</th>
                <th scope="col">F</th>
                <th scope="col">Servings</th>
                <th scope="col">Owner</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="library-name-cell">
                      <LibraryThumb name={item.name} kind="food" />
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td>
                    {item.classification
                      ? classificationLabel(item.classification)
                      : "—"}
                  </td>
                  <td>{item.basis ? basisLabel(item.basis) : "—"}</td>
                  <td>{scaledDisplay(item.energyKcalScaled)}</td>
                  <td>{scaledDisplay(item.proteinScaled)}</td>
                  <td>{scaledDisplay(item.carbsScaled)}</td>
                  <td>{scaledDisplay(item.fatScaled)}</td>
                  <td>{item.servings.length}</td>
                  <td>
                    {item.ownership === "global" ? "FitBud" : "Mine"}
                  </td>
                  <td>
                    <OverflowMenu
                      label={`Actions for ${item.name}`}
                      items={
                        item.ownership === "global"
                          ? [
                              {
                                id: "dup",
                                label: "Duplicate to mine",
                                onSelect: () => void duplicate(item),
                              },
                            ]
                          : [
                              {
                                id: "edit",
                                label: "Edit",
                                onSelect: () =>
                                  setForm({
                                    id: item.id,
                                    name: item.name,
                                    classification: item.classification ?? "",
                                    basis: item.basis ?? "",
                                    energyKcal: scaledDisplay(
                                      item.energyKcalScaled,
                                    ).replace("—", ""),
                                    proteinGrams: scaledDisplay(
                                      item.proteinScaled,
                                    ).replace("—", ""),
                                    carbsGrams: scaledDisplay(
                                      item.carbsScaled,
                                    ).replace("—", ""),
                                    fatGrams: scaledDisplay(
                                      item.fatScaled,
                                    ).replace("—", ""),
                                    servings:
                                      item.servings.length > 0
                                        ? item.servings.map((s) => ({
                                            label: s.label,
                                            unit: s.unit,
                                            conversion: String(
                                              (s.conversionScaled ??
                                                NUTRIENT_SCALE) /
                                                NUTRIENT_SCALE,
                                            ),
                                          }))
                                        : [
                                            {
                                              label: "1 katori",
                                              unit: "g",
                                              conversion: "150",
                                            },
                                          ],
                                    aliases: (item.notes ?? "")
                                      .replace(/^Aliases:\s*/i, ""),
                                    description: item.description ?? "",
                                  }),
                              },
                              {
                                id: "archive",
                                label: "Archive",
                                destructive: true,
                                onSelect: () => setArchiveTarget(item),
                              },
                            ]
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {page.nextCursor ? (
        <Button
          variant="secondary"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more"}
        </Button>
      ) : null}

      {form ? (
        <div className="modal-scrim" role="presentation" onClick={() => setForm(null)}>
          <form
            className="modal-card library-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? "Edit food" : "Create food"}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => void save(event)}
          >
            <h2>{form.id ? "Edit food" : "New food"}</h2>
            <label className="field">
              <span>Name</span>
              <input
                value={form.name}
                required
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
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
                    classification: event.target
                      .value as FoodClassification,
                  })
                }
              >
                {FOOD_CLASSIFICATIONS.map((value) => (
                  <option key={value} value={value}>
                    {classificationLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Basis</span>
              <select
                value={form.basis}
                required
                onChange={(event) =>
                  setForm({
                    ...form,
                    basis: event.target.value as NutritionBasis,
                  })
                }
              >
                <option value="per_100_g">per 100 g</option>
                <option value="per_100_ml">per 100 ml</option>
              </select>
            </label>
            <div className="library-macro-grid">
              {(
                [
                  ["energyKcal", "kcal"],
                  ["proteinGrams", "Protein"],
                  ["carbsGrams", "Carbs"],
                  ["fatGrams", "Fat"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="field">
                  <span>{label}</span>
                  <input
                    inputMode="decimal"
                    value={form[key]}
                    placeholder="—"
                    onChange={(event) =>
                      setForm({ ...form, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
            <fieldset className="templates-options">
              <legend>Servings</legend>
              {form.servings.map((serving, index) => (
                <div key={index} className="templates-option-row">
                  <input
                    placeholder="1 katori"
                    value={serving.label}
                    onChange={(event) => {
                      const servings = [...form.servings];
                      servings[index] = {
                        ...serving,
                        label: event.target.value,
                      };
                      setForm({ ...form, servings });
                    }}
                  />
                  <input
                    placeholder="g"
                    value={serving.unit}
                    onChange={(event) => {
                      const servings = [...form.servings];
                      servings[index] = {
                        ...serving,
                        unit: event.target.value,
                      };
                      setForm({ ...form, servings });
                    }}
                  />
                  <input
                    placeholder="150"
                    value={serving.conversion}
                    onChange={(event) => {
                      const servings = [...form.servings];
                      servings[index] = {
                        ...serving,
                        conversion: event.target.value,
                      };
                      setForm({ ...form, servings });
                    }}
                  />
                </div>
              ))}
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    servings: [
                      ...form.servings,
                      { label: "", unit: "g", conversion: "" },
                    ],
                  })
                }
              >
                Add serving
              </Button>
            </fieldset>
            <label className="field">
              <span>Aliases</span>
              <input
                value={form.aliases}
                placeholder="dal, daal, dhal, paruppu"
                onChange={(event) =>
                  setForm({ ...form, aliases: event.target.value })
                }
              />
            </label>
            <div className="button-row">
              <Button variant="primary" disabled={acting} type="submit">
                {acting ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="tertiary"
                type="button"
                onClick={() => setForm(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {archiveTarget ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setArchiveTarget(null)}
        >
          <dialog
            open
            className="modal-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Archive food?</h2>
            <p>
              Archive <em>{archiveTarget.name}</em>? Referenced items are
              archived, not deleted.
            </p>
            <div className="button-row">
              <Button
                variant="destructive"
                disabled={acting}
                onClick={() => void confirmArchive()}
              >
                Archive
              </Button>
              <Button
                variant="tertiary"
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </Button>
            </div>
          </dialog>
        </div>
      ) : null}
    </div>
  );
}
