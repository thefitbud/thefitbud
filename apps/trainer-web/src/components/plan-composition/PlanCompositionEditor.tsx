import { useEffect, useState, type ReactNode } from "react";
import type {
  MealFoodItem,
  MealPrescription,
  PlanContent,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSetTarget,
} from "@fitbud/contracts";
import {
  PLAN_COMPOSITION_LIMITS,
  addExercise,
  addFoodItem,
  addMeal,
  addSetTarget,
  addWorkoutDay,
  duplicateExercise,
  duplicateFoodItem,
  duplicateMeal,
  duplicateWorkoutDay,
  moveExercise,
  moveFoodItem,
  moveMeal,
  moveWorkoutDay,
  removeExercise,
  removeFoodItem,
  removeMeal,
  removeSetTarget,
  removeWorkoutDay,
  sortedByOrder,
  updateExercise,
  updateFoodItem,
  updateMeal,
  updateSetTarget,
  updateWorkoutDayName,
} from "./content";

export type PlanCompositionSections = "workout" | "nutrition" | "both";

type EditorChange = (content: PlanContent) => void;

function optionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInt(value: string): number | null {
  const parsed = optionalNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function blankToNull(value: string): string | null {
  return value.trim() === "" ? null : value;
}

function macroText(item: MealFoodItem): string {
  const parts = [
    item.calories != null ? `${item.calories} kcal` : null,
    item.proteinGrams != null ? `P ${item.proteinGrams} g` : null,
    item.carbsGrams != null ? `C ${item.carbsGrams} g` : null,
    item.fatGrams != null ? `F ${item.fatGrams} g` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ");
}

function setText(target: WorkoutSetTarget): string {
  const parts = [
    target.reps != null ? `${target.reps} reps` : null,
    target.loadLabel,
    target.rpe != null ? `RPE ${target.rpe}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ") || "No target stored";
}

export function PlanCompositionEditor({
  content,
  onChange,
  sections = "both",
  allowDuplicate = false,
  renderWorkoutLibrary,
  renderMealLibrary,
}: {
  content: PlanContent;
  onChange?: EditorChange;
  /** Which composition blocks to show. Client plans keep both. */
  sections?: PlanCompositionSections;
  /** Duplicate actions stay off unless a caller asks for them. */
  allowDuplicate?: boolean;
  renderWorkoutLibrary?: (day: WorkoutDay | null) => ReactNode;
  renderMealLibrary?: (meal: MealPrescription | null) => ReactNode;
}) {
  if (!onChange) {
    return <PlanCompositionReadOnly content={content} />;
  }
  return (
    <PlanCompositionFields
      content={content}
      onChange={onChange}
      sections={sections}
      allowDuplicate={allowDuplicate}
      renderWorkoutLibrary={renderWorkoutLibrary}
      renderMealLibrary={renderMealLibrary}
    />
  );
}

function PlanCompositionReadOnly({ content }: { content: PlanContent }) {
  const days = sortedByOrder(content.workoutDays);
  const meals = sortedByOrder(content.mealPrescriptions);

  return (
    <div className="plan-comp">
      <section className="plan-comp-block" aria-labelledby="plan-comp-workout">
        <h3 id="plan-comp-workout" className="plan-section-title">
          Workout
        </h3>
        {days.length === 0 ? (
          <p className="muted">No workout days on this version.</p>
        ) : (
          <ol className="plan-comp-readonly">
            {days.map((day) => (
              <li key={day.id}>
                <h4>
                  {day.order}. {day.name}
                </h4>
                {day.exercises.length === 0 ? (
                  <p className="muted">No exercises on this day.</p>
                ) : (
                  <ol>
                    {sortedByOrder(day.exercises).map((exercise) => (
                      <li key={exercise.id}>
                        <p className="plan-comp-name">{exercise.name}</p>
                        {exercise.instructions ? (
                          <p className="plan-cue">{exercise.instructions}</p>
                        ) : null}
                        {exercise.setTargets.length === 0 ? (
                          <p className="muted">No set targets.</p>
                        ) : (
                          <ul>
                            {sortedByOrder(exercise.setTargets).map((target) => (
                              <li key={target.id}>
                                Set {target.order}: {setText(target)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="plan-comp-block" aria-labelledby="plan-comp-meals">
        <h3 id="plan-comp-meals" className="plan-section-title">
          Meals
        </h3>
        {meals.length === 0 ? (
          <p className="muted">No meal prescriptions on this version.</p>
        ) : (
          <ol className="plan-comp-readonly">
            {meals.map((meal) => (
              <MealReadOnly key={meal.id} meal={meal} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function MealReadOnly({ meal }: { meal: MealPrescription }) {
  const items = meal.items ?? [];
  return (
    <li>
      <h4>
        {meal.order}. {meal.name}
      </h4>
      <p className="muted">
        {meal.scheduleHint ?? "No schedule hint"}
        {meal.photoRequired ? " · photo required" : ""}
      </p>
      {meal.instructions ? <p className="plan-cue">{meal.instructions}</p> : null}
      {items.length === 0 ? (
        <p className="muted">No food items on this meal.</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${meal.id}:${index}`}>
              <p className="plan-comp-name">
                {item.name} · {item.portionLabel}
              </p>
              {macroText(item) ? <p className="muted">{macroText(item)}</p> : null}
              {item.sourceFoodLibraryItemId ? (
                <p className="muted plan-comp-source">
                  Library snapshot {item.sourceFoodLibraryItemId}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function PlanCompositionFields({
  content,
  onChange,
  sections,
  allowDuplicate,
  renderWorkoutLibrary,
  renderMealLibrary,
}: {
  content: PlanContent;
  onChange: EditorChange;
  sections: PlanCompositionSections;
  allowDuplicate: boolean;
  renderWorkoutLibrary?: (day: WorkoutDay | null) => ReactNode;
  renderMealLibrary?: (meal: MealPrescription | null) => ReactNode;
}) {
  const days = sortedByOrder(content.workoutDays);
  const meals = sortedByOrder(content.mealPrescriptions);
  const [dayId, setDayId] = useState(days[0]?.id ?? "");
  const [mealId, setMealId] = useState(meals[0]?.id ?? "");

  useEffect(() => {
    if (!days.some((day) => day.id === dayId)) {
      setDayId(days[0]?.id ?? "");
    }
  }, [dayId, days]);

  useEffect(() => {
    if (!meals.some((meal) => meal.id === mealId)) {
      setMealId(meals[0]?.id ?? "");
    }
  }, [mealId, meals]);

  const selectedDay = days.find((day) => day.id === dayId) ?? null;
  const selectedMeal = meals.find((meal) => meal.id === mealId) ?? null;
  const showWorkout = sections !== "nutrition";
  const showMeals = sections !== "workout";

  return (
    <div className="plan-comp">
      <p className="muted">
        {sections === "both"
          ? "Ordered days, exercises, set targets, meals, and food snapshots. "
          : showWorkout
            ? "Ordered days, exercises, and set targets. "
            : "Ordered meals and food snapshots. "}
        Up to {PLAN_COMPOSITION_LIMITS.workoutDays} days,{" "}
        {PLAN_COMPOSITION_LIMITS.exercisesPerDay} exercises a day,{" "}
        {PLAN_COMPOSITION_LIMITS.setsPerExercise} sets an exercise,{" "}
        {PLAN_COMPOSITION_LIMITS.meals} meals, and{" "}
        {PLAN_COMPOSITION_LIMITS.itemsPerMeal} foods a meal.
      </p>
      {showWorkout ? (
      <section className="plan-comp-block" aria-labelledby="plan-comp-edit-workout">
        <h3 id="plan-comp-edit-workout" className="plan-section-title">
          Workout
        </h3>
        <div
          className={
            renderWorkoutLibrary
              ? "plan-comp-columns has-library"
              : "plan-comp-columns"
          }
        >
          <div className="plan-comp-rail">
            <ul className="plan-split-list">
              {days.map((day, index) => (
                <li key={day.id}>
                  <button
                    type="button"
                    className={
                      day.id === selectedDay?.id
                        ? "plan-split-day is-selected"
                        : "plan-split-day"
                    }
                    onClick={() => setDayId(day.id)}
                  >
                    <span className="plan-split-label">
                      {day.order}. {day.name || "Untitled day"}
                    </span>
                    <span className="muted">
                      {day.exercises.length}{" "}
                      {day.exercises.length === 1 ? "exercise" : "exercises"}
                    </span>
                  </button>
                  <div className="plan-comp-row-actions">
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={index === 0}
                      onClick={() => onChange(moveWorkoutDay(content, day.id, -1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={index === days.length - 1}
                      onClick={() => onChange(moveWorkoutDay(content, day.id, 1))}
                    >
                      Down
                    </button>
                    {allowDuplicate ? (
                      <button
                        type="button"
                        className="button-ghost"
                        disabled={days.length >= PLAN_COMPOSITION_LIMITS.workoutDays}
                        onClick={() => onChange(duplicateWorkoutDay(content, day.id))}
                      >
                        Duplicate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => onChange(removeWorkoutDay(content, day.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button-secondary"
              disabled={days.length >= PLAN_COMPOSITION_LIMITS.workoutDays}
              onClick={() => {
                const next = addWorkoutDay(content);
                onChange(next);
                const added = next.workoutDays[next.workoutDays.length - 1];
                if (added) setDayId(added.id);
              }}
            >
              Add day
            </button>
          </div>
          <div className="plan-comp-main">
            {selectedDay ? (
              <DayFields
                content={content}
                day={selectedDay}
                allowDuplicate={allowDuplicate}
                onChange={onChange}
              />
            ) : (
              <p className="muted">Add a workout day, or keep this draft to meals.</p>
            )}
          </div>
          {renderWorkoutLibrary ? (
            <aside className="plan-comp-library" aria-label="Exercise library">
              {renderWorkoutLibrary(selectedDay)}
            </aside>
          ) : null}
        </div>
      </section>
      ) : null}
      {showMeals ? (
      <section className="plan-comp-block" aria-labelledby="plan-comp-edit-meals">
        <h3 id="plan-comp-edit-meals" className="plan-section-title">
          Meals
        </h3>
        <div
          className={
            renderMealLibrary ? "plan-comp-columns has-library" : "plan-comp-columns"
          }
        >
          <div className="plan-comp-rail">
            <ul className="plan-split-list">
              {meals.map((meal, index) => (
                <li key={meal.id}>
                  <button
                    type="button"
                    className={
                      meal.id === selectedMeal?.id
                        ? "plan-split-day is-selected"
                        : "plan-split-day"
                    }
                    onClick={() => setMealId(meal.id)}
                  >
                    <span className="plan-split-label">
                      {meal.order}. {meal.name || "Untitled meal"}
                    </span>
                    <span className="muted">
                      {(meal.items ?? []).length}{" "}
                      {(meal.items ?? []).length === 1 ? "food" : "foods"}
                    </span>
                  </button>
                  <div className="plan-comp-row-actions">
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={index === 0}
                      onClick={() => onChange(moveMeal(content, meal.id, -1))}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={index === meals.length - 1}
                      onClick={() => onChange(moveMeal(content, meal.id, 1))}
                    >
                      Down
                    </button>
                    {allowDuplicate ? (
                      <button
                        type="button"
                        className="button-ghost"
                        disabled={meals.length >= PLAN_COMPOSITION_LIMITS.meals}
                        onClick={() => onChange(duplicateMeal(content, meal.id))}
                      >
                        Duplicate
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="button-ghost"
                      onClick={() => onChange(removeMeal(content, meal.id))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button-secondary"
              disabled={meals.length >= PLAN_COMPOSITION_LIMITS.meals}
              onClick={() => {
                const next = addMeal(content);
                onChange(next);
                const added = next.mealPrescriptions[next.mealPrescriptions.length - 1];
                if (added) setMealId(added.id);
              }}
            >
              Add meal
            </button>
          </div>
          <div className="plan-comp-main">
            {selectedMeal ? (
              <MealFields
                content={content}
                meal={selectedMeal}
                allowDuplicate={allowDuplicate}
                onChange={onChange}
              />
            ) : (
              <p className="muted">Add a meal to edit food snapshots.</p>
            )}
          </div>
          {renderMealLibrary ? (
            <aside className="plan-comp-library" aria-label="Food library">
              {renderMealLibrary(selectedMeal)}
            </aside>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}

function DayFields({
  content,
  day,
  allowDuplicate,
  onChange,
}: {
  content: PlanContent;
  day: WorkoutDay;
  allowDuplicate: boolean;
  onChange: EditorChange;
}) {
  const exercises = sortedByOrder(day.exercises);
  return (
    <div className="plan-comp-stack">
      <label className="field">
        <span>Day name</span>
        <input
          value={day.name}
          maxLength={120}
          onChange={(event) =>
            onChange(updateWorkoutDayName(content, day.id, event.target.value))
          }
          required
        />
      </label>
      {exercises.map((exercise, index) => (
        <ExerciseFields
          key={exercise.id}
          content={content}
          dayId={day.id}
          exercise={exercise}
          index={index}
          count={exercises.length}
          allowDuplicate={allowDuplicate}
          onChange={onChange}
        />
      ))}
      <button
        type="button"
        className="button-secondary"
        disabled={exercises.length >= PLAN_COMPOSITION_LIMITS.exercisesPerDay}
        onClick={() => onChange(addExercise(content, day.id))}
      >
        Add exercise
      </button>
    </div>
  );
}

function ExerciseFields({
  content,
  dayId,
  exercise,
  index,
  count,
  allowDuplicate,
  onChange,
}: {
  content: PlanContent;
  dayId: string;
  exercise: WorkoutExercise;
  index: number;
  count: number;
  allowDuplicate: boolean;
  onChange: EditorChange;
}) {
  const sets = sortedByOrder(exercise.setTargets);
  return (
    <article className="plan-exercise-card">
      <div className="plan-comp-card-head">
        <label className="field plan-exercise-name">
          <span>Exercise</span>
          <input
            value={exercise.name}
            maxLength={120}
            aria-invalid={exercise.name.trim() === ""}
            onChange={(event) =>
              onChange(
                updateExercise(content, dayId, exercise.id, {
                  name: event.target.value,
                }),
              )
            }
            required
          />
        </label>
        <div className="plan-comp-row-actions">
          <button
            type="button"
            className="button-ghost"
            disabled={index === 0}
            onClick={() => onChange(moveExercise(content, dayId, exercise.id, -1))}
          >
            Up
          </button>
          <button
            type="button"
            className="button-ghost"
            disabled={index === count - 1}
            onClick={() => onChange(moveExercise(content, dayId, exercise.id, 1))}
          >
            Down
          </button>
          {allowDuplicate ? (
            <button
              type="button"
              className="button-ghost"
              disabled={count >= PLAN_COMPOSITION_LIMITS.exercisesPerDay}
              onClick={() =>
                onChange(duplicateExercise(content, dayId, exercise.id))
              }
            >
              Duplicate
            </button>
          ) : null}
          <button
            type="button"
            className="button-ghost"
            onClick={() => onChange(removeExercise(content, dayId, exercise.id))}
          >
            Remove
          </button>
        </div>
      </div>
      <label className="field">
        <span>Instructions</span>
        <textarea
          value={exercise.instructions ?? ""}
          maxLength={2000}
          rows={2}
          onChange={(event) =>
            onChange(
              updateExercise(content, dayId, exercise.id, {
                instructions: blankToNull(event.target.value),
              }),
            )
          }
        />
      </label>
      <table className="plan-sets-table">
        <thead>
          <tr>
            <th scope="col">Set</th>
            <th scope="col">Load</th>
            <th scope="col">Reps</th>
            <th scope="col">RPE</th>
            <th scope="col">
              <span className="sr-only">Remove set</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sets.map((target) => (
            <tr key={target.id}>
              <td>{target.order}</td>
              <td>
                <input
                  value={target.loadLabel ?? ""}
                  maxLength={80}
                  aria-label={`Set ${target.order} load`}
                  onChange={(event) =>
                    onChange(
                      updateSetTarget(content, dayId, exercise.id, target.id, {
                        loadLabel: blankToNull(event.target.value),
                      }),
                    )
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={target.reps ?? ""}
                  aria-label={`Set ${target.order} reps`}
                  onChange={(event) =>
                    onChange(
                      updateSetTarget(content, dayId, exercise.id, target.id, {
                        reps: optionalInt(event.target.value),
                      }),
                    )
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step="0.5"
                  value={target.rpe ?? ""}
                  aria-label={`Set ${target.order} RPE`}
                  onChange={(event) =>
                    onChange(
                      updateSetTarget(content, dayId, exercise.id, target.id, {
                        rpe: optionalNumber(event.target.value),
                      }),
                    )
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="button-ghost"
                  onClick={() =>
                    onChange(removeSetTarget(content, dayId, exercise.id, target.id))
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="button-ghost"
        disabled={sets.length >= PLAN_COMPOSITION_LIMITS.setsPerExercise}
        onClick={() => onChange(addSetTarget(content, dayId, exercise.id))}
      >
        Add set
      </button>
    </article>
  );
}

function MealFields({
  content,
  meal,
  allowDuplicate,
  onChange,
}: {
  content: PlanContent;
  meal: MealPrescription;
  allowDuplicate: boolean;
  onChange: EditorChange;
}) {
  const items = meal.items ?? [];
  return (
    <div className="plan-comp-stack">
      <label className="field">
        <span>Meal name</span>
        <input
          value={meal.name}
          maxLength={120}
          onChange={(event) =>
            onChange(updateMeal(content, meal.id, { name: event.target.value }))
          }
          required
        />
      </label>
      <label className="field">
        <span>Schedule hint</span>
        <input
          value={meal.scheduleHint ?? ""}
          maxLength={120}
          onChange={(event) =>
            onChange(
              updateMeal(content, meal.id, {
                scheduleHint: blankToNull(event.target.value),
              }),
            )
          }
        />
      </label>
      <label className="field">
        <span>Instructions</span>
        <textarea
          value={meal.instructions ?? ""}
          maxLength={2000}
          rows={2}
          onChange={(event) =>
            onChange(
              updateMeal(content, meal.id, {
                instructions: blankToNull(event.target.value),
              }),
            )
          }
        />
      </label>
      <label className="field plan-comp-check">
        <input
          type="checkbox"
          checked={meal.photoRequired}
          onChange={(event) =>
            onChange(
              updateMeal(content, meal.id, { photoRequired: event.target.checked }),
            )
          }
        />
        <span>Photo required</span>
      </label>
      {items.map((item, index) => (
        <FoodFields
          key={`${meal.id}:${index}`}
          content={content}
          mealId={meal.id}
          item={item}
          index={index}
          count={items.length}
          allowDuplicate={allowDuplicate}
          onChange={onChange}
        />
      ))}
      <button
        type="button"
        className="button-secondary"
        disabled={items.length >= PLAN_COMPOSITION_LIMITS.itemsPerMeal}
        onClick={() => onChange(addFoodItem(content, meal.id))}
      >
        Add food
      </button>
    </div>
  );
}

function FoodFields({
  content,
  mealId,
  item,
  index,
  count,
  allowDuplicate,
  onChange,
}: {
  content: PlanContent;
  mealId: string;
  item: MealFoodItem;
  index: number;
  count: number;
  allowDuplicate: boolean;
  onChange: EditorChange;
}) {
  function patch(next: Partial<MealFoodItem>) {
    onChange(updateFoodItem(content, mealId, index, next));
  }

  return (
    <article className="plan-exercise-card">
      <div className="plan-comp-card-head">
        <p className="plan-comp-name">Food {index + 1}</p>
        <div className="plan-comp-row-actions">
          <button
            type="button"
            className="button-ghost"
            disabled={index === 0}
            onClick={() => onChange(moveFoodItem(content, mealId, index, -1))}
          >
            Up
          </button>
          <button
            type="button"
            className="button-ghost"
            disabled={index === count - 1}
            onClick={() => onChange(moveFoodItem(content, mealId, index, 1))}
          >
            Down
          </button>
          {allowDuplicate ? (
            <button
              type="button"
              className="button-ghost"
              disabled={count >= PLAN_COMPOSITION_LIMITS.itemsPerMeal}
              onClick={() => onChange(duplicateFoodItem(content, mealId, index))}
            >
              Duplicate
            </button>
          ) : null}
          <button
            type="button"
            className="button-ghost"
            onClick={() => onChange(removeFoodItem(content, mealId, index))}
          >
            Remove
          </button>
        </div>
      </div>
      {item.sourceFoodLibraryItemId ? (
        <p className="muted plan-comp-source">
          Library snapshot {item.sourceFoodLibraryItemId}
        </p>
      ) : null}
      <div className="plan-comp-food-grid">
        <label className="field">
          <span>Name</span>
          <input
            value={item.name}
            maxLength={120}
            aria-invalid={item.name.trim() === ""}
            onChange={(event) => patch({ name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Portion</span>
          <input
            value={item.portionLabel}
            maxLength={120}
            aria-invalid={item.portionLabel.trim() === ""}
            onChange={(event) => patch({ portionLabel: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Calories</span>
          <input
            type="number"
            min={0}
            max={20000}
            value={item.calories ?? ""}
            onChange={(event) => patch({ calories: optionalInt(event.target.value) })}
          />
        </label>
        <label className="field">
          <span>Protein (g)</span>
          <input
            type="number"
            min={0}
            max={2000}
            step="0.1"
            value={item.proteinGrams ?? ""}
            onChange={(event) =>
              patch({ proteinGrams: optionalNumber(event.target.value) })
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
            value={item.carbsGrams ?? ""}
            onChange={(event) =>
              patch({ carbsGrams: optionalNumber(event.target.value) })
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
            value={item.fatGrams ?? ""}
            onChange={(event) =>
              patch({ fatGrams: optionalNumber(event.target.value) })
            }
          />
        </label>
      </div>
    </article>
  );
}
