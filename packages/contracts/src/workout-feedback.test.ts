import { describe, expect, it } from "vitest";
import {
  WORKOUT_SESSION_NOTE_MAX_LENGTH,
  syncMutationRequestSchema,
  traineeWorkoutFeedbackRequestSchema,
  workoutExecutionSchema,
} from "./index.js";

/** Z14-31 (D-W14-34): the workout note sent with the session rating. */
describe("traineeWorkoutFeedbackRequestSchema (Z14-11, Z14-31)", () => {
  const parse = (body: unknown) => traineeWorkoutFeedbackRequestSchema.safeParse(body);

  it("keeps the Z14-12 body { rpe, recordVersion } valid and unchanged", () => {
    expect(parse({ rpe: 7, recordVersion: 3 })).toEqual({
      success: true,
      data: { rpe: 7, recordVersion: 3 },
    });
    expect(parse({ rpe: null, recordVersion: 3 }).data).toEqual({ rpe: null, recordVersion: 3 });
  });

  it("accepts a note on its own; an omitted rpe stays omitted (unchanged)", () => {
    const result = parse({ note: "Felt strong", recordVersion: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ note: "Felt strong", recordVersion: 1 });
    expect("rpe" in result.data!).toBe(false);
  });

  it("trims the note; empty, blank and null all clear it", () => {
    expect(parse({ note: "  Knee tight  ", recordVersion: 1 }).data?.note).toBe("Knee tight");
    expect(parse({ note: "", recordVersion: 1 }).data?.note).toBeNull();
    expect(parse({ note: " \n\t ", recordVersion: 1 }).data?.note).toBeNull();
    expect(parse({ note: null, recordVersion: 1 }).data?.note).toBeNull();
  });

  it("allows 500 characters after trimming and refuses 501 (never cuts)", () => {
    expect(WORKOUT_SESSION_NOTE_MAX_LENGTH).toBe(500);
    expect(parse({ note: "a".repeat(500), recordVersion: 1 }).success).toBe(true);
    expect(parse({ note: ` ${"a".repeat(500)} `, recordVersion: 1 }).success).toBe(true);
    const tooLong = parse({ note: "a".repeat(501), recordVersion: 1 });
    expect(tooLong.success).toBe(false);
    expect(tooLong.error?.issues[0]).toMatchObject({ path: ["note"], code: "too_big" });
  });

  it("refuses a body with neither rpe nor note, and any unknown key", () => {
    const neither = parse({ recordVersion: 1 });
    expect(neither.success).toBe(false);
    expect(neither.error?.issues[0]).toMatchObject({ code: "custom", path: [] });
    expect(parse({ rpe: 6, mood: "tired", recordVersion: 1 }).success).toBe(false);
    expect(parse({ rpe: 11, recordVersion: 1 }).success).toBe(false);
    expect(parse({ note: 5, recordVersion: 1 }).success).toBe(false);
  });

  it("carries the note through a workout.feedback sync mutation", () => {
    const mutation = syncMutationRequestSchema.safeParse({
      mutationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      entityType: "workout_execution",
      recordId: "00000000-0000-4000-8000-000000000002",
      operation: "workout.feedback",
      expectedServerVersion: null,
      clientOccurredAt: "2026-11-25T06:00:00.000Z",
      payload: {
        executionId: "00000000-0000-4000-8000-000000000002",
        body: { note: " Felt heavy ", recordVersion: 2 },
      },
    });
    expect(mutation.success).toBe(true);
  });
});

describe("workoutExecutionSchema.sessionNote (Z14-31)", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000002",
    assignmentId: "00000000-0000-4000-8000-000000000003",
    coachingRelationshipId: "00000000-0000-4000-8000-000000000004",
    planVersionId: "00000000-0000-4000-8000-000000000005",
    traineeUserId: "00000000-0000-4000-8000-000000000006",
    status: "completed",
    recordVersion: 2,
    startedAt: "2026-11-25T05:00:00.000Z",
    pausedAt: null,
    completedAt: "2026-11-25T06:00:00.000Z",
    sessionRpe: 7,
    requireSessionRpe: false,
    exercises: [],
    createdAt: "2026-11-25T05:00:00.000Z",
    updatedAt: "2026-11-25T06:00:00.000Z",
  };

  it("parses with a note, with null, and without the key (older fixtures)", () => {
    expect(workoutExecutionSchema.parse({ ...base, sessionNote: "Felt strong" }).sessionNote).toBe("Felt strong");
    expect(workoutExecutionSchema.parse({ ...base, sessionNote: null }).sessionNote).toBeNull();
    expect(workoutExecutionSchema.safeParse(base).success).toBe(true);
  });
});
