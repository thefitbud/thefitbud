import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
  FoodClassification,
  FoodLibraryItem,
  NutritionBasis,
} from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { calculateServingNutrients, formatNumber, labelFor } from "@fitbud/core";
import { Button } from "../../components/Button";
import { Button as UiButton, Tabs } from "../../components/ui";
import { LibraryThumb } from "../../components/ui/LibraryThumb";
import {
  EmptyState,
  ErrorState,
  LoadingBlock,
} from "../../components/StatePanels";
import { useOnline } from "../../hooks/useOnline";
import { apiClient } from "../../lib/api";
import { LibrarySearch } from "./LibrarySearch";
import { FilterChipSelect } from "./TemplateScopeToolbar";
import { errorText } from "./shared";
import { useCursorPage, useDebounced } from "./useCursorPage";
import "./LibrariesPanel.css";

const PAGE_SIZE = 25;

type SourceFilter = "all" | "global" | "mine";

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

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Any" },
  { value: "global", label: "FitBud" },
  { value: "mine", label: "You" },
];

function scaledDisplay(value: number | null): string {
  if (value == null) return "—";
  // Frames use whole kcal / grams; round rather than show seed decimals.
  return formatNumber(Math.round(value / NUTRIENT_SCALE));
}

/** First serving with a conversion — same pick as BuilderLibraryList.foodLibraryMetaLine. */
function defaultFoodServing(item: FoodLibraryItem) {
  return item.servings.find((candidate) => candidate.conversionScaled != null) ?? null;
}

/** Per-serving nutrients from per-100g (or basis) canonical values. */
function foodServingNutrients(item: FoodLibraryItem) {
  const serving = defaultFoodServing(item);
  if (!serving || serving.conversionScaled == null) return null;
  return {
    serving,
    calculated: calculateServingNutrients(
      {
        energyKcalScaled: item.energyKcalScaled,
        proteinScaled: item.proteinScaled,
        carbsScaled: item.carbsScaled,
        fatScaled: item.fatScaled,
      },
      serving.conversionScaled,
      NUTRIENT_SCALE,
    ),
  };
}

function sourceLabel(ownership: "global" | "trainer"): string {
  return ownership === "global" ? "FitBud base" : "Mine";
}

function foodCategory(item: FoodLibraryItem): string {
  if (item.classification) {
    return labelFor("food_classification", item.classification);
  }
  return "Uncategorised";
}

/** List meta: `portion · kcal` for the default serving (not raw per-100g). */
export function foodServingKcal(item: FoodLibraryItem): string {
  const nutrients = foodServingNutrients(item);
  if (!nutrients) {
    const fallback = item.servings[0]?.label?.trim() || "—";
    return `${fallback} · —`;
  }
  const servingLabel = nutrients.serving.label.trim() || "—";
  const kcal = scaledDisplay(nutrients.calculated.energyKcalScaled);
  if (kcal === "—") return `${servingLabel} · —`;
  return `${servingLabel} · ${kcal} kcal`;
}

/** "6 · 45 · 5" protein, carbs, fat per default serving; a dash when there is none. */
function foodMacros(item: FoodLibraryItem): string {
  const nutrients = foodServingNutrients(item);
  if (!nutrients) return "—";
  const { proteinScaled, carbsScaled, fatScaled } = nutrients.calculated;
  return [proteinScaled, carbsScaled, fatScaled]
    .map((value) => scaledDisplay(value))
    .join(" · ");
}

function FoodDrawerMacroRows({ item }: { item: FoodLibraryItem }) {
  const nutrients = foodServingNutrients(item);
  const servingLabel =
    nutrients?.serving.label ?? item.servings[0]?.label ?? "—";
  const energy = scaledDisplay(nutrients?.calculated.energyKcalScaled ?? null);
  const protein = scaledDisplay(nutrients?.calculated.proteinScaled ?? null);
  const carbs = scaledDisplay(nutrients?.calculated.carbsScaled ?? null);
  const fat = scaledDisplay(nutrients?.calculated.fatScaled ?? null);
  return (
    <>
      <div>
        <dt>Serving</dt>
        <dd>{servingLabel}</dd>
      </div>
      <div>
        <dt>Calories</dt>
        <dd>{energy === "—" ? "—" : `${energy} kcal`}</dd>
      </div>
      <div>
        <dt>Protein</dt>
        <dd>{protein === "—" ? "—" : `${protein} g`}</dd>
      </div>
      <div>
        <dt>Carbs</dt>
        <dd>{carbs === "—" ? "—" : `${carbs} g`}</dd>
      </div>
      <div>
        <dt>Fat</dt>
        <dd>{fat === "—" ? "—" : `${fat} g`}</dd>
      </div>
    </>
  );
}

function exerciseMuscle(item: ExerciseLibraryItem): string {
  if (item.primaryMuscles.length === 0) return "—";
  return item.primaryMuscles
    .map((value) => labelFor("body_part", value))
    .join(", ");
}

function exerciseEquipment(item: ExerciseLibraryItem): string {
  if (item.equipment.length === 0) return "—";
  return item.equipment
    .map((value) => labelFor("equipment", value))
    .join(", ");
}

function matchesSource(
  ownership: "global" | "trainer",
  source: SourceFilter,
): boolean {
  if (source === "all") return true;
  if (source === "global") return ownership === "global";
  return ownership === "trainer";
}

function SourceFilterControl({
  value,
  onChange,
}: {
  value: SourceFilter;
  onChange: (value: SourceFilter) => void;
}) {
  return (
    <FilterChipSelect
      label="Source"
      value={value}
      defaultValue="all"
      options={SOURCE_OPTIONS}
      onChange={(next) => onChange(next as SourceFilter)}
    />
  );
}

function SourceChip({ ownership }: { ownership: "global" | "trainer" }) {
  return (
    <span
      className={
        ownership === "trainer"
          ? "ui-pill ui-p-coach libraries-source-chip is-mine"
          : "ui-pill ui-p-neutral libraries-source-chip"
      }
    >
      {ownership === "trainer" ? "You" : "FitBud"}
    </span>
  );
}

export function LibrariesPanel() {
  const { segment } = useParams();
  const initial =
    segment === "foods" ? "foods" : ("exercises" as "exercises" | "foods");
  const [tab, setTab] = useState<"exercises" | "foods">(initial);

  useEffect(() => {
    setTab(segment === "foods" ? "foods" : "exercises");
  }, [segment]);

  return (
    <div className="templates-tab-panel libraries-v3" data-testid="screen-TW-26">
      {tab === "exercises" ? (
        <ExerciseLibrary onTab={setTab} />
      ) : (
        <FoodLibrary onTab={setTab} />
      )}
    </div>
  );
}

function LibrariesChrome({
  tab,
  onTab,
  addLabel,
  onAdd,
  children,
}: {
  tab: "exercises" | "foods";
  onTab: (tab: "exercises" | "foods") => void;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <>
      <header className="libraries-header">
        <div className="page-header">
          <h1>Library</h1>
          <p className="lede">Foods and exercises you can add to any plan</p>
        </div>
        <UiButton variant="primary" onClick={onAdd}>
          <Plus className="ui-i" strokeWidth={2} aria-hidden="true" />
          {addLabel}
        </UiButton>
      </header>
      <Tabs
        aria-label="Library type"
        value={tab}
        items={[
          { id: "foods", label: "Foods" },
          { id: "exercises", label: "Exercises" },
        ]}
        onChange={(id) => {
          const next = id === "foods" ? "foods" : "exercises";
          onTab(next);
          navigate(`/templates/libraries/${next}`);
        }}
      />
      {children}
    </>
  );
}

function ExerciseLibrary({
  onTab,
}: {
  onTab: (tab: "exercises" | "foods") => void;
}) {
  const online = useOnline();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [equipment, setEquipment] = useState("");
  const [muscle, setMuscle] = useState("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(
    JSON.stringify({
      q: nameQuery.trim(),
      muscle,
      equipment,
    }),
    (cursor) =>
      apiClient.listExerciseLibrary({
        cursor,
        limit: PAGE_SIZE,
        q: nameQuery.trim() || undefined,
        muscleGroup: muscle || undefined,
        equipment: equipment || undefined,
      }),
  );
  const [detail, setDetail] = useState<ExerciseLibraryItem | null>(null);
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

  const items = useMemo(
    () => page.items.filter((item) => matchesSource(item.ownership, source)),
    [page.items, source],
  );
  const emptySearch =
    Boolean(nameQuery.trim() || muscle || equipment || source !== "all") &&
    items.length === 0 &&
    !page.loading;

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
      setDetail(null);
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
      setDetail(null);
      setMessage("Archived.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not archive. It may be referenced."));
    } finally {
      setActing(false);
    }
  }

  function openNew() {
    setForm({
      id: null,
      name: "",
      instructions: "",
      primaryMuscles: [],
      secondaryMuscles: [],
      equipment: [],
      difficulty: "",
    });
  }

  return (
    <div className="library-panel">
      <LibrariesChrome
        tab="exercises"
        onTab={onTab}
        addLabel="New exercise"
        onAdd={openNew}
      >
        {!online ? (
          <ErrorState
            kind="network"
            screenId="TW-26"
            title="You're offline"
            message="Reconnect to browse the library."
          />
        ) : null}
        <div className="libraries-toolbar">
          <LibrarySearch
            value={q}
            onChange={setQ}
            label="Search exercises"
            placeholder="Search exercises"
          />
          <FilterChipSelect
            label="Muscle"
            value={muscle || "all"}
            defaultValue="all"
            options={[
              { value: "all", label: "Any" },
              ...MUSCLE_OPTIONS.map((value) => ({
                value,
                label: labelFor("body_part", value),
              })),
            ]}
            onChange={(next) => setMuscle(next === "all" ? "" : next)}
          />
          <FilterChipSelect
            label="Equipment"
            value={equipment || "all"}
            defaultValue="all"
            options={[
              { value: "all", label: "Any" },
              ...EQUIPMENT_OPTIONS.map((value) => ({
                value,
                label: labelFor("equipment", value),
              })),
            ]}
            onChange={(next) => setEquipment(next === "all" ? "" : next)}
          />
          <SourceFilterControl value={source} onChange={setSource} />
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
            title={
              nameQuery.trim()
                ? `No exercises match '${nameQuery.trim()}'. Create it?`
                : "No exercises match these filters."
            }
            action={
              nameQuery.trim() ? (
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
              ) : undefined
            }
          />
        ) : null}

        {items.length > 0 ? (
          <div className="libraries-table-wrap" tabIndex={0}>
            <table className="ui-table libraries-table">
              <thead>
                <tr>
                  <th scope="col">Exercise</th>
                  <th scope="col">Muscle</th>
                  <th scope="col">Equipment</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="libraries-col-go">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={detail?.id === item.id ? "is-selected" : undefined}
                    tabIndex={0}
                    onClick={() => setDetail(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetail(item);
                      }
                    }}
                  >
                    <td data-label="Exercise">
                      <div className="ui-cell-main">
                        <LibraryThumb name={item.name} kind="exercise" />
                        <div className="ui-t">
                          <b className="libraries-name">{item.name}</b>
                          <span className="libraries-sub">
                            {item.difficulty
                              ? labelFor("exercise_difficulty", item.difficulty)
                              : "Exercise"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Muscle">{exerciseMuscle(item)}</td>
                    <td data-label="Equipment">{exerciseEquipment(item)}</td>
                    <td data-label="Source">
                      <SourceChip ownership={item.ownership} />
                    </td>
                    <td aria-hidden="true" className="libraries-col-go">
                      <ChevronRight size={18} strokeWidth={1.75} />
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
            className="libraries-more"
            disabled={page.loadingMore}
            onClick={page.loadMore}
          >
            {page.loadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}

        <section className="libraries-logged-card" aria-label="Logged by clients">
          <div className="libraries-logged-head">
            <h3>Logged by clients, not in library</h3>
            <p>Free-text entries from client logs</p>
          </div>
          <p className="libraries-logged-empty">
            Client free-text exercises stay on their workout logs. There is no
            library feed for them yet — open a client workspace to review
            unusual entries.
          </p>
        </section>
      </LibrariesChrome>

      {detail ? (
        <div
          className="libraries-drawer-scrim"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <aside
            className="libraries-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="libraries-drawer-head">
              <div>
                <h2>{detail.name}</h2>
                <div className="libraries-drawer-meta">
                  <span
                    className={
                      detail.ownership === "trainer"
                        ? "libraries-source-chip is-mine"
                        : "libraries-source-chip"
                    }
                  >
                    {sourceLabel(detail.ownership)}
                  </span>
                </div>
              </div>
              <Button variant="tertiary" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
            <dl className="libraries-drawer-dl">
              <div>
                <dt>Primary muscles</dt>
                <dd>{exerciseMuscle(detail)}</dd>
              </div>
              <div>
                <dt>Equipment</dt>
                <dd>{exerciseEquipment(detail)}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>
                  {detail.difficulty
                    ? labelFor("exercise_difficulty", detail.difficulty)
                    : "—"}
                </dd>
              </div>
            </dl>
            {detail.ownership === "global" ? (
              <div className="libraries-drawer-note" role="note">
                FitBud base exercises can&apos;t be edited. Make your own copy
                to change it.
              </div>
            ) : null}
            <div className="libraries-drawer-actions">
              {detail.ownership === "global" ? (
                <Button
                  variant="primary"
                  disabled={acting}
                  onClick={() => void duplicate(detail)}
                >
                  Make my copy
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setForm({
                        id: detail.id,
                        name: detail.name,
                        instructions: detail.instructions ?? "",
                        primaryMuscles: [...detail.primaryMuscles],
                        secondaryMuscles: [...detail.secondaryMuscles],
                        equipment: [...detail.equipment],
                        difficulty: detail.difficulty ?? "",
                      });
                      setDetail(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setArchiveTarget(detail)}
                  >
                    Archive
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {form ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setForm(null)}
        >
          <div
            className="modal-card library-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? "Edit exercise" : "Create exercise"}
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={(event) => void save(event)}>
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

function FoodLibrary({
  onTab,
}: {
  onTab: (tab: "exercises" | "foods") => void;
}) {
  const online = useOnline();
  const [q, setQ] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(`foods-${nameQuery}`, (cursor) =>
    apiClient.listFoodLibrary({
      cursor,
      limit: PAGE_SIZE,
      q: nameQuery.trim() || undefined,
    }),
  );
  const [detail, setDetail] = useState<FoodLibraryItem | null>(null);
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

  const items = useMemo(
    () => page.items.filter((item) => matchesSource(item.ownership, source)),
    [page.items, source],
  );
  const emptySearch =
    Boolean(nameQuery.trim() || source !== "all") &&
    items.length === 0 &&
    !page.loading;

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
      setDetail(null);
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
      setDetail(null);
      setMessage("Archived.");
      page.reload();
    } catch (err) {
      setError(errorText(err, "Could not archive. It may be referenced."));
    } finally {
      setActing(false);
    }
  }

  function openNew() {
    setForm({
      id: null,
      name: "",
      classification: "generic_food",
      basis: "per_100_g",
      energyKcal: "",
      proteinGrams: "",
      carbsGrams: "",
      fatGrams: "",
      servings: [
        { label: "100 g", unit: "g", conversion: "100" },
        { label: "1 katori", unit: "g", conversion: "150" },
      ],
      aliases: "",
      description: "",
    });
  }

  return (
    <div className="library-panel">
      <LibrariesChrome
        tab="foods"
        onTab={onTab}
        addLabel="New food"
        onAdd={openNew}
      >
        {!online ? (
          <ErrorState
            kind="network"
            screenId="TW-26"
            title="You're offline"
            message="Reconnect to browse the library."
          />
        ) : null}
        <div className="libraries-toolbar">
          <LibrarySearch
            value={q}
            onChange={setQ}
            label="Search foods"
            placeholder="Search foods"
          />
          <SourceFilterControl value={source} onChange={setSource} />
        </div>

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
          <EmptyState title={`No foods match '${nameQuery.trim() || "filters"}'.`} />
        ) : null}

        {items.length > 0 ? (
          <div className="libraries-table-wrap" tabIndex={0}>
            <table className="ui-table libraries-table">
              <thead>
                <tr>
                  <th scope="col">Food</th>
                  <th scope="col">Serving · kcal</th>
                  <th scope="col">P · C · F (g)</th>
                  <th scope="col">Source</th>
                  <th scope="col" className="libraries-col-go">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={detail?.id === item.id ? "is-selected" : undefined}
                    tabIndex={0}
                    onClick={() => setDetail(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetail(item);
                      }
                    }}
                  >
                    <td data-label="Food">
                      <div className="ui-cell-main">
                        <LibraryThumb name={item.name} kind="food" />
                        <div className="ui-t">
                          <b className="libraries-name">{item.name}</b>
                          <span className="libraries-sub">{foodCategory(item)}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Serving · kcal">
                      <span className="libraries-serving">
                        {foodServingKcal(item)}
                      </span>
                    </td>
                    <td data-label="P · C · F (g)">{foodMacros(item)}</td>
                    <td data-label="Source">
                      <SourceChip ownership={item.ownership} />
                    </td>
                    <td aria-hidden="true" className="libraries-col-go">
                      <ChevronRight size={18} strokeWidth={1.75} />
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
            className="libraries-more"
            disabled={page.loadingMore}
            onClick={page.loadMore}
          >
            {page.loadingMore ? "Loading…" : "Load more"}
          </Button>
        ) : null}
      </LibrariesChrome>

      {detail ? (
        <div
          className="libraries-drawer-scrim"
          role="presentation"
          onClick={() => setDetail(null)}
        >
          <aside
            className="libraries-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="libraries-drawer-head">
              <div>
                <h2>{detail.name}</h2>
                <div className="libraries-drawer-meta">
                  <span
                    className={
                      detail.ownership === "trainer"
                        ? "libraries-source-chip is-mine"
                        : "libraries-source-chip"
                    }
                  >
                    {sourceLabel(detail.ownership)}
                  </span>
                </div>
              </div>
              <Button variant="tertiary" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
            <dl className="libraries-drawer-dl">
              <FoodDrawerMacroRows item={detail} />
              <div>
                <dt>Used in</dt>
                <dd>—</dd>
              </div>
            </dl>
            {detail.ownership === "global" ? (
              <div className="libraries-drawer-note" role="note">
                FitBud base foods can&apos;t be edited. Make your own copy to
                change it.
              </div>
            ) : null}
            <div className="libraries-drawer-actions">
              {detail.ownership === "global" ? (
                <Button
                  variant="primary"
                  disabled={acting}
                  onClick={() => void duplicate(detail)}
                >
                  Make my copy
                </Button>
              ) : (
                <>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setForm({
                        id: detail.id,
                        name: detail.name,
                        classification: detail.classification ?? "",
                        basis: detail.basis ?? "",
                        energyKcal: scaledDisplay(detail.energyKcalScaled).replace(
                          "—",
                          "",
                        ),
                        proteinGrams: scaledDisplay(detail.proteinScaled).replace(
                          "—",
                          "",
                        ),
                        carbsGrams: scaledDisplay(detail.carbsScaled).replace(
                          "—",
                          "",
                        ),
                        fatGrams: scaledDisplay(detail.fatScaled).replace(
                          "—",
                          "",
                        ),
                        servings:
                          detail.servings.length > 0
                            ? detail.servings.map((s) => ({
                                label: s.label,
                                unit: s.unit,
                                conversion: String(
                                  (s.conversionScaled ?? NUTRIENT_SCALE) /
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
                        aliases: (detail.notes ?? "").replace(
                          /^Aliases:\s*/i,
                          "",
                        ),
                        description: detail.description ?? "",
                      });
                      setDetail(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setArchiveTarget(detail)}
                  >
                    Archive
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => setDetail(null)}>
                Close
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {form ? (
        <div
          className="modal-scrim"
          role="presentation"
          onClick={() => setForm(null)}
        >
          <div
            className="modal-card library-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={form.id ? "Edit food" : "Create food"}
            onClick={(event) => event.stopPropagation()}
          >
            <form onSubmit={(event) => void save(event)}>
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
                      classification: event.target.value as FoodClassification,
                    })
                  }
                >
                  {FOOD_CLASSIFICATIONS.map((value) => (
                    <option key={value} value={value}>
                      {labelFor("food_classification", value)}
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
                  <option value="per_100_g">
                    {labelFor("nutrition_basis", "per_100_g")}
                  </option>
                  <option value="per_100_ml">
                    {labelFor("nutrition_basis", "per_100_ml")}
                  </option>
                </select>
              </label>
              <div className="libraries-macro-grid">
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
