import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

import { CustomFoodScreen, validateCustomFood } from "./CustomFoodScreen";

const valid = { name: "Ragi dosa", amount: "1", kcal: "120", protein: "", carbs: "", fat: "" };

describe("validateCustomFood (TR-26e)", () => {
  it("name, amount and kcal are required; macros are optional", () => {
    expect(validateCustomFood(valid)).toEqual({});
    expect(validateCustomFood({ ...valid, name: "  " })).toHaveProperty("name");
    expect(validateCustomFood({ ...valid, amount: "0" })).toHaveProperty("amount");
    expect(validateCustomFood({ ...valid, kcal: "" })).toHaveProperty("kcal");
    expect(validateCustomFood({ ...valid, kcal: "20001" })).toHaveProperty("kcal");
    expect(validateCustomFood({ ...valid, protein: "3", carbs: "22", fat: "2" })).toEqual({});
    expect(validateCustomFood({ ...valid, fat: "abc" })).toHaveProperty("macros");
  });
});

describe("CustomFoodScreen", () => {
  function renderForm() {
    const onAdd = vi.fn();
    render(
      <CustomFoodScreen
        mealName="Evening snack"
        coachName="Rahul Verma"
        initialName="Ragi dosa"
        saving={false}
        onCancel={vi.fn()}
        onAdd={onAdd}
      />,
    );
    return onAdd;
  }

  it("starts from the search text with Save to my foods on", () => {
    renderForm();
    expect((screen.getByLabelText("Food name") as HTMLInputElement).value).toBe("Ragi dosa");
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe("1");
    expect((screen.getByRole("switch", { name: "Save to my foods" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Rahul sees this as a food you added.")).toBeTruthy();
  });

  it("does not add without the kcal, and says what is missing", () => {
    const onAdd = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByText("Enter the kcal.")).toBeTruthy();
  });

  it("adds the food with its kcal and macros, and the toggle's choice", () => {
    const onAdd = renderForm();
    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Protein"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("switch", { name: "Save to my foods" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to evening snack · 120 kcal" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: "Ragi dosa",
      quantity: 1,
      unitLabel: "1 piece",
      kcalPerUnit: 120,
      macrosPerUnit: { protein: 3, carbs: 0, fat: 0 },
      source: { kind: "custom", saveToMyFoods: false },
    });
  });
});
