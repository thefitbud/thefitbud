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
  const tiles = [
    {
      label: "Calories",
      value: `${unknownCount(items, "energyKcalScaled") > 0 ? "≥ " : ""}${formatNumber(totals.kcal)} kcal`,
    },
    {
      label: "Protein",
      value: `${unknownCount(items, "proteinScaled") > 0 ? "≥ " : ""}${formatNumber(totals.proteinG)} g`,
    },
    {
      label: "Carbs",
      value: `${unknownCount(items, "carbsScaled") > 0 ? "≥ " : ""}${formatNumber(totals.carbsG)} g`,
    },
    {
      label: "Fat",
      value: `${unknownCount(items, "fatScaled") > 0 ? "≥ " : ""}${formatNumber(totals.fatG)} g`,
    },
  ];

  return (
    <div className="builder-macro-tiles" data-testid="macro-tiles">
      {tiles.map((tile) => (
        <div key={tile.label} className="builder-macro-tile">
          <span className="builder-macro-label">{tile.label}</span>
          <span className="builder-macro-value">{tile.value}</span>
        </div>
      ))}
    </div>
  );
}
