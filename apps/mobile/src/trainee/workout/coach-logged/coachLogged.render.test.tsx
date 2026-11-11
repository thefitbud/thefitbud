import { describe, expect, it, vi } from "vitest";
import { workoutExecutionSchema } from "@fitbud/contracts";
import { render, screen } from "../../../test/render";
import { CoachLoggedWorkoutScreen } from "./CoachLoggedWorkoutScreen";
import { WorkoutSummaryScreen } from "../../WorkoutSummaryScreen";
import { coachLogState, sessionTimeRange } from "./coachLogged";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = "2026-11-02T01:42:00.000Z"; // 7:12 am IST

function execution(over: Record<string, unknown>) {
  return workoutExecutionSchema.parse({
    id: ids(1),
    assignmentId: ids(2),
    coachingRelationshipId: ids(3),
    planVersionId: ids(4),
    traineeUserId: ids(5),
    status: "completed",
    recordVersion: 1,
    startedAt: T,
    pausedAt: null,
    completedAt: "2026-11-02T02:34:00.000Z",
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [
      {
        id: ids(10),
        workoutExecutionId: ids(1),
        exerciseId: ids(11),
        name: "Bench press",
        order: 1,
        status: "completed",
        sets: [1, 2].map((n) => ({
          id: ids(20 + n),
          exerciseExecutionId: ids(10),
          setTargetId: ids(30 + n),
          order: n,
          status: "completed",
          prescribedReps: 8,
          prescribedLoadLabel: "40 kg",
          actualReps: 8,
          actualLoadLabel: "40 kg",
          completedAt: T,
          createdAt: T,
          updatedAt: T,
        })),
        createdAt: T,
        updatedAt: T,
      },
      {
        id: ids(12),
        workoutExecutionId: ids(1),
        exerciseId: ids(13),
        name: "Lat pulldown",
        order: 2,
        status: "completed",
        sets: [],
        createdAt: T,
        updatedAt: T,
      },
    ],
    createdAt: T,
    updatedAt: T,
    ...over,
  });
}

describe("coach-logged workout (Z9-11)", () => {
  it("classifies by role", () => {
    expect(coachLogState(execution({ loggedByRole: "coach" }))).toBe("logged");
    expect(
      coachLogState(
        execution({ loggedByRole: "trainee", lastEditedByRole: "coach" }),
      ),
    ).toBe("edited");
    expect(coachLogState(execution({ loggedByRole: "trainee" }))).toBeNull();
    expect(coachLogState(execution({}))).toBeNull();
  });

  it("formats the session range in the trainee time zone", () => {
    expect(sessionTimeRange(T, "2026-11-02T02:34:00.000Z", "Asia/Kolkata")).toBe(
      "7:12–8:04 am",
    );
  });

  it("shows the logged banner and no start, edit or note controls", () => {
    render(
      <CoachLoggedWorkoutScreen
        execution={execution({ loggedByRole: "coach" })}
        coachName="Rahul Verma"
        timeZone="Asia/Kolkata"
        onBack={() => undefined}
      />,
    );
    expect(screen.getByText("Logged by your coach")).toBeTruthy();
    expect(screen.getByText(/Mon 2 Nov · 7:12–8:04 am/)).toBeTruthy();
    expect(screen.getByText("Done")).toBeTruthy();
    expect(
      screen.getByText("Read-only · only your coach can change it"),
    ).toBeTruthy();
    expect(screen.queryByText(/start workout/i)).toBeNull();
    expect(screen.queryByText(/^edit/i)).toBeNull();
    expect(screen.queryByLabelText("Note for coach")).toBeNull();
  });

  it("shows the edited banner on the trainee's own summary", () => {
    render(
      <WorkoutSummaryScreen
        execution={execution({
          loggedByRole: "trainee",
          lastEditedByRole: "coach",
        })}
        onDone={() => undefined}
        coachName="Rahul Verma"
        timeZone="Asia/Kolkata"
      />,
    );
    expect(screen.getByText("Edited by your coach")).toBeTruthy();
    expect(screen.getByLabelText("Note for coach")).toBeTruthy();
  });

  it("shows no banner for the trainee's own log", () => {
    render(
      <WorkoutSummaryScreen
        execution={execution({ loggedByRole: "trainee" })}
        onDone={() => undefined}
      />,
    );
    expect(screen.queryByText(/by your coach/)).toBeNull();
  });
});
