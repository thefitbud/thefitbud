import { describe, expect, it } from "vitest";
import { NUTRIENT_SCALE, type TraineeFoodDetail } from "@fitbud/contracts";
import {
  ADD_DEBOUNCE_MS,
  addLine,
  amountWithUnit,
  formatAmount,
  lineFromCustomFood,
  lineFromSearchItem,
  lineChipLabel,
  logTotals,
  toLoggedItem,
  withServingFromDetail,
  type FoodSearchItem,
} from "./logLines";

const CHAPATI = "f1000001-0000-4000-8000-000000000001";
const SERVING = "f2000001-0000-4000-8000-000000000001";

const chapati: FoodSearchItem = {
  id: CHAPATI,
  name: "Chapati / roti",
  energyKcalScaled: 202 * NUTRIENT_SCALE,
  defaultServingId: SERVING,
  source: "library",
  serving: {
    label: "1 medium chapati (40 g)",
    kcalScaled: 81 * NUTRIENT_SCALE,
    proteinScaled: 3 * NUTRIENT_SCALE,
    carbsScaled: 15 * NUTRIENT_SCALE,
    fatScaled: 1 * NUTRIENT_SCALE,
  },
};

const ownDosa: FoodSearchItem = {
  id: "0b8c3a4e-1f2d-4e5f-8a9b-0c1d2e3f4a5b",
  name: "Ragi dosa",
  energyKcalScaled: 120 * NUTRIENT_SCALE,
  defaultServingId: null,
  source: "custom",
  serving: {
    label: "1 piece",
    kcalScaled: 120 * NUTRIENT_SCALE,
    proteinScaled: 3 * NUTRIENT_SCALE,
    carbsScaled: 22 * NUTRIENT_SCALE,
    fatScaled: null,
  },
};

describe("formatAmount and amountWithUnit", () => {
  it("writes halves and quarters as the kit does", () => {
    expect(formatAmount(1.5)).toBe("1½");
    expect(formatAmount(0.5)).toBe("½");
    expect(formatAmount(2)).toBe("2");
    expect(formatAmount(0.25)).toBe("¼");
  });

  it("counts a “1 …” serving by its noun, others with ×", () => {
    expect(amountWithUnit(2, "1 medium chapati (40 g)")).toBe("2 medium chapati (40 g)");
    expect(amountWithUnit(1.5, "1 katori")).toBe("1½ katori");
    expect(amountWithUnit(1, "Small bowl")).toBe("Small bowl");
    expect(amountWithUnit(2, "Small bowl")).toBe("2 × Small bowl");
  });
});

describe("addLine (TR-26b instant add)", () => {
  it("ignores a second tap on the same food inside the debounce window", () => {
    const seen = new Map<string, number>();
    const first = addLine([], lineFromSearchItem(chapati), seen, 1_000);
    expect(first.added).toBe(true);
    const second = addLine(first.lines, lineFromSearchItem(chapati), seen, 1_000 + ADD_DEBOUNCE_MS - 1);
    expect(second.added).toBe(false);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]!.quantity).toBe(1);
  });

  it("a later tap adds one more of the same food, not a second line", () => {
    const seen = new Map<string, number>();
    const first = addLine([], lineFromSearchItem(chapati), seen, 1_000);
    const again = addLine(first.lines, lineFromSearchItem(chapati), seen, 1_000 + ADD_DEBOUNCE_MS);
    expect(again.added).toBe(true);
    expect(again.lines).toHaveLength(1);
    expect(again.lines[0]!.quantity).toBe(2);
    expect(lineChipLabel(again.lines[0]!)).toBe("Chapati / roti × 2");
    expect(logTotals(again.lines).kcal).toBe(162);
  });

  it("the debounce is per food: another food adds straight away", () => {
    const seen = new Map<string, number>();
    const first = addLine([], lineFromSearchItem(chapati), seen, 1_000);
    const other = addLine(first.lines, lineFromSearchItem(ownDosa), seen, 1_001);
    expect(other.added).toBe(true);
    expect(other.lines).toHaveLength(2);
  });
});

describe("lines from search hits", () => {
  it("a library hit starts on its real default serving", () => {
    const line = lineFromSearchItem(chapati);
    expect(line.unitLabel).toBe("1 medium chapati (40 g)");
    expect(line.kcalPerUnit).toBe(81);
    expect(line.servingKnown).toBe(true);
    expect(toLoggedItem(line)).toEqual({ foodId: CHAPATI, servingId: SERVING, quantity: 1 });
  });

  it("a trainee's own food is logged by name again and is not saved twice", () => {
    const line = { ...lineFromSearchItem(ownDosa), quantity: 2 };
    expect(toLoggedItem(line)).toEqual({
      customFood: {
        name: "Ragi dosa",
        kcal: 240,
        protein: 6,
        carbs: 44,
        fat: 0,
        servingLabel: "2 × 1 piece",
      },
      saveToMyFoods: false,
    });
  });

  it("a created food carries the trainee's Save to my foods choice", () => {
    const line = lineFromCustomFood({
      key: "new:1",
      name: " Ragi dosa ",
      amount: 1,
      unit: "piece",
      kcal: 120,
      macros: { protein: 3 },
      saveToMyFoods: false,
    });
    expect(toLoggedItem(line)).toEqual({
      customFood: { name: "Ragi dosa", kcal: 120, protein: 3, carbs: 0, fat: 0, servingLabel: "1 piece" },
      saveToMyFoods: false,
    });
  });
});

describe("withServingFromDetail", () => {
  const detail = {
    id: CHAPATI,
    name: "Chapati / roti",
    energyKcalScaled: 200 * NUTRIENT_SCALE,
    proteinScaled: 10 * NUTRIENT_SCALE,
    carbsScaled: 40 * NUTRIENT_SCALE,
    fatScaled: 2 * NUTRIENT_SCALE,
    defaultServingId: SERVING,
    servings: [{ id: SERVING, label: "1 medium chapati (40 g)", unit: "piece", conversionScaled: 40 * NUTRIENT_SCALE }],
  } as unknown as TraineeFoodDetail;

  it("fills a placeholder line with the food's default serving", () => {
    const line = { ...lineFromSearchItem({ ...chapati, serving: null }) };
    expect(line.unitLabel).toBe("1 serving");
    const filled = withServingFromDetail(line, detail);
    expect(filled.unitLabel).toBe("1 medium chapati (40 g)");
    expect(filled.kcalPerUnit).toBe(80);
    expect(filled.servingKnown).toBe(true);
  });

  it("never overrides an amount the trainee set", () => {
    const line = { ...lineFromSearchItem({ ...chapati, serving: null }), touched: true, quantity: 3 };
    expect(withServingFromDetail(line, detail)).toBe(line);
  });
});
