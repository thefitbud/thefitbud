import { useEffect, useState } from "react";
import {
  NUTRIENT_SCALE,
  type FoodLibraryItem,
  type MealFoodItem,
  type MealPrescription,
  type PlanContent,
} from "@fitbud/contracts";
import {
  foodSnapshotFromLibrary,
  formatHhMmTime,
  formatNumber,
  formatScaledQuantity,
  materializeFoodSnapshot,
} from "@fitbud/core";
import { apiClient } from "../../lib/api";
import { removeFoodItem, updateFoodItem, updateMeal } from "../plan-composition";
import { Button, Field, LibraryThumb } from "../ui";

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

function itemKcal(item: MealFoodItem): string {
  const scaled = item.calculated?.energyKcalScaled;
  if (scaled == null) return "—";
  return `${formatNumber(Math.round(scaled / NUTRIENT_SCALE))} kcal`;
}

function QuantityField({
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
  const quantity =
    item.snapshotKind === "calculated" ? item.quantityScaled / NUTRIENT_SCALE : 1;
  const display =
    item.snapshotKind === "calculated"
      ? `${formatScaledQuantity(item.quantityScaled)} × ${item.serving.label} · ${itemKcal(item)}`
      : `${item.serving.label} · ${itemKcal(item)}`;

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
      /* keep current serving */
    }
  }

  const removeButton = (
    <Button
      variant="ghost"
      size="sm"
      className="builder-meal-item-remove"
      aria-label={`Remove ${item.name}`}
      onClick={() => onChange((current) => removeFoodItem(current, mealId, index))}
    >
      Remove
    </Button>
  );

  return (
    <div className="builder-meal-item">
      <div className="builder-meal-item-main">
        <LibraryThumb name={item.name} kind="food" />
        <div className="builder-meal-item-copy">
          <p className="builder-meal-item-name">{item.name}</p>
          <p className="builder-meal-item-meta">{display}</p>
        </div>
      </div>
      {item.snapshotKind === "calculated" && !readOnly ? (
        <div className="builder-meal-item-controls">
          {servings.length > 0 ? (
            <label className="builder-meal-item-serving ui-input">
              <span className="sr-only">Serving for {item.name}</span>
              <select
                value={item.sourceServingId ?? servings[0]?.id ?? ""}
                onChange={(event) => setServing(event.target.value)}
              >
                {servings.map((serving) => (
                  <option key={serving.id} value={serving.id}>
                    {serving.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="builder-meal-item-qty-row">
            <span className="builder-meal-item-qty ui-input">
              <input
                type="number"
                min={0.5}
                step={0.5}
                aria-label={`Quantity of ${item.name}`}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </span>
            {removeButton}
          </div>
        </div>
      ) : readOnly ? null : (
        <div className="builder-meal-item-controls">
          <div className="builder-meal-item-qty-row">{removeButton}</div>
        </div>
      )}
    </div>
  );
}

export function MealProperties({
  meal,
  onChange,
  readOnly = false,
}: {
  meal: MealPrescription | null;
  onChange: (update: (current: PlanContent) => PlanContent) => void;
  readOnly?: boolean;
}) {
  if (!meal) {
    return (
      <aside className="builder-props" aria-label="Meal properties">
        <h2 className="builder-pane-title">Meal</h2>
        <p className="muted">Select a meal to edit time, portions and swaps.</p>
      </aside>
    );
  }

  const items = meal.items ?? [];
  const kcal = items.reduce((sum, item) => {
    const scaled = item.calculated?.energyKcalScaled;
    return scaled == null ? sum : sum + scaled / NUTRIENT_SCALE;
  }, 0);
  const known = items.some((item) => item.calculated?.energyKcalScaled != null);
  const timeLabel = meal.localTime ? formatHhMmTime(meal.localTime) : "";
  const summary = [timeLabel, known ? `${formatNumber(Math.round(kcal))} kcal` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <aside className="builder-props" aria-label="Meal properties" data-testid="meal-properties">
      <header className="builder-props-head">
        <div className="builder-props-title">
          <h2 className="builder-pane-title">{meal.name}</h2>
          {summary ? <p className="builder-props-meta">{summary}</p> : null}
        </div>
      </header>

      <Field label="Time">
        <span className="ui-input">
          <input
            type="time"
            aria-label="Time"
            value={meal.localTime ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              onChange((current) =>
                updateMeal(current, meal.id, { localTime: event.target.value || null }),
              )
            }
          />
        </span>
      </Field>

      <section className="builder-meal-items" aria-label={`Foods in ${meal.name}`}>
        <h3 className="builder-props-subtitle">Foods</h3>
        {items.length === 0 ? (
          <p className="muted">Add foods from the library.</p>
        ) : (
          items.map((item, index) => (
            <QuantityField
              key={`${meal.id}-${index}-${item.name}`}
              item={item}
              index={index}
              mealId={meal.id}
              readOnly={readOnly}
              onChange={onChange}
            />
          ))
        )}
      </section>

      <Field
        label="Swaps allowed"
        help="Clients can pick these instead without it counting as a change."
      >
        <textarea
          className="ui-textarea"
          rows={3}
          maxLength={2000}
          aria-label="Swaps allowed"
          placeholder="Bajra roti, Moong dal"
          value={meal.instructions ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange((current) =>
              updateMeal(current, meal.id, { instructions: event.target.value || null }),
            )
          }
        />
      </Field>
    </aside>
  );
}
