import { z } from "zod";

/**
 * Nutrients are stored as integers scaled by this factor.
 * 1 kcal or 1 gram is 1_000_000. The prescription formula lives in
 * `@fitbud/core`. This module only encodes already-known decimals.
 */
export const NUTRIENT_SCALE = 1_000_000;

export const foodClassificationSchema = z.enum([
  "raw_ingredient",
  "generic_food",
  "prepared_food",
  "branded_product",
]);
export type FoodClassification = z.infer<typeof foodClassificationSchema>;

export const nutritionBasisSchema = z.enum(["per_100_g", "per_100_ml"]);
export type NutritionBasis = z.infer<typeof nutritionBasisSchema>;

export const libraryItemStatusSchema = z.enum(["active", "archived"]);
export type LibraryItemStatus = z.infer<typeof libraryItemStatusSchema>;

export const exerciseDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);
export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

const scaledNonNegativeSchema = z
  .number()
  .int()
  .nonnegative()
  .max(NUTRIENT_SCALE * 5000);

export const nutrientVectorSchema = z.object({
  energyKcalScaled: scaledNonNegativeSchema.nullable(),
  proteinScaled: scaledNonNegativeSchema.nullable(),
  carbsScaled: scaledNonNegativeSchema.nullable(),
  fatScaled: scaledNonNegativeSchema.nullable(),
});
export type NutrientVector = z.infer<typeof nutrientVectorSchema>;

export const calculatedNutrientsSchema = nutrientVectorSchema.extend({
  partial: z.boolean(),
});
export type CalculatedNutrients = z.infer<typeof calculatedNutrientsSchema>;

/** Encode a non-negative decimal as a scaled integer. At most 6 decimal places. */
export function scaleDecimal(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Value must be a non-negative finite number.");
  }
  const text = value.toString();
  if (text.includes("e") || text.includes("E")) {
    return scaleDecimalString(value.toFixed(6));
  }
  return scaleDecimalString(text);
}

function scaleDecimalString(text: string): number {
  const unsigned = text.trim();
  const [wholeRaw, fracRaw = ""] = unsigned.split(".");
  if (!/^\d+$/.test(wholeRaw || "0") || (fracRaw !== "" && !/^\d+$/.test(fracRaw))) {
    throw new Error("Value must be a decimal number.");
  }
  if (fracRaw.length > 6) {
    throw new Error("Use at most 6 decimal places.");
  }
  const fraction = (fracRaw + "000000").slice(0, 6);
  const scaled =
    BigInt(wholeRaw || "0") * BigInt(NUTRIENT_SCALE) + BigInt(fraction);
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Value is too large.");
  }
  return Number(scaled);
}

export function decimalNutrientSchema(max: number) {
  return z
    .number()
    .nonnegative()
    .max(max)
    .superRefine((value, ctx) => {
      try {
        scaleDecimal(value);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "Invalid number.",
        });
      }
    });
}

export type LegacyPortionFood = {
  name: string;
  portionLabel: string;
  calories: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  sourceFoodLibraryItemId?: string;
};

/**
 * Read an already-calculated historical item.
 * Quantity is 1. The copied macros are not run through a per-100 basis.
 */
export function legacyPortionToSnapshot(item: LegacyPortionFood) {
  const energyKcalScaled =
    item.calories == null ? null : item.calories * NUTRIENT_SCALE;
  const proteinScaled =
    item.proteinGrams == null ? null : scaleDecimal(item.proteinGrams);
  const carbsScaled =
    item.carbsGrams == null ? null : scaleDecimal(item.carbsGrams);
  const fatScaled = item.fatGrams == null ? null : scaleDecimal(item.fatGrams);
  return {
    snapshotKind: "legacy" as const,
    name: item.name,
    classification: null,
    basis: null,
    canonical: null,
    serving: {
      label: item.portionLabel,
      unit: "portion",
      conversionScaled: null,
    },
    quantityScaled: NUTRIENT_SCALE,
    calculated: {
      energyKcalScaled,
      proteinScaled,
      carbsScaled,
      fatScaled,
      partial:
        energyKcalScaled == null ||
        proteinScaled == null ||
        carbsScaled == null ||
        fatScaled == null,
    },
    ...(item.sourceFoodLibraryItemId
      ? { sourceFoodLibraryItemId: item.sourceFoodLibraryItemId }
      : {}),
  };
}
