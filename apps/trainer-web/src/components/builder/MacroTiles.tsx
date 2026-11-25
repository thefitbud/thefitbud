import type { MealFoodItem } from "@fitbud/contracts";
import { dayMacrosFromScaledItems, formatNumber } from "@fitbud/core";

function unknownCount(
  items: readonly MealFoodItem[],
  key: "energyKcalScaled" | "proteinScaled" | "carbsScaled" | "fatScaled",
): number {
  return items.filter((item) => item.calculated?.[key] == null).length;
}

export function MacroTiles({ items }: { items: readonly MealFoodItem[] }) {
  const totals = dayMacrosFromScaledItems(items.map((item) => item.calculated));
  const atLeast = (key: Parameters<typeof unknownCount>[1]) =>
    unknownCount(items, key) > 0 ? "≥ " : "";
  const tiles = [
    {
      key: "kcal",
      label: "Calories",
      value: `${atLeast("energyKcalScaled")}${formatNumber(totals.kcal)}`,
      unit: "kcal",
    },
    {
      key: "protein",
      label: "Protein",
      value: `${atLeast("proteinScaled")}${formatNumber(totals.proteinG)}`,
      unit: "g",
    },
    {
      key: "carbs",
      label: "Carbs",
      value: `${atLeast("carbsScaled")}${formatNumber(totals.carbsG)}`,
      unit: "g",
    },
    {
      key: "fat",
      label: "Fat",
      value: `${atLeast("fatScaled")}${formatNumber(totals.fatG)}`,
      unit: "g",
    },
  ];

  return (
    <div className="builder-macro-tiles" data-testid="macro-tiles">
      {tiles.map((tile) => (
        <div key={tile.key} className={`builder-macro-tile is-${tile.key}`}>
          <span className="builder-macro-label">{tile.label}</span>
          <span className="builder-macro-value">
            {tile.value}
            <span className="builder-macro-unit"> {tile.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
