import { describe, expect, it } from "vitest";
import type { WorkoutExecution } from "@fitbud/contracts";
import {
  earlyFinishBanner,
  finishedEarly,
  sessionMetrics,
  sessionNoteText,
  sessionStatus,
  sessionStatusLabel,
} from "./model";

const REL = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ASSIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function execution(
  over: {
    sets?: Array<"completed" | "skipped">;
    rpe?: number | null;
  } = {},
): WorkoutExecution {
  const statuses = over.sets ?? ["completed", "completed", "skipped"];
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    assignmentId: ASSIGN,
    coachingRelationshipId: REL,
    planVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    traineeUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    status: "completed",
    recordVersion: 1,
    startedAt: "2026-11-07T12:30:00.000Z",
    pausedAt: null,
    completedAt: "2026-11-07T13:01:00.000Z",
    sessionRpe: over.rpe === undefined ? 7 : over.rpe,
    requireSessionRpe: false,
    exercises: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        workoutExecutionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        exerciseId: "22222222-2222-4222-8222-222222222222",
        name: "Back squat",
        order: 1,
        status: statuses.every((s) => s === "skipped") ? "skipped" : "completed",
        sets: statuses.map((status, i) => ({
          id: `33333333-3333-4333-8333-33333333333${i}`,
          exerciseExecutionId: "11111111-1111-4111-8111-111111111111",
          setTargetId: `44444444-4444-4444-8444-44444444444${i}`,
          order: i + 1,
          status,
          prescribedReps: 6,
          prescribedLoadLabel: "60 kg",
          actualReps: status === "completed" ? 6 : null,
          actualLoadLabel: status === "completed" ? "60 kg" : null,
          completedAt:
            status === "completed" ? "2026-11-07T12:40:00.000Z" : null,
          createdAt: "2026-11-07T12:30:00.000Z",
          updatedAt: "2026-11-07T12:40:00.000Z",
        })),
        createdAt: "2026-11-07T12:30:00.000Z",
        updatedAt: "2026-11-07T12:40:00.000Z",
      },
    ],
    createdAt: "2026-11-07T12:30:00.000Z",
    updatedAt: "2026-11-07T13:01:00.000Z",
  };
}

describe("session detail model", () => {
  it("flags finished early when sets were skipped", () => {
    expect(finishedEarly(execution())).toBe(true);
    expect(sessionStatus(execution())).toBe("finished_early");
    expect(sessionStatusLabel("finished_early")).toBe("Finished early");
  });

  it("builds duration / sets / effort metrics", () => {
    const metrics = sessionMetrics(execution({ rpe: null }));
    expect(metrics.find((m) => m.id === "duration")?.value).toBe("31 min");
    expect(metrics.find((m) => m.id === "sets")?.value).toBe("2 / 3");
    expect(metrics.find((m) => m.id === "effort")?.value).toBe("—");
  });

  it("writes an early-finish banner", () => {
    expect(earlyFinishBanner(execution(), "Rohan")).toMatch(
      /sets weren’t logged/,
    );
  });

  it("reads the trainee's note, trimmed, and nothing when it is empty", () => {
    const base = execution();
    expect(sessionNoteText({ ...base, sessionNote: "  Left knee felt tight.  " })).toBe(
      "Left knee felt tight.",
    );
    expect(sessionNoteText({ ...base, sessionNote: "   " })).toBeNull();
    expect(sessionNoteText({ ...base, sessionNote: null })).toBeNull();
    expect(sessionNoteText(base)).toBeNull();
  });
});
