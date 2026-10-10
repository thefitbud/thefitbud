import {
  NUTRIENT_SCALE,
  type CalculatedNutrients,
  type FoodLibraryItem,
  type MealFoodItem,
  type NutrientVector,
  type PlanContent,
} from "@fitbud/contracts";

const SCALE = BigInt(NUTRIENT_SCALE);

export class LibraryPrescriptionError extends Error {
  constructor(
    readonly code:
      | "LIBRARY_ITEM_ARCHIVED"
      | "LIBRARY_FOOD_INCOMPLETE"
      | "LIBRARY_SERVING_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "LibraryPrescriptionError";
  }
}

/**
 * Scale one canonical nutrient by a food-specific serving and a positive quantity.
 * Null stays null. Explicit 0 stays 0. Result stays scaled; do not display-round here.
 */
export function scaleNutrient(
  per100Scaled: number | null,
  conversionScaled: number,
  quantityScaled: number,
): number | null {
  if (per100Scaled == null) return null;
  const numer =
    BigInt(per100Scaled) * BigInt(conversionScaled) * BigInt(quantityScaled);
  const denom = 100n * SCALE * SCALE;
  return Number((numer + denom / 2n) / denom);
}

export function calculateServingNutrients(
  canonical: NutrientVector,
  conversionScaled: number,
  quantityScaled: number,
): CalculatedNutrients {
  const energyKcalScaled = scaleNutrient(
    canonical.energyKcalScaled,
    conversionScaled,
    quantityScaled,
  );
  const proteinScaled = scaleNutrient(
    canonical.proteinScaled,
    conversionScaled,
    quantityScaled,
  );
  const carbsScaled = scaleNutrient(
    canonical.carbsScaled,
    conversionScaled,
    quantityScaled,
  );
  const fatScaled = scaleNutrient(
    canonical.fatScaled,
    conversionScaled,
    quantityScaled,
  );
  return {
    energyKcalScaled,
    proteinScaled,
    carbsScaled,
    fatScaled,
    partial:
      energyKcalScaled == null ||
      proteinScaled == null ||
      carbsScaled == null ||
      fatScaled == null,
  };
}

export function aggregateNutrients(
  items: readonly CalculatedNutrients[],
): CalculatedNutrients {
  const energyKcalScaled = sumNutrient(items, "energyKcalScaled");
  const proteinScaled = sumNutrient(items, "proteinScaled");
  const carbsScaled = sumNutrient(items, "carbsScaled");
  const fatScaled = sumNutrient(items, "fatScaled");
  return {
    energyKcalScaled,
    proteinScaled,
    carbsScaled,
    fatScaled,
    partial:
      energyKcalScaled == null ||
      proteinScaled == null ||
      carbsScaled == null ||
      fatScaled == null,
  };
}

function sumNutrient(
  items: readonly CalculatedNutrients[],
  key: keyof NutrientVector,
): number | null {
  let sum = 0n;
  for (const item of items) {
    const value = item[key];
    if (value == null) return null;
    sum += BigInt(value);
  }
  return Number(sum);
}

export type DisplayNutrients = {
  energyKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  partial: boolean;
};

/** Round only an already aggregated result: nearest kcal, one decimal gram. */
export function displayNutrients(values: CalculatedNutrients): DisplayNutrients {
  return {
    energyKcal: roundToUnit(values.energyKcalScaled, SCALE),
    proteinGrams: roundToTenths(values.proteinScaled),
    carbsGrams: roundToTenths(values.carbsScaled),
    fatGrams: roundToTenths(values.fatScaled),
    partial: values.partial,
  };
}

function roundToUnit(scaled: number | null, unit: bigint): number | null {
  if (scaled == null) return null;
  const value = BigInt(scaled);
  const half = unit / 2n;
  return Number((value + half) / unit);
}

function roundToTenths(scaled: number | null): number | null {
  if (scaled == null) return null;
  const tenth = SCALE / 10n;
  const tenths = roundToUnit(scaled, tenth);
  if (tenths == null) return null;
  return tenths / 10;
}

export function formatScaledQuantity(quantityScaled: number): string {
  const negative = quantityScaled < 0;
  const absolute = Math.abs(quantityScaled);
  const whole = Math.trunc(absolute / NUTRIENT_SCALE);
  const fraction = absolute % NUTRIENT_SCALE;
  const digits =
    fraction === 0
      ? ""
      : `.${String(fraction).padStart(6, "0").replace(/0+$/, "")}`;
  return `${negative ? "-" : ""}${whole}${digits}`;
}

/** Recompute calculated nutrients from the snapshot's own canonical copy. */
export function materializeFoodSnapshot(item: MealFoodItem): MealFoodItem {
  if (item.snapshotKind === "legacy") return item;
  return {
    ...item,
    canonical: { ...item.canonical },
    serving: { ...item.serving },
    calculated: calculateServingNutrients(
      item.canonical,
      item.serving.conversionScaled,
      item.quantityScaled,
    ),
  };
}

export function materializePlanContent(content: PlanContent): PlanContent {
  return {
    ...content,
    mealPrescriptions: content.mealPrescriptions.map((meal) => ({
      ...meal,
      items: meal.items.map((item) => materializeFoodSnapshot(item)),
    })),
  };
}

export function foodSnapshotFromLibrary(
  item: FoodLibraryItem,
  servingId: string,
  quantityScaled: number,
): MealFoodItem {
  if (item.status === "archived") {
    throw new LibraryPrescriptionError(
      "LIBRARY_ITEM_ARCHIVED",
      "Archived foods cannot be added to new content.",
    );
  }
  if (!item.classification || !item.basis) {
    throw new LibraryPrescriptionError(
      "LIBRARY_FOOD_INCOMPLETE",
      "A food needs a classification and a nutrition basis before it can be prescribed.",
    );
  }
  if (!Number.isInteger(quantityScaled) || quantityScaled <= 0) {
    throw new LibraryPrescriptionError(
      "LIBRARY_FOOD_INCOMPLETE",
      "Quantity must be a positive amount.",
    );
  }
  const serving = item.servings.find((candidate) => candidate.id === servingId);
  if (!serving || serving.conversionScaled == null) {
    throw new LibraryPrescriptionError(
      "LIBRARY_SERVING_NOT_FOUND",
      "Choose a serving that converts to the food's canonical basis.",
    );
  }
  const canonical = {
    energyKcalScaled: item.energyKcalScaled,
    proteinScaled: item.proteinScaled,
    carbsScaled: item.carbsScaled,
    fatScaled: item.fatScaled,
  };
  return {
    snapshotKind: "calculated",
    name: item.name,
    classification: item.classification,
    basis: item.basis,
    canonical,
    serving: {
      label: serving.label,
      unit: serving.unit,
      conversionScaled: serving.conversionScaled,
    },
    quantityScaled,
    calculated: calculateServingNutrients(
      canonical,
      serving.conversionScaled,
      quantityScaled,
    ),
    sourceFoodLibraryItemId: item.id,
    sourceServingId: serving.id,
  };
}

export function librarySourceIds(content: PlanContent): {
  foodIds: string[];
  exerciseIds: string[];
} {
  const foodIds = new Set<string>();
  const exerciseIds = new Set<string>();
  for (const day of content.workoutDays) {
    for (const exercise of day.exercises) {
      if (exercise.sourceExerciseLibraryItemId) {
        exerciseIds.add(exercise.sourceExerciseLibraryItemId);
      }
    }
  }
  for (const meal of content.mealPrescriptions) {
    for (const item of meal.items) {
      if (item.sourceFoodLibraryItemId) foodIds.add(item.sourceFoodLibraryItemId);
    }
  }
  return { foodIds: [...foodIds], exerciseIds: [...exerciseIds] };
}
