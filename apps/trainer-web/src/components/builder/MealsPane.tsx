import { useEffect, useRef } from "react";
import {
  NUTRIENT_SCALE,
  type MealFoodItem,
  type MealPrescription,
  type PlanContent,
} from "@fitbud/contracts";
import { formatHhMmTime, formatNumber, formatScaledQuantity } from "@fitbud/core";
import { Plus } from "lucide-react";
import { OverflowMenu } from "../OverflowMenu";
import { LibraryThumb } from "../ui";
import {
  PLAN_COMPOSITION_LIMITS,
  addMeal,
  duplicateMeal,
  moveMeal,
  removeMeal,
  sortedMealsByTime,
  updateMeal,
} from "../plan-composition";
import { MacroTiles } from "./MacroTiles";
import { mealItemsLine, mealKcal } from "./formatters";
import { WEEK_ORDER, WEEKDAY_INITIAL, weekdayShort } from "./weekdays";

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export type MealDay = number | "all";

function servingText(item: MealFoodItem): string {
  return item.snapshotKind === "calculated"
    ? `${formatScaledQuantity(item.quantityScaled)} × ${item.serving.label}`
    : item.serving.label;
}

function itemKcal(item: MealFoodItem): string {
  const scaled = item.calculated?.energyKcalScaled;
  return scaled == null ? "—" : formatNumber(Math.round(scaled / NUTRIENT_SCALE));
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
  const planKcal = mealKcal(content.mealPrescriptions.flatMap((meal) => meal.items ?? []));

  return (
    <div className="meals-pane meals-board" data-testid="meals-board">
      <MacroTiles items={dayItems.length > 0 ? dayItems : content.mealPrescriptions.flatMap((m) => m.items ?? [])} />

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
          <ol className="meal-card-list">
            {visible.map((meal, index) => {
              const items = meal.items ?? [];
              const kcal = mealKcal(items);
              const isSelected = meal.id === selectedMealId;
              const time = meal.localTime ? formatHhMmTime(meal.localTime) : "Set a time";
              return (
                <li
                  key={meal.id}
                  className={isSelected ? "meal-card-row is-selected" : "meal-card-row"}
                >
                  <button
                    type="button"
                    className={isSelected ? "meal-summary-card is-selected" : "meal-summary-card"}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => onSelectMeal(meal.id)}
                  >
                    <span className="meal-summary-top">
                      <span className="meal-summary-title">{meal.name}</span>
                      <span className="meal-summary-time">
                        {time}
                        {" · "}
                        <span className="meal-summary-kcal">
                          {kcal != null ? `${formatNumber(kcal)} kcal` : "—"}
                        </span>
                      </span>
                    </span>
                    {items.length === 0 ? (
                      <span className="meal-summary-items">{mealItemsLine(items)}</span>
                    ) : (
                      <span className="meal-food-rows">
                        {items.map((item, itemIndex) => (
                          <span key={`${item.name}-${itemIndex}`} className="meal-food-row">
                            <LibraryThumb name={item.name} kind="food" />
                            <span className="meal-food-copy">
                              <span className="meal-food-name">{item.name}</span>
                              <span className="meal-food-serving">{servingText(item)}</span>
                            </span>
                            <span className="meal-food-kcal">{itemKcal(item)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                  {readOnly ? null : (
                    <span className="meal-card-menu">
                      <OverflowMenu
                        label={`Actions for ${meal.name}`}
                        items={[
                          {
                            id: "up",
                            label: "Move up",
                            disabled: index === 0,
                            onSelect: () => onChange((current) => moveMeal(current, meal.id, -1)),
                          },
                          {
                            id: "down",
                            label: "Move down",
                            disabled: index === visible.length - 1,
                            onSelect: () => onChange((current) => moveMeal(current, meal.id, 1)),
                          },
                          {
                            id: "duplicate",
                            label: "Duplicate",
                            onSelect: () => onChange((current) => duplicateMeal(current, meal.id)),
                          },
                          {
                            id: "delete",
                            label: "Delete",
                            destructive: true,
                            onSelect: () => onChange((current) => removeMeal(current, meal.id)),
                          },
                        ]}
                      />
                    </span>
                  )}
                  {readOnly || !onOpenLibrary ? null : (
                    <button
                      type="button"
                      className="meal-card-add"
                      aria-label={`Add food to ${meal.name}`}
                      onClick={() => {
                        onSelectMeal(meal.id);
                        onOpenLibrary();
                      }}
                    >
                      <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
                      Add food
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {readOnly ? null : (
          <button
            type="button"
            className="meals-add"
            disabled={meals.length >= PLAN_COMPOSITION_LIMITS.meals}
            onClick={() => onChange((current) => addMeal(current))}
          >
            <Plus className="ui-i" strokeWidth={1.75} aria-hidden />
            Add meal
          </button>
        )}
        {showLibraryToggle && onOpenLibrary ? (
          <button type="button" className="button-link" onClick={onOpenLibrary}>
            Open food library
          </button>
        ) : null}
      </div>

      <p className="builder-plan-total" data-testid="day-total-bar">
        {planKcal != null
          ? `Plan total ${formatNumber(planKcal)} kcal from the meals above.`
          : "Plan total unknown until foods have nutrition."}
      </p>
    </div>
  );
}
