import { useEffect, useRef, useState } from "react";
import {
  NUTRIENT_SCALE,
  type FoodLibraryItem,
  type MealFoodItem,
  type MealPrescription,
  type MealType,
  type PlanContent,
} from "@fitbud/contracts";
import {
  dayMacrosFromScaledItems,
  foodSnapshotFromLibrary,
  formatScaledQuantity,
  materializeFoodSnapshot,
} from "@fitbud/core";
import { apiClient } from "../../lib/api";
import {
  PLAN_COMPOSITION_LIMITS,
  addMeal,
  duplicateMeal,
  moveMeal,
  removeFoodItem,
  removeMeal,
  sortedMealsByTime,
  updateFoodItem,
  updateMeal,
} from "../plan-composition";
import { WEEK_ORDER, WEEKDAY_INITIAL, weekdayShort } from "./weekdays";

const MEAL_TYPE_OPTIONS: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "snack", label: "Snack" },
  { value: "dinner", label: "Dinner" },
  { value: "other", label: "Pre/post-workout or other" },
];

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type MealDay = number | "all";

type Nutrient = "energyKcalScaled" | "proteinScaled" | "carbsScaled" | "fatScaled";

function scaledToNumber(value: number | null | undefined, decimals: number): string {
  if (value == null) return "—";
  const factor = 10 ** decimals;
  return String(Math.round((value / NUTRIENT_SCALE) * factor) / factor);
}

function unknownCount(items: readonly MealFoodItem[], key: Nutrient): number {
  return items.filter((item) => item.calculated?.[key] == null).length;
}

function totalsFor(items: readonly MealFoodItem[]) {
  const totals = dayMacrosFromScaledItems(items.map((item) => item.calculated));
  return {
    kcal: totals.kcal,
    protein: totals.proteinG,
    carbs: totals.carbsG,
    fat: totals.fatG,
    unknownKcal: unknownCount(items, "energyKcalScaled"),
    unknownProtein: unknownCount(items, "proteinScaled"),
    unknownCarbs: unknownCount(items, "carbsScaled"),
    unknownFat: unknownCount(items, "fatScaled"),
  };
}

function TotalsLine({ items, label }: { items: readonly MealFoodItem[]; label?: string }) {
  const totals = totalsFor(items);
  const prefix = (count: number) => (count > 0 ? "≥ " : "");
  return (
    <div className="meal-totals">
      {label ? <span className="meal-totals-label">{label}</span> : null}
      <span className="meal-totals-main">
        {prefix(totals.unknownKcal)}
        {totals.kcal} kcal
      </span>
      <span>
        P {prefix(totals.unknownProtein)}
        {totals.protein} g
      </span>
      <span>
        C {prefix(totals.unknownCarbs)}
        {totals.carbs} g
      </span>
      <span>
        F {prefix(totals.unknownFat)}
        {totals.fat} g
      </span>
      {totals.unknownKcal > 0 ? (
        <span className="meal-totals-note">
          +{totals.unknownKcal} {totals.unknownKcal === 1 ? "item" : "items"} with unknown calories
        </span>
      ) : null}
    </div>
  );
}

function NutrientCell({ value, suffix }: { value: number | null | undefined; suffix: string }) {
  if (value == null) {
    return (
      <span className="nutrient-unknown" title="Not known for this food">
        —
      </span>
    );
  }
  return (
    <span>
      {scaledToNumber(value, suffix === "kcal" ? 0 : 1)} {suffix}
    </span>
  );
}

const libraryCache = new Map<string, Promise<FoodLibraryItem | null>>();

function loadLibraryFood(id: string, name: string): Promise<FoodLibraryItem | null> {
  const cached = libraryCache.get(id);
  if (cached) return cached;
  const request = apiClient
    .listFoodLibrary({ q: name, limit: 25 })
    .then((page) => page.items.find((item) => item.id === id) ?? null)
    .catch(() => null);
  libraryCache.set(id, request);
  return request;
}

function FoodItemRow({
  item,
  index,
  mealId,
  readOnly,
  onChange,
}: {
  item: MealFoodItem;
  index: number;
  mealId: string;
  readOnly: boolean;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
}) {
  const sourceId = item.sourceFoodLibraryItemId;
  const [library, setLibrary] = useState<FoodLibraryItem | null>(null);
  useEffect(() => {
    if (!sourceId || item.snapshotKind !== "calculated") return;
    let live = true;
    void loadLibraryFood(sourceId, item.name).then((found) => {
      if (live) setLibrary(found);
    });
    return () => {
      live = false;
    };
  }, [sourceId, item.name, item.snapshotKind]);

  const servings = (library?.servings ?? []).filter((s) => s.conversionScaled != null);
  const currentServingId =
    item.snapshotKind === "calculated"
      ? (item.sourceServingId ??
        servings.find((s) => s.label === item.serving.label)?.id ??
        "")
      : "";
  const quantity =
    item.snapshotKind === "calculated" ? item.quantityScaled / NUTRIENT_SCALE : 1;

  function setQuantity(next: number) {
    if (item.snapshotKind !== "calculated" || !(next > 0)) return;
    const quantityScaled = Math.min(
      Math.round(next * NUTRIENT_SCALE),
      NUTRIENT_SCALE * 100,
    );
    onChange((current) =>
      updateFoodItem(
        current,
        mealId,
        index,
        materializeFoodSnapshot({ ...item, quantityScaled }),
      ),
    );
  }

  function setServing(servingId: string) {
    if (!library || item.snapshotKind !== "calculated") return;
    try {
      const next = foodSnapshotFromLibrary(library, servingId, item.quantityScaled);
      onChange((current) => updateFoodItem(current, mealId, index, next));
    } catch {
      /* Incomplete library foods keep their current serving. */
    }
  }

  return (
    <li className="food-item">
      <div className="food-item-main">
        <p className="food-name">{item.name}</p>
        <p className="food-caption">
          {sourceId ? "From library · snapshot" : "Manual item · nutrition not entered"}
        </p>
      </div>
      <div className="food-item-controls">
        {item.snapshotKind === "calculated" ? (
          <>
            <label className="field food-serving">
              <span className="sr-only">Serving for {item.name}</span>
              <select
                value={currentServingId}
                disabled={readOnly || servings.length === 0}
                onChange={(event) => setServing(event.target.value)}
              >
                {servings.length === 0 || !currentServingId ? (
                  <option value="">{item.serving.label}</option>
                ) : null}
                {servings.map((serving) => (
                  <option key={serving.id} value={serving.id}>
                    {serving.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="stepper" role="group" aria-label={`Quantity of ${item.name}`}>
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={readOnly || quantity <= 0.5}
                onClick={() => setQuantity(quantity - 0.5)}
              >
                −
              </button>
              <input
                type="number"
                min={0.5}
                step={0.5}
                aria-label={`Quantity of ${item.name}`}
                value={formatScaledQuantity(item.quantityScaled)}
                disabled={readOnly}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={readOnly}
                onClick={() => setQuantity(quantity + 0.5)}
              >
                +
              </button>
            </div>
          </>
        ) : (
          <span className="food-serving-text">{item.serving.label}</span>
        )}
        <span className="food-macros">
          <NutrientCell value={item.calculated?.energyKcalScaled} suffix="kcal" />
          <NutrientCell value={item.calculated?.proteinScaled} suffix="P" />
          <NutrientCell value={item.calculated?.carbsScaled} suffix="C" />
          <NutrientCell value={item.calculated?.fatScaled} suffix="F" />
        </span>
        {readOnly ? null : (
          <button
            type="button"
            className="button-ghost button-sm"
            aria-label={`Remove ${item.name}`}
            onClick={() => onChange((current) => removeFoodItem(current, mealId, index))}
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function ManualItemForm({
  onAdd,
  onCancel,
}: {
  onAdd: (item: MealFoodItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [portion, setPortion] = useState("1 bowl");
  return (
    <form
      className="manual-item"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !portion.trim()) return;
        onAdd({
          snapshotKind: "legacy",
          name: name.trim(),
          classification: null,
          basis: null,
          canonical: null,
          serving: { label: portion.trim(), unit: "portion", conversionScaled: null },
          quantityScaled: NUTRIENT_SCALE,
          calculated: {
            energyKcalScaled: null,
            proteinScaled: null,
            carbsScaled: null,
            fatScaled: null,
            partial: true,
          },
        });
      }}
    >
      <label className="field">
        <span>Food</span>
        <input
          value={name}
          maxLength={120}
          placeholder="Home-cooked dal"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span>Portion</span>
        <input
          value={portion}
          maxLength={120}
          onChange={(event) => setPortion(event.target.value)}
          required
        />
      </label>
      <p className="muted">Nutrition stays unknown for manual items.</p>
      <div className="button-row">
        <button type="submit" className="button-secondary button-sm">
          Add item
        </button>
        <button type="button" className="button-ghost button-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function appliesOn(meal: MealPrescription, day: MealDay): boolean {
  if (day === "all") return true;
  return (meal.applicableWeekdays ?? []).includes(day);
}

export function MealDaysPane({
  content,
  selectedDay,
  onSelectDay,
  selectedMealId,
  onChange,
  readOnly = false,
}: {
  content: PlanContent;
  selectedDay: MealDay;
  onSelectDay: (day: MealDay) => void;
  selectedMealId: string | null;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
}) {
  const meals = content.mealPrescriptions;
  const selected = meals.find((meal) => meal.id === selectedMealId) ?? null;
  const trainingDays = Array.from(
    new Set(
      content.workoutDays
        .map((day) => day.weekday)
        .filter((weekday): weekday is number => weekday != null),
    ),
  );
  const restDays = ALL_DAYS.filter((weekday) => !trainingDays.includes(weekday));
  const applicable = selected?.applicableWeekdays ?? [];
  const sameSet = (a: readonly number[], b: readonly number[]) =>
    a.length === b.length && a.every((value) => b.includes(value));
  const pattern = !selected
    ? null
    : sameSet(applicable, ALL_DAYS)
      ? "every"
      : trainingDays.length > 0 && sameSet(applicable, trainingDays)
        ? "training"
        : trainingDays.length > 0 && restDays.length > 0 && sameSet(applicable, restDays)
          ? "rest"
          : "pick";

  function setDays(days: number[]) {
    if (!selected) return;
    onChange((current) => updateMeal(current, selected.id, { applicableWeekdays: days }));
  }

  return (
    <nav className="days-pane meal-days-pane" aria-label="Day applicability">
      <h2 className="builder-pane-title">Days</h2>
      <ul className="days-list">
        <li className="day-row">
          <button
            type="button"
            className={selectedDay === "all" ? "day-session is-selected" : "day-session"}
            aria-current={selectedDay === "all" ? "true" : undefined}
            onClick={() => onSelectDay("all")}
          >
            <span className="day-session-name">Every day</span>
            <span className="day-session-meta">{meals.length} meals in plan</span>
          </button>
        </li>
        {WEEK_ORDER.map((weekday) => {
          const count = meals.filter((meal) => appliesOn(meal, weekday)).length;
          return (
            <li key={weekday} className="day-row">
              <span className="day-weekday">{weekdayShort(weekday)}</span>
              <button
                type="button"
                className={selectedDay === weekday ? "day-session is-selected" : "day-session"}
                aria-current={selectedDay === weekday ? "true" : undefined}
                onClick={() => onSelectDay(weekday)}
              >
                <span className="day-session-name">
                  {count === 0 ? "No meals" : `${count} ${count === 1 ? "meal" : "meals"}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <fieldset className="applicability" disabled={readOnly}>
          <legend>{selected.name} applies to</legend>
          <label className="radio-line">
            <input
              type="radio"
              name="meal-pattern"
              checked={pattern === "every"}
              onChange={() => setDays(ALL_DAYS)}
            />
            Every day
          </label>
          {trainingDays.length > 0 && restDays.length > 0 ? (
            <>
              <label className="radio-line">
                <input
                  type="radio"
                  name="meal-pattern"
                  checked={pattern === "training"}
                  onChange={() => setDays(trainingDays)}
                />
                Training days
              </label>
              <label className="radio-line">
                <input
                  type="radio"
                  name="meal-pattern"
                  checked={pattern === "rest"}
                  onChange={() => setDays(restDays)}
                />
                Rest days
              </label>
            </>
          ) : null}
          <label className="radio-line">
            <input
              type="radio"
              name="meal-pattern"
              checked={pattern === "pick"}
              onChange={() => setDays(applicable.length > 0 ? applicable : [1, 2, 3, 4, 5])}
            />
            Pick days
          </label>
          <div className="weekday-chips" role="group" aria-label="Applicable days">
            {WEEK_ORDER.map((weekday) => {
              const on = applicable.includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  className={on ? "weekday-chip is-on" : "weekday-chip"}
                  aria-pressed={on}
                  aria-label={weekdayShort(weekday)}
                  onClick={() =>
                    setDays(
                      on
                        ? applicable.filter((value) => value !== weekday)
                        : [...applicable, weekday],
                    )
                  }
                >
                  {WEEKDAY_INITIAL[weekday]}
                </button>
              );
            })}
          </div>
          {applicable.length === 0 ? (
            <p className="field-error">Pick at least one day or this meal won&apos;t be scheduled.</p>
          ) : null}
        </fieldset>
      ) : (
        <p className="muted">Select a meal to set the days it applies to.</p>
      )}
    </nav>
  );
}

export function MealsPane({
  content,
  selectedDay,
  selectedMealId,
  onSelectMeal,
  onChange,
  readOnly = false,
  photoRequirement,
  onOpenLibrary,
  showLibraryToggle = false,
}: {
  content: PlanContent;
  selectedDay: MealDay;
  selectedMealId: string | null;
  onSelectMeal: (mealId: string) => void;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
  photoRequirement?: "none" | "selected_meals" | "all_meals" | null;
  onOpenLibrary?: () => void;
  showLibraryToggle?: boolean;
}) {
  const [manualFor, setManualFor] = useState<string | null>(null);
  const meals = sortedMealsByTime(content.mealPrescriptions);
  const visible = meals.filter((meal) => appliesOn(meal, selectedDay));
  const previousCount = useRef(meals.length);
  useEffect(() => {
    if (meals.length > previousCount.current) {
      const last = meals[meals.length - 1];
      if (last) onSelectMeal(last.id);
    }
    previousCount.current = meals.length;
  }, [meals, onSelectMeal]);

  const dayItems = visible.flatMap((meal) => meal.items ?? []);
  const dayLabel =
    selectedDay === "all" ? "All meals in the plan" : `Total for ${weekdayShort(selectedDay)}`;

  return (
    <div className="meals-pane">
      <div className="meals-scroll">
        {visible.length === 0 ? (
          <div className="session-empty" data-testid="meals-empty">
            <h2>{meals.length === 0 ? "No meals yet" : "No meals on this day"}</h2>
            <p className="muted">
              {meals.length === 0
                ? "Add a meal slot, then add foods from the library."
                : "Add a meal, or change which days an existing meal applies to."}
            </p>
          </div>
        ) : (
          <ol className="meal-list">
            {visible.map((meal, index) => {
              const items = meal.items ?? [];
              const missingTime = !meal.localTime;
              const isSelected = meal.id === selectedMealId;
              return (
                <li
                  key={meal.id}
                  className={isSelected ? "meal-card is-selected" : "meal-card"}
                  onClick={() => onSelectMeal(meal.id)}
                >
                  <div className="meal-head">
                    <label className="field">
                      <span>Meal type</span>
                      <select
                        value={meal.mealType ?? "other"}
                        disabled={readOnly}
                        onChange={(event) =>
                          onChange((current) =>
                            updateMeal(current, meal.id, {
                              mealType: event.target.value as MealType,
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
                    <label className="field">
                      <span>Label</span>
                      <input
                        value={meal.name}
                        maxLength={120}
                        disabled={readOnly}
                        onChange={(event) =>
                          onChange((current) =>
                            updateMeal(current, meal.id, { name: event.target.value }),
                          )
                        }
                      />
                    </label>
                    <label className={missingTime ? "field has-error" : "field"}>
                      <span>Time</span>
                      <input
                        type="time"
                        required
                        value={meal.localTime ?? ""}
                        disabled={readOnly}
                        aria-invalid={missingTime}
                        onChange={(event) =>
                          onChange((current) =>
                            updateMeal(current, meal.id, {
                              localTime: event.target.value || null,
                            }),
                          )
                        }
                      />
                    </label>
                  </div>
                  {missingTime ? (
                    <p className="field-error">
                      Set a time for {meal.name} so reminders work. The client can adjust their
                      own time later.
                    </p>
                  ) : null}

                  <ul className="food-list">
                    {items.length === 0 ? (
                      <li className="food-empty">
                        {showLibraryToggle && onOpenLibrary ? (
                          <button type="button" className="button-link" onClick={onOpenLibrary}>
                            Add foods from the library →
                          </button>
                        ) : (
                          "Add foods from the library →"
                        )}
                      </li>
                    ) : (
                      items.map((item, itemIndex) => (
                        <FoodItemRow
                          key={`${meal.id}-${itemIndex}-${item.name}`}
                          item={item}
                          index={itemIndex}
                          mealId={meal.id}
                          readOnly={readOnly}
                          onChange={onChange}
                        />
                      ))
                    )}
                  </ul>
                  {manualFor === meal.id ? (
                    <ManualItemForm
                      onCancel={() => setManualFor(null)}
                      onAdd={(item) => {
                        onChange((current) => ({
                          ...current,
                          mealPrescriptions: current.mealPrescriptions.map((candidate) =>
                            candidate.id === meal.id &&
                            (candidate.items ?? []).length < PLAN_COMPOSITION_LIMITS.itemsPerMeal
                              ? { ...candidate, items: [...(candidate.items ?? []), item] }
                              : candidate,
                          ),
                        }));
                        setManualFor(null);
                      }}
                    />
                  ) : readOnly ? null : (
                    <button
                      type="button"
                      className="button-ghost button-sm"
                      onClick={() => setManualFor(meal.id)}
                    >
                      + Add manual item
                    </button>
                  )}

                  <TotalsLine items={items} label="Slot total" />

                  <div className="meal-foot">
                    {photoRequirement === "selected_meals" ? (
                      <label className="switch-line">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={meal.photoRequired}
                          disabled={readOnly}
                          onChange={(event) =>
                            onChange((current) =>
                              updateMeal(current, meal.id, {
                                photoRequired: event.target.checked,
                              }),
                            )
                          }
                        />
                        Photo requested
                      </label>
                    ) : null}
                    <label className="field meal-instructions">
                      <span>Instructions</span>
                      <input
                        value={meal.instructions ?? ""}
                        maxLength={2000}
                        placeholder="Optional note for the client"
                        disabled={readOnly}
                        onChange={(event) =>
                          onChange((current) =>
                            updateMeal(current, meal.id, {
                              instructions: event.target.value || null,
                            }),
                          )
                        }
                      />
                    </label>
                    {readOnly ? null : (
                      <span className="meal-actions">
                        <button
                          type="button"
                          className="button-ghost button-sm"
                          disabled={index === 0}
                          onClick={() => onChange((current) => moveMeal(current, meal.id, -1))}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="button-ghost button-sm"
                          disabled={index === visible.length - 1}
                          onClick={() => onChange((current) => moveMeal(current, meal.id, 1))}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="button-ghost button-sm"
                          onClick={() => onChange((current) => duplicateMeal(current, meal.id))}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="button-ghost button-sm"
                          onClick={() => onChange((current) => removeMeal(current, meal.id))}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {readOnly ? null : (
          <button
            type="button"
            className="button-secondary meals-add"
            disabled={meals.length >= PLAN_COMPOSITION_LIMITS.meals}
            onClick={() => onChange((current) => addMeal(current))}
          >
            + Add meal
          </button>
        )}
      </div>
      <div className="day-total-bar" data-testid="day-total-bar">
        <TotalsLine items={dayItems} label={dayLabel} />
      </div>
    </div>
  );
}
