import { useState, type RefObject } from "react";
import {
  NUTRIENT_SCALE,
  type ExerciseLibraryItem,
  type FoodLibraryItem,
  type MealPrescription,
  type WorkoutDay,
} from "@fitbud/contracts";
import { calculateServingNutrients, formatNumber, labelFor } from "@fitbud/core";
import { GripVertical, Plus, Search } from "lucide-react";
import { apiClient } from "../../lib/api";
import { Button, Chip, LibraryThumb } from "../ui";
import { PLAN_COMPOSITION_LIMITS } from "../plan-composition";
import { useCursorPage, useDebounced } from "../../pages/templates/useCursorPage";
import { exerciseMetaLine } from "./formatters";

/** Default serving meta for a food library row: `portion · kcal`. */
export function foodLibraryMetaLine(item: FoodLibraryItem): string {
  const serving = item.servings.find((candidate) => candidate.conversionScaled != null);
  if (!serving || serving.conversionScaled == null) {
    return "Needs a serving conversion";
  }
  const calculated = calculateServingNutrients(
    {
      energyKcalScaled: item.energyKcalScaled,
      proteinScaled: item.proteinScaled,
      carbsScaled: item.carbsScaled,
      fatScaled: item.fatScaled,
    },
    serving.conversionScaled,
    NUTRIENT_SCALE,
  );
  const kcal =
    calculated.energyKcalScaled != null
      ? `${formatNumber(Math.round(calculated.energyKcalScaled / NUTRIENT_SCALE))} kcal`
      : null;
  return [serving.label, kcal].filter(Boolean).join(" · ");
}

/**
 * Muscle filter chips (W-152's chip row). Values are the stored muscle keys
 * the library API matches on (primary or secondary); the set is the most
 * common primary muscles in the exercise library, kept short so the row fits
 * the 300 px pane in two lines.
 */
export const LIBRARY_MUSCLE_CHIPS = [
  "chest",
  "upper_back",
  "shoulders",
  "quads",
  "glutes",
  "abs",
] as const;

function defaultFoodServingId(item: FoodLibraryItem): string | null {
  return item.servings.find((serving) => serving.conversionScaled != null)?.id ?? null;
}

export function BuilderExerciseLibrary({
  day,
  onAdd,
  searchRef,
}: {
  day: WorkoutDay | null;
  onAdd: (item: ExerciseLibraryItem) => void;
  searchRef: RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState("");
  const [muscle, setMuscle] = useState("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(JSON.stringify({ q: nameQuery.trim(), muscle }), (cursor) =>
    apiClient.listExerciseLibrary({
      cursor,
      limit: 50,
      q: nameQuery.trim() || undefined,
      muscleGroup: muscle || undefined,
    }),
  );
  const atLimit =
    day != null && day.exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay;
  const canAdd = Boolean(day) && !atLimit;

  return (
    <div className="builder-library-pane" data-testid="builder-exercise-library">
      <label className="builder-library-search ui-input">
        <Search className="ui-i" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Search exercises</span>
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            const first = page.items[0];
            if (event.key === "Enter" && first && canAdd) {
              event.preventDefault();
              onAdd(first);
            }
          }}
          placeholder="Search exercises"
          autoComplete="off"
        />
      </label>
      <div
        className="builder-library-chips"
        role="group"
        aria-label="Muscle group"
        data-testid="builder-library-chips"
      >
        <Chip selected={muscle === ""} onClick={() => setMuscle("")}>
          All
        </Chip>
        {LIBRARY_MUSCLE_CHIPS.map((value) => (
          <Chip key={value} selected={muscle === value} onClick={() => setMuscle(value)}>
            {labelFor("body_part", value)}
          </Chip>
        ))}
      </div>
      {!day ? (
        <p className="muted">Select a session before adding an exercise.</p>
      ) : null}
      {atLimit ? (
        <p className="muted">This day already has the maximum number of exercises.</p>
      ) : null}
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}{" "}
          <button type="button" className="button-link" onClick={page.reload}>
            Retry
          </button>
        </p>
      ) : null}
      {page.loading ? (
        <p className="muted" aria-busy="true">
          Searching exercises…
        </p>
      ) : page.items.length === 0 ? (
        <p className="muted" role="status">
          {muscle ? "No exercises match that search and muscle." : "No exercises match that search."}
        </p>
      ) : (
        <ul className="builder-library-list">
          {page.items.map((item) => {
            const meta = exerciseMetaLine(item);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="builder-library-card"
                  disabled={!canAdd}
                  onClick={() => onAdd(item)}
                  aria-label={
                    meta ? `Add ${item.name}, ${meta}` : `Add ${item.name}`
                  }
                >
                  <GripVertical
                    className="builder-library-handle ui-i"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <LibraryThumb name={item.name} kind="exercise" />
                  <span className="builder-library-copy">
                    <span className="builder-library-name">{item.name}</span>
                    {meta ? (
                      <span className="builder-library-meta">{meta}</span>
                    ) : null}
                  </span>
                  <span className="builder-library-add" aria-hidden="true">
                    <Plus className="ui-i" strokeWidth={1.75} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor ? (
        <Button
          variant="ghost"
          className="builder-library-more"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more exercises"}
        </Button>
      ) : null}
    </div>
  );
}

export function BuilderFoodLibrary({
  meal,
  onAdd,
  searchRef,
}: {
  meal: MealPrescription | null;
  onAdd: (item: FoodLibraryItem, servingId: string) => void;
  searchRef: RefObject<HTMLInputElement>;
}) {
  const [q, setQ] = useState("");
  const nameQuery = useDebounced(q);
  const page = useCursorPage(nameQuery.trim(), (cursor) =>
    apiClient.listFoodLibrary({
      cursor,
      limit: 50,
      q: nameQuery.trim() || undefined,
    }),
  );
  const atLimit =
    meal != null && (meal.items ?? []).length >= PLAN_COMPOSITION_LIMITS.itemsPerMeal;
  const canAdd = Boolean(meal) && !atLimit;

  return (
    <div className="builder-library-pane" data-testid="builder-food-library">
      <label className="builder-library-search ui-input">
        <Search className="ui-i" strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Search foods</span>
        <input
          ref={searchRef}
          type="search"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          onKeyDown={(event) => {
            const first = page.items[0];
            const servingId = first ? defaultFoodServingId(first) : null;
            if (event.key === "Enter" && first && servingId && canAdd) {
              event.preventDefault();
              onAdd(first, servingId);
            }
          }}
          placeholder="Search foods"
          autoComplete="off"
        />
      </label>
      {!meal ? <p className="muted">Select a meal before adding a food.</p> : null}
      {atLimit ? (
        <p className="muted">This meal already has the maximum number of foods.</p>
      ) : null}
      {page.error ? (
        <p className="form-error" role="alert">
          {page.error}{" "}
          <button type="button" className="button-link" onClick={page.reload}>
            Retry
          </button>
        </p>
      ) : null}
      {page.loading ? (
        <p className="muted" aria-busy="true">
          Searching foods…
        </p>
      ) : page.items.length === 0 ? (
        <p className="muted" role="status">
          No foods match that search.
        </p>
      ) : (
        <ul className="builder-library-list">
          {page.items.map((item) => {
            const servingId = defaultFoodServingId(item);
            const meta = foodLibraryMetaLine(item);
            const disabled = !canAdd || !servingId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="builder-library-card"
                  disabled={disabled}
                  onClick={() => {
                    if (servingId) onAdd(item, servingId);
                  }}
                  aria-label={
                    meta ? `Add ${item.name}, ${meta}` : `Add ${item.name}`
                  }
                >
                  <GripVertical
                    className="builder-library-handle ui-i"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <LibraryThumb name={item.name} kind="food" />
                  <span className="builder-library-copy">
                    <span className="builder-library-name">{item.name}</span>
                    <span className="builder-library-meta">{meta}</span>
                  </span>
                  <span className="builder-library-add" aria-hidden="true">
                    <Plus className="ui-i" strokeWidth={1.75} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {page.nextCursor ? (
        <Button
          variant="ghost"
          className="builder-library-more"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more foods"}
        </Button>
      ) : null}
    </div>
  );
}
