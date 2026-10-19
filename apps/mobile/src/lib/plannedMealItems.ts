import type { LoggedFoodItem, MealAssignment, MealFoodItem } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { cleanFoodLabel } from "../trainee/mealHelpers";

export type PlannedRow = {
  label: string;
  displayLabel: string;
  quantity: number;
  foodId?: string;
  servingId?: string;
  kcalPreview: number | null;
};

function foodItemName(item: MealFoodItem): string {
  return item.name;
}

function foodItemQuantity(item: MealFoodItem): number {
  if ("snapshotKind" in item && item.snapshotKind === "calculated") {
    return item.quantityScaled / NUTRIENT_SCALE;
  }
  return 1;
}

function foodItemKcal(item: MealFoodItem, quantity: number): number | null {
  if ("snapshotKind" in item) {
    const kcal = item.calculated.energyKcalScaled;
    if (kcal == null) return null;
    return Math.round((kcal / NUTRIENT_SCALE) * quantity);
  }
  return null;
}

function foodItemIds(item: MealFoodItem): {
  foodId?: string;
  servingId?: string;
} {
  if ("snapshotKind" in item) {
    if (item.snapshotKind === "calculated") {
      return {
        foodId: item.sourceFoodLibraryItemId,
        servingId: item.sourceServingId,
      };
    }
    return { foodId: item.sourceFoodLibraryItemId };
  }
  return {};
}

export function plannedRowsFromAssignment(
  assignment: MealAssignment,
): PlannedRow[] {
  const items = assignment.prescription.items ?? [];
  return items.map((item) => {
    const quantity = foodItemQuantity(item);
    const { foodId, servingId } = foodItemIds(item);
    const name = cleanFoodLabel(foodItemName(item));
    const servingLabel = cleanFoodLabel(
      "serving" in item && item.serving?.label ? item.serving.label : "",
    );
    const label =
      quantity !== 1
        ? `${quantity} × ${name}${servingLabel ? ` (${servingLabel})` : ""}`
        : `${name}${servingLabel ? ` · ${servingLabel}` : ""}`;
    return {
      label: name,
      displayLabel: label,
      quantity,
      foodId,
      servingId,
      kcalPreview: foodItemKcal(item, quantity),
    };
  });
}

export function plannedSummaryLine(assignment: MealAssignment): string {
  const rows = plannedRowsFromAssignment(assignment);
  if (rows.length === 0) {
    const text = assignment.prescription.instructions?.trim();
    return text || assignment.mealName;
  }
  return rows.map((row) => row.displayLabel).join(", ");
}

export function loggedRowsFromPlanned(
  assignment: MealAssignment,
): Array<LoggedFoodItem & { label: string; kcalPreview: number | null }> {
  return plannedRowsFromAssignment(assignment).map((row) => {
    if (row.foodId) {
      return {
        foodId: row.foodId,
        servingId: row.servingId,
        quantity: row.quantity,
        label: row.label,
        kcalPreview: row.kcalPreview,
      };
    }
    return {
      customFood: {
        name: row.label,
        kcal: row.kcalPreview ?? 0,
      },
      label: row.label,
      kcalPreview: row.kcalPreview,
    };
  });
}
