import { describe, expect, it } from "vitest";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { itemPortion } from "./AssignedMealPlanScreen";

type Item = Parameters<typeof itemPortion>[0];

function item(quantity: number, label: string): Item {
  return {
    snapshotKind: "calculated",
    name: "Boiled egg",
    quantityScaled: quantity * NUTRIENT_SCALE,
    serving: { id: "22222222-2222-4222-8222-222222222222", label },
  } as unknown as Item;
}

describe("itemPortion (Z12-42)", () => {
  it("separates the count from a serving label that has its own number", () => {
    expect(itemPortion(item(2, "1 egg (70 g)"))).toBe("2 × 1 egg (70 g)");
  });
  it("shows the serving label alone for one", () => {
    expect(itemPortion(item(1, "1 egg (70 g)"))).toBe("1 egg (70 g)");
  });
  it("shows half as ½ with the separator", () => {
    expect(itemPortion(item(0.5, "1 katori"))).toBe("½ × 1 katori");
  });
});
