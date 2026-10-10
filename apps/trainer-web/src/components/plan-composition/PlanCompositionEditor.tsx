import { useEffect, useState, type ReactNode } from "react";
import {
  NUTRIENT_SCALE,
  legacyPortionToSnapshot,
  scaleDecimal,
  type MealFoodItem,
  type MealPrescription,
  type PlanContent,
  type WorkoutDay,
  type WorkoutExercise,
  type WorkoutSetTarget,
} from "@fitbud/contracts";
import {
  aggregateNutrients,
  displayNutrients,
  formatScaledQuantity,
  materializeFoodSnapshot,
} from "@fitbud/core";
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
  updateWorkoutDayWeekday,
} from "./content";

export type PlanCompositionSections = "workout" | "nutrition" | "both";

const WEEKDAY_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
] as const;

const MEAL_TYPE_OPTIONS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
  { value: "other", label: "Other" },
] as const;

function weekdayLabel(weekday: number | null | undefined): string {
  return WEEKDAY_OPTIONS.find((option) => option.value === weekday)?.label ?? "No weekday";
}

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
  const shown = displayNutrients(aggregateNutrients([item.calculated]));
  const parts = [
    shown.energyKcal != null ? `${shown.energyKcal} kcal` : "energy unknown",
    shown.proteinGrams != null ? `P ${shown.proteinGrams} g` : "protein unknown",
    shown.carbsGrams != null ? `C ${shown.carbsGrams} g` : "carbs unknown",
    shown.fatGrams != null ? `F ${shown.fatGrams} g` : "fat unknown",
  ];
  if (shown.partial) parts.push("partial");
  return parts.join(" · ");
}

function foodPortionText(item: MealFoodItem): string {
  if (item.snapshotKind === "legacy") return item.serving.label;
  return `${formatScaledQuantity(item.quantityScaled)} × ${item.serving.label}`;
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
                <p className="muted">{weekdayLabel(day.weekday)}</p>
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
        {meal.mealType ?? "Meal"}
        {meal.localTime ? ` · ${meal.localTime}` : ""}
        {" · "}
        {(meal.applicableWeekdays ?? []).length > 0
          ? (meal.applicableWeekdays ?? []).map((weekday) => weekdayLabel(weekday)).join(", ")
          : "No weekdays"}
        {meal.photoRequired ? " · photo required" : ""}
      </p>
      {meal.scheduleHint ? (
        <p className="muted">Legacy schedule note: {meal.scheduleHint}</p>
      ) : null}
      {meal.instructions ? <p className="plan-cue">{meal.instructions}</p> : null}
      {items.length === 0 ? (
        <p className="muted">No food items on this meal.</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${meal.id}:${index}`}>
              <p className="plan-comp-name">
                {item.name} · {foodPortionText(item)}
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
        <span>Weekday</span>
        <select
          value={day.weekday ?? ""}
          onChange={(event) =>
            onChange(
              updateWorkoutDayWeekday(content, day.id, Number(event.target.value)),
            )
          }
          required
        >
          <option value="" disabled>
            Choose a weekday
          </option>
          {WEEKDAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
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
        <span>Meal type</span>
        <select
          value={meal.mealType ?? "other"}
          onChange={(event) =>
            onChange(
              updateMeal(content, meal.id, {
                mealType: event.target.value as MealPrescription["mealType"],
              }),
            )
          }
        >
          {MEAL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="field">
        <legend>Applicable weekdays</legend>
        <div className="plan-comp-weekdays">
          {WEEKDAY_OPTIONS.map((option) => {
            const selected = (meal.applicableWeekdays ?? []).includes(option.value);
            return (
              <label key={option.value} className="plan-comp-check">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => {
                    const current = meal.applicableWeekdays ?? [];
                    const applicableWeekdays = selected
                      ? current.filter((weekday) => weekday !== option.value)
                      : [...current, option.value].sort((left, right) => left - right);
                    onChange(updateMeal(content, meal.id, { applicableWeekdays }));
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="field">
        <span>Local time</span>
        <input
          type="time"
          value={meal.localTime ?? ""}
          onChange={(event) =>
            onChange(
              updateMeal(content, meal.id, {
                localTime: blankToNull(event.target.value),
              }),
            )
          }
        />
      </label>
      <label className="field">
        <span>Legacy schedule note</span>
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
      {items.length > 0 ? <MealTotal items={items} /> : null}
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

function MealTotal({ items }: { items: MealFoodItem[] }) {
  const shown = displayNutrients(
    aggregateNutrients(items.map((item) => item.calculated)),
  );
  return (
    <p className="muted">
      {shown.partial
        ? "Meal nutrition is partial. Unknown nutrients are left unknown."
        : "Meal total"}
      {": "}
      {macroText({
        snapshotKind: "legacy",
        name: "total",
        classification: null,
        basis: null,
        canonical: null,
        serving: { label: "total", unit: "portion", conversionScaled: null },
        quantityScaled: NUTRIENT_SCALE,
        calculated: aggregateNutrients(items.map((item) => item.calculated)),
      })}
    </p>
  );
}

function scaledToNumber(value: number | null): number | null {
  if (value == null) return null;
  return value / NUTRIENT_SCALE;
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
  function replace(next: MealFoodItem) {
    onChange(updateFoodItem(content, mealId, index, next));
  }

  function patchLegacy(next: {
    name?: string;
    portionLabel?: string;
    calories?: number | null;
    proteinGrams?: number | null;
    carbsGrams?: number | null;
    fatGrams?: number | null;
  }) {
    if (item.snapshotKind !== "legacy") return;
    replace(
      legacyPortionToSnapshot({
        name: next.name ?? item.name,
        portionLabel: next.portionLabel ?? item.serving.label,
        calories:
          next.calories === undefined
            ? scaledToNumber(item.calculated.energyKcalScaled)
            : next.calories,
        proteinGrams:
          next.proteinGrams === undefined
            ? scaledToNumber(item.calculated.proteinScaled)
            : next.proteinGrams,
        carbsGrams:
          next.carbsGrams === undefined
            ? scaledToNumber(item.calculated.carbsScaled)
            : next.carbsGrams,
        fatGrams:
          next.fatGrams === undefined
            ? scaledToNumber(item.calculated.fatScaled)
            : next.fatGrams,
        ...(item.sourceFoodLibraryItemId
          ? { sourceFoodLibraryItemId: item.sourceFoodLibraryItemId }
          : {}),
      }),
    );
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
      {item.snapshotKind === "calculated" ? (
        <div className="plan-comp-food-grid">
          <p className="plan-comp-name">{item.name}</p>
          <p className="muted">
            {item.serving.label} ({item.serving.unit}) ·{" "}
            {item.basis === "per_100_g" ? "per 100 g" : "per 100 ml"}
          </p>
          <label className="field">
            <span>Quantity</span>
            <input
              type="number"
              min={0.001}
              step="0.5"
              value={formatScaledQuantity(item.quantityScaled)}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed) || parsed <= 0) return;
                try {
                  replace(
                    materializeFoodSnapshot({
                      ...item,
                      quantityScaled: scaleDecimal(parsed),
                    }),
                  );
                } catch {
                  // Keep the previous quantity until the entry is a valid decimal.
                }
              }}
            />
          </label>
          <p className="muted">{macroText(item)}</p>
        </div>
      ) : (
        <div className="plan-comp-food-grid">
          <label className="field">
            <span>Name</span>
            <input
              value={item.name}
              maxLength={120}
              aria-invalid={item.name.trim() === ""}
              onChange={(event) => patchLegacy({ name: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Portion</span>
            <input
              value={item.serving.label}
              maxLength={120}
              aria-invalid={item.serving.label.trim() === ""}
              onChange={(event) => patchLegacy({ portionLabel: event.target.value })}
              required
            />
          </label>
          <label className="field">
            <span>Calories</span>
            <input
              type="number"
              min={0}
              max={20000}
              value={scaledToNumber(item.calculated.energyKcalScaled) ?? ""}
              onChange={(event) =>
                patchLegacy({ calories: optionalInt(event.target.value) })
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
              value={scaledToNumber(item.calculated.proteinScaled) ?? ""}
              onChange={(event) =>
                patchLegacy({ proteinGrams: optionalNumber(event.target.value) })
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
              value={scaledToNumber(item.calculated.carbsScaled) ?? ""}
              onChange={(event) =>
                patchLegacy({ carbsGrams: optionalNumber(event.target.value) })
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
              value={scaledToNumber(item.calculated.fatScaled) ?? ""}
              onChange={(event) =>
                patchLegacy({ fatGrams: optionalNumber(event.target.value) })
              }
            />
          </label>
        </div>
      )}
    </article>
  );
}
