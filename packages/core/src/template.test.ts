import { describe, expect, it } from "vitest";
import {
  copyPlanContent,
  exercisePrescriptionFromLibrary,
  inferPlanTemplateType,
  mealPrescriptionFromLibrary,
  planContentMatchesTemplateType,
} from "./template.js";

const sampleContent = {
  workoutDays: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      order: 1,
      name: "Day A",
      exercises: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          order: 1,
          name: "Squat",
          instructions: "Depth",
          setTargets: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              order: 1,
              reps: 5,
              loadLabel: "RPE 7",
              rpe: 7,
            },
          ],
        },
      ],
    },
  ],
  mealPrescriptions: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      order: 1,
      name: "Lunch",
      scheduleHint: "1pm",
      instructions: null,
      photoRequired: false,
      items: [
        {
          sourceFoodLibraryItemId: "55555555-5555-4555-8555-555555555555",
          name: "Dal",
          portionLabel: "1 katori",
          calories: 180,
          proteinGrams: 9,
          carbsGrams: 28,
          fatGrams: 4,
        },
      ],
    },
  ],
};

describe("copyPlanContent", () => {
  it("copies values and replaces every nested id", () => {
    let n = 0;
    const copied = copyPlanContent(
      sampleContent,
      () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    );
    expect(copied.workoutDays[0]?.name).toBe("Day A");
    expect(copied.workoutDays[0]?.id).not.toBe(sampleContent.workoutDays[0]!.id);
    expect(copied.workoutDays[0]?.exercises[0]?.id).not.toBe(
      sampleContent.workoutDays[0]!.exercises[0]!.id,
    );
    expect(copied.workoutDays[0]?.exercises[0]?.setTargets[0]?.id).not.toBe(
      sampleContent.workoutDays[0]!.exercises[0]!.setTargets[0]!.id,
    );
    expect(copied.mealPrescriptions[0]?.id).not.toBe(
      sampleContent.mealPrescriptions[0]!.id,
    );
    expect(copied.mealPrescriptions[0]?.items[0]?.sourceFoodLibraryItemId).toBe(
      "55555555-5555-4555-8555-555555555555",
    );
    expect(copied.mealPrescriptions[0]?.items[0]).not.toBe(
      sampleContent.mealPrescriptions[0]!.items[0],
    );
  });
});

describe("planContentMatchesTemplateType", () => {
  it("validates workout, nutrition, and combined shapes", () => {
    expect(planContentMatchesTemplateType(sampleContent, "combined")).toBe(
      true,
    );
    expect(planContentMatchesTemplateType(sampleContent, "workout")).toBe(
      false,
    );
    expect(
      planContentMatchesTemplateType(
        {
          workoutDays: sampleContent.workoutDays,
          mealPrescriptions: [],
        },
        "workout",
      ),
    ).toBe(true);
  });
});

describe("inferPlanTemplateType", () => {
  it("returns combined when both workout and nutrition present", () => {
    expect(inferPlanTemplateType(sampleContent)).toBe("combined");
  });
});

describe("library copy helpers", () => {
  it("builds an exercise prescription from a library item", () => {
    const exercise = exercisePrescriptionFromLibrary(
      {
        name: "Bench Press",
        instructions: "Touch chest",
        defaultLoadLabel: "RPE 7",
        defaultReps: 5,
      },
      2,
      () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(exercise.name).toBe("Bench Press");
    expect(exercise.setTargets[0]?.reps).toBe(5);
  });

  it("builds a meal prescription from a food library item", () => {
    const meal = mealPrescriptionFromLibrary(
      {
        name: "Dal rice",
        portionLabel: "1 katori dal + 1 cup rice",
        notes: "Light ghee ok",
      },
      1,
      () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(meal.name).toBe("Dal rice");
    expect(meal.instructions).toContain("1 katori dal");
    expect(meal.items[0]?.name).toBe("Dal rice");
    expect(meal.items[0]?.sourceFoodLibraryItemId).toBeUndefined();
  });

  it("snapshots library macros without keeping a live link", () => {
    const meal = mealPrescriptionFromLibrary(
      {
        id: "66666666-6666-4666-8666-666666666666",
        name: "Dal rice",
        portionLabel: "1 katori dal + 1 cup rice",
        notes: null,
        calories: 320,
        proteinGrams: 12,
        carbsGrams: 48,
        fatGrams: 6,
      },
      1,
      () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(meal.items).toEqual([
      {
        sourceFoodLibraryItemId: "66666666-6666-4666-8666-666666666666",
        name: "Dal rice",
        portionLabel: "1 katori dal + 1 cup rice",
        calories: 320,
        proteinGrams: 12,
        carbsGrams: 48,
        fatGrams: 6,
      },
    ]);
  });
});
