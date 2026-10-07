import { useState } from "react";
import type {
  ExerciseDifficulty,
  ExerciseLibraryItem,
  FoodLibraryItem,
  MealPrescription,
  WorkoutDay,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";
import { PLAN_COMPOSITION_LIMITS } from "../../components/plan-composition";
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

export function ExerciseSearchPane({
  day,
  onAdd,
}: {
  day: WorkoutDay | null;
  onAdd: (item: ExerciseLibraryItem) => void;
}) {
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
  const atLimit =
    day != null && day.exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay;

  return (
    <div className="templates-library-pane">
      <h4>Exercise library</h4>
      <p className="muted">
        Add copies the name, instructions, and default set into the selected
        day. The draft keeps a snapshot, not a live link.
      </p>
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
      {!day ? <p className="muted">Select a day before adding an exercise.</p> : null}
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
          No exercises match these filters.
        </p>
      ) : (
        <ul className="templates-search-list">
          {page.items.map((item) => (
            <li key={item.id}>
              <p className="templates-name">{item.name}</p>
              <p className="muted">
                {item.ownership === "global" ? "Global" : "Yours"}
                {item.difficulty ? ` · ${difficultyLabel(item.difficulty)}` : ""}
                {item.defaultReps != null ? ` · ${item.defaultReps} reps` : ""}
                {item.defaultLoadLabel ? ` · ${item.defaultLoadLabel}` : ""}
              </p>
              <button
                type="button"
                className="button-secondary"
                disabled={!day || atLimit}
                onClick={() => onAdd(item)}
              >
                Add to day
              </button>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <button
          type="button"
          className="button-ghost"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more exercises"}
        </button>
      ) : null}
    </div>
  );
}

export function FoodSearchPane({
  meal,
  onAdd,
}: {
  meal: MealPrescription | null;
  onAdd: (item: FoodLibraryItem) => void;
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

  return (
    <div className="templates-library-pane">
      <h4>Food library</h4>
      <p className="muted">
        Add copies the name, portion, and macros into the selected meal,
        including the library id on the snapshot.
      </p>
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
        <ul className="templates-search-list">
          {page.items.map((item) => (
            <li key={item.id}>
              <p className="templates-name">{item.name}</p>
              <p className="muted">
                {item.portionLabel}
                {item.calories != null ? ` · ${item.calories} kcal` : ""}
                {item.ownership === "global" ? " · Global" : " · Yours"}
              </p>
              <button
                type="button"
                className="button-secondary"
                disabled={!meal || atLimit}
                onClick={() => onAdd(item)}
              >
                Add to meal
              </button>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <button
          type="button"
          className="button-ghost"
          disabled={page.loadingMore}
          onClick={page.loadMore}
        >
          {page.loadingMore ? "Loading…" : "Load more foods"}
        </button>
      ) : null}
    </div>
  );
}
