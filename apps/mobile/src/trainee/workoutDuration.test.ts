import { describe, expect, it } from "vitest";
import { durationMinutesFromExecution } from "./workoutDuration";

describe("durationMinutesFromExecution", () => {
  it("returns bounded duration from start/complete", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-10-18T07:00:00.000Z",
        completedAt: "2026-10-18T07:48:00.000Z",
      }),
    ).toBe(48);
  });

  it("returns null when not completed", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-10-18T07:00:00.000Z",
        completedAt: null,
      }),
    ).toBeNull();
  });

  it("returns null for absurd unbounded durations", () => {
    expect(
      durationMinutesFromExecution({
        startedAt: "2026-09-01T07:00:00.000Z",
        completedAt: "2026-10-18T07:00:00.000Z",
      }),
    ).toBeNull();
  });
});
