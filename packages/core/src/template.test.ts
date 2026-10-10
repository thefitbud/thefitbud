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
          primaryMuscles: ["quads"],
          secondaryMuscles: ["glutes"],
          equipment: ["barbell"],
          difficulty: "intermediate" as const,
          sourceExerciseLibraryItemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
          snapshotKind: "legacy" as const,
          sourceFoodLibraryItemId: "55555555-5555-4555-8555-555555555555",
          name: "Dal",
          classification: null,
          basis: null,
          canonical: null,
          serving: {
            label: "1 katori",
            unit: "portion",
            conversionScaled: null,
          },
          quantityScaled: 1_000_000,
          calculated: {
            energyKcalScaled: 180_000_000,
            proteinScaled: 9_000_000,
            carbsScaled: 28_000_000,
            fatScaled: 4_000_000,
            partial: false,
          },
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
    expect(copied.workoutDays[0]?.exercises[0]?.sourceExerciseLibraryItemId).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(copied.workoutDays[0]?.exercises[0]?.primaryMuscles).toEqual(["quads"]);
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
  const libraryFood = {
    id: "66666666-6666-4666-8666-666666666666",
    ownership: "global" as const,
    trainerUserId: null,
    name: "Dal rice",
    cuisineRegion: "indian" as const,
    classification: "prepared_food" as const,
    basis: "per_100_g" as const,
    energyKcalScaled: 160_000_000,
    proteinScaled: 6_000_000,
    carbsScaled: 24_000_000,
    fatScaled: 3_000_000,
    servings: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        label: "1 katori",
        unit: "katori",
        conversionScaled: 200_000_000,
      },
    ],
    notes: "Light ghee ok",
    description: null,
    status: "active" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("copies exercise identity and leaves set targets for the template", () => {
    const exercise = exercisePrescriptionFromLibrary(
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Bench Press",
        instructions: "Touch chest",
        primaryMuscles: ["chest"],
        secondaryMuscles: ["triceps"],
        equipment: ["barbell"],
        difficulty: "intermediate",
        status: "active",
      },
      2,
      () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      [{ order: 1, reps: 5, loadLabel: "RPE 7", rpe: 7 }],
    );
    expect(exercise.name).toBe("Bench Press");
    expect(exercise.sourceExerciseLibraryItemId).toBe(
      "88888888-8888-4888-8888-888888888888",
    );
    expect(exercise.primaryMuscles).toEqual(["chest"]);
    expect(exercise.setTargets[0]?.reps).toBe(5);
    expect(exercise.setTargets[0]?.loadLabel).toBe("RPE 7");
    expect(exercise).not.toHaveProperty("defaultReps");
    expect(exercise).not.toHaveProperty("defaultLoadLabel");
  });

  it("does not invent reps when the template has not entered a set", () => {
    const exercise = exercisePrescriptionFromLibrary(
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Bench Press",
        instructions: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        equipment: [],
        difficulty: null,
        status: "active",
      },
      1,
      () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(exercise.setTargets).toEqual([]);
  });

  it("builds a calculated meal snapshot from a food library item", () => {
    const meal = mealPrescriptionFromLibrary(
      libraryFood,
      1,
      () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "77777777-7777-4777-8777-777777777777",
    );
    expect(meal.name).toBe("Dal rice");
    expect(meal.instructions).toContain("1 katori");
    expect(meal.items[0]).toMatchObject({
      snapshotKind: "calculated",
      sourceFoodLibraryItemId: "66666666-6666-4666-8666-666666666666",
      sourceServingId: "77777777-7777-4777-8777-777777777777",
      quantityScaled: 1_000_000,
      calculated: { energyKcalScaled: 320_000_000, partial: false },
    });
  });
});
