import { describe, expect, it } from "vitest";
import {
  kgFromLoadLabel,
  nextUpSet,
  sessionSetCounts,
  sessionVolumeKg,
} from "./workoutSession";

type SetStatus = "pending" | "completed" | "modified" | "skipped";

function set(
  order: number,
  status: SetStatus,
  plan: { reps: number | null; load: string | null },
  actual: { reps?: number | null; load?: string | null } = {},
) {
  return {
    order,
    status,
    prescribedReps: plan.reps,
    prescribedLoadLabel: plan.load,
    actualReps: actual.reps ?? null,
    actualLoadLabel: actual.load ?? null,
  };
}

function exercise(order: number, name: string, sets: ReturnType<typeof set>[]) {
  return { order, name, sets };
}

// Shaped like the API's execution; only the fields these helpers read.
const execution = {
  exercises: [
    exercise(1, "Goblet squat", [
      set(1, "completed", { reps: 12, load: "16 kg" }),
      set(2, "completed", { reps: 12, load: "16 kg" }),
      set(3, "completed", { reps: 12, load: "16 kg" }),
    ]),
    exercise(2, "Romanian deadlift", [
      set(1, "completed", { reps: 10, load: "40 kg" }),
      set(2, "modified", { reps: 10, load: "40 kg" }, { reps: 10, load: "42.5 kg" }),
      set(3, "pending", { reps: 10, load: "40 kg" }),
    ]),
    exercise(3, "Walking lunge", [
      set(1, "skipped", { reps: 12, load: null }),
      set(2, "pending", { reps: 12, load: "Bodyweight" }),
    ]),
  ],
} as never;

describe("session figures (W-01b, W-01c, W-17a)", () => {
  it("counts logged sets out of all sets; skipped is not done", () => {
    expect(sessionSetCounts(execution)).toEqual({ done: 5, skipped: 1, total: 8 });
  });

  it("sums kg × reps over logged kg sets, using what was logged", () => {
    // 3 × 12 × 16 + 10 × 40 + 10 × 42.5
    expect(sessionVolumeKg(execution)).toBe(576 + 400 + 425);
  });

  it("has no volume when nothing logged carries a kg load", () => {
    expect(
      sessionVolumeKg({
        exercises: [exercise(1, "Plank", [set(1, "completed", { reps: 3, load: "Bodyweight" })])],
      } as never),
    ).toBeNull();
  });

  it("finds the first pending set as Up next", () => {
    expect(nextUpSet(execution)).toEqual({
      exerciseIndex: 1,
      exerciseName: "Romanian deadlift",
      setNumber: 3,
      target: "40 × 10",
    });
  });

  it("has nothing up next when every set is logged or skipped", () => {
    expect(
      nextUpSet({
        exercises: [exercise(1, "Goblet squat", [set(1, "completed", { reps: 12, load: "16 kg" })])],
      } as never),
    ).toBeNull();
  });

  it("reads kg only from a weight label", () => {
    expect(kgFromLoadLabel("40 kg")).toBe(40);
    expect(kgFromLoadLabel("42.5kg")).toBe(42.5);
    expect(kgFromLoadLabel("Bodyweight")).toBeNull();
    expect(kgFromLoadLabel("RPE 8")).toBeNull();
    expect(kgFromLoadLabel(null)).toBeNull();
  });
});
