import { describe, expect, it } from "vitest";
import {
  NUTRIENT_SCALE,
  mealFoodItemSchema,
  scaleDecimal,
  type FoodLibraryItem,
  type NutrientVector,
} from "@fitbud/contracts";
import {
  aggregateNutrients,
  calculateServingNutrients,
  displayNutrients,
  foodSnapshotFromLibrary,
  LibraryPrescriptionError,
} from "./nutrition.js";

const canonical: NutrientVector = {
  energyKcalScaled: scaleDecimal(100),
  proteinScaled: scaleDecimal(10),
  carbsScaled: scaleDecimal(20),
  fatScaled: scaleDecimal(5),
};

function food(overrides: Partial<FoodLibraryItem> = {}): FoodLibraryItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    ownership: "trainer",
    trainerUserId: "22222222-2222-4222-8222-222222222222",
    name: "Steamed rice",
    cuisineRegion: "indian",
    classification: "prepared_food",
    basis: "per_100_g",
    energyKcalScaled: scaleDecimal(130),
    proteinScaled: scaleDecimal(2.7),
    carbsScaled: scaleDecimal(28),
    fatScaled: 0,
    servings: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        label: "1 katori",
        unit: "katori",
        conversionScaled: scaleDecimal(150),
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        label: "100 g",
        unit: "g",
        conversionScaled: scaleDecimal(100),
      },
    ],
    notes: null,
    description: null,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("food nutrition calculation", () => {
  it("converts two servings of one food differently", () => {
    const katori = calculateServingNutrients(
      canonical,
      scaleDecimal(150),
      scaleDecimal(1),
    );
    const measured = calculateServingNutrients(
      canonical,
      scaleDecimal(100),
      scaleDecimal(1),
    );
    expect(katori.energyKcalScaled).toBe(scaleDecimal(150));
    expect(measured.energyKcalScaled).toBe(scaleDecimal(100));
    expect(katori.energyKcalScaled).not.toBe(measured.energyKcalScaled);
    expect(katori.proteinScaled).toBe(scaleDecimal(15));
    expect(measured.proteinScaled).toBe(scaleDecimal(10));
  });

  it("scales known nutrients by quantity and keeps null and zero distinct", () => {
    const doubled = calculateServingNutrients(
      canonical,
      scaleDecimal(100),
      scaleDecimal(2),
    );
    expect(doubled.energyKcalScaled).toBe(scaleDecimal(200));
    expect(doubled.proteinScaled).toBe(scaleDecimal(20));
    expect(doubled.partial).toBe(false);

    const unknownFat = calculateServingNutrients(
      { ...canonical, fatScaled: null },
      scaleDecimal(100),
      scaleDecimal(2),
    );
    expect(unknownFat.fatScaled).toBeNull();
    expect(unknownFat.energyKcalScaled).toBe(scaleDecimal(200));
    expect(unknownFat.partial).toBe(true);

    const zeroFat = calculateServingNutrients(
      { ...canonical, fatScaled: 0 },
      scaleDecimal(50),
      scaleDecimal(2),
    );
    expect(zeroFat.fatScaled).toBe(0);
    expect(zeroFat.partial).toBe(false);
  });

  it("rounds only after aggregating a meal", () => {
    const item = {
      energyKcalScaled: scaleDecimal(0.4),
      proteinScaled: scaleDecimal(0.14),
      carbsScaled: scaleDecimal(0.14),
      fatScaled: 0,
      partial: false,
    };
    const total = aggregateNutrients([item, item]);
    expect(displayNutrients(total)).toEqual({
      energyKcal: 1,
      proteinGrams: 0.3,
      carbsGrams: 0.3,
      fatGrams: 0,
      partial: false,
    });
    expect(displayNutrients(item).proteinGrams).toBe(0.1);
  });

  it("reads a legacy portion snapshot without recalculating it", () => {
    const item = mealFoodItemSchema.parse({
      name: "Dal",
      portionLabel: "1 katori",
      calories: 180,
      proteinGrams: 9,
      carbsGrams: 28,
      fatGrams: null,
    });
    expect(item.snapshotKind).toBe("legacy");
    if (item.snapshotKind !== "legacy") return;
    expect(item.quantityScaled).toBe(NUTRIENT_SCALE);
    expect(item.basis).toBeNull();
    expect(item.calculated.energyKcalScaled).toBe(180 * NUTRIENT_SCALE);
    expect(item.calculated.fatScaled).toBeNull();
    expect(item.calculated.partial).toBe(true);
  });

  it("copies a library serving into an independent snapshot", () => {
    const source = food();
    const snapshot = foodSnapshotFromLibrary(
      source,
      "33333333-3333-4333-8333-333333333333",
      scaleDecimal(2),
    );
    expect(snapshot.snapshotKind).toBe("calculated");
    if (snapshot.snapshotKind !== "calculated") return;
    expect(snapshot.calculated.energyKcalScaled).toBe(scaleDecimal(390));
    expect(snapshot.sourceFoodLibraryItemId).toBe(source.id);
    expect(snapshot.sourceServingId).toBe("33333333-3333-4333-8333-333333333333");
    source.energyKcalScaled = scaleDecimal(999);
    expect(snapshot.canonical.energyKcalScaled).toBe(scaleDecimal(130));
  });

  it("rejects an archived food", () => {
    expect(() =>
      foodSnapshotFromLibrary(
        food({ status: "archived" }),
        "44444444-4444-4444-8444-444444444444",
        scaleDecimal(1),
      ),
    ).toThrow(LibraryPrescriptionError);
  });
});
