/**
 * The workout summary on v3 (W-17a → W-17b, Z12-44). The week card's ticks
 * and its "N of M done" must agree even when the week list the tab holds was
 * loaded before the finish (ISSUE-MAP #10: "3 of 3" beside two ticks).
 */
import { describe, expect, it, vi } from "vitest";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { fireEvent, render, screen } from "../test/render";
import { WorkoutSummaryScreen } from "./WorkoutSummaryScreen";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function assignment(
  n: number,
  localDate: string,
  status: WorkoutAssignment["status"],
  name = `Workout ${n}`,
): WorkoutAssignment {
  return {
    id: uuid(100 + n),
    coachingRelationshipId: uuid(1),
    planId: uuid(2),
    planVersionId: uuid(3),
    workoutDayId: uuid(200 + n),
    workoutDayName: name,
    localDate,
    windowStartsAt: `${localDate}T13:00:00.000Z`,
    windowEndsAt: `${localDate}T18:00:00.000Z`,
    status,
    scheduleStatus: "scheduled",
    workoutDay: {
      id: uuid(200 + n),
      order: n,
      name,
      required: true,
      exercises: [],
    },
    execution: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  } as WorkoutAssignment;
}

const finishedAssignment = assignment(4, "2026-11-14", "in_progress", "Lower body B");

const execution = {
  id: uuid(900),
  assignmentId: finishedAssignment.id,
  coachingRelationshipId: uuid(1),
  planVersionId: uuid(3),
  traineeUserId: uuid(5),
  status: "completed",
  recordVersion: 4,
  startedAt: "2026-11-14T13:00:00.000Z",
  pausedAt: null,
  completedAt: "2026-11-14T13:52:00.000Z",
  sessionRpe: null,
  requireSessionRpe: false,
  loggedByRole: "trainee",
  lastEditedByRole: null,
  exercises: [
    {
      id: uuid(300),
      workoutExecutionId: uuid(900),
      exerciseId: uuid(400),
      name: "Romanian deadlift",
      order: 1,
      status: "completed",
      sets: [1, 2].map((order) => ({
        id: uuid(500 + order),
        exerciseExecutionId: uuid(300),
        setTargetId: uuid(600 + order),
        order,
        status: order === 2 ? "modified" : "completed",
        prescribedReps: 10,
        prescribedLoadLabel: "40 kg",
        actualReps: 10,
        actualLoadLabel: order === 2 ? "42.5 kg" : "40 kg",
        completedAt: "2026-11-14T13:30:00.000Z",
        createdAt: "2026-11-14T13:00:00.000Z",
        updatedAt: "2026-11-14T13:30:00.000Z",
      })),
      createdAt: "2026-11-14T13:00:00.000Z",
      updatedAt: "2026-11-14T13:30:00.000Z",
    },
  ],
  createdAt: "2026-11-14T13:00:00.000Z",
  updatedAt: "2026-11-14T13:52:00.000Z",
} as WorkoutExecution;

// Loaded before the finish: Saturday's workout still reads in progress.
const staleWeek = [
  assignment(1, "2026-11-09", "completed"),
  assignment(2, "2026-11-11", "completed"),
  assignment(3, "2026-11-12", "completed"),
  finishedAssignment,
];

function renderSummary(onDone = vi.fn()) {
  render(
    <WorkoutSummaryScreen
      execution={execution}
      assignment={finishedAssignment}
      coachName="Rahul Verma"
      weekAssignments={staleWeek}
      weekStart="2026-11-09"
      today="2026-11-14"
      timeZone="Asia/Kolkata"
      onDone={onDone}
    />,
  );
  return onDone;
}

describe("WorkoutSummaryScreen v3", () => {
  it("shows the session figures and what changed (W-17a)", () => {
    renderSummary();
    expect(screen.getByText("LOWER BODY B · SAT 14 NOV")).toBeTruthy();
    expect(screen.getByText("Workout done")).toBeTruthy();
    expect(screen.getByLabelText("Duration 52 min")).toBeTruthy();
    expect(screen.getByLabelText("Volume 825 kg")).toBeTruthy();
    expect(screen.getByLabelText("Sets 2 / 2")).toBeTruthy();
    expect(screen.getByText("CHANGED FROM THE PLAN · RAHUL SEES THIS")).toBeTruthy();
    expect(screen.getByText("40 kg → 42.5 kg")).toBeTruthy();
    // No field that would be thrown away: there is no endpoint for a note.
    expect(screen.queryByLabelText("Note for coach")).toBeNull();
  });

  it("moves to the shared step with the week's ticks equal to its count (W-17b, ISSUE-MAP #10)", () => {
    const onDone = renderSummary();
    fireEvent.click(screen.getByRole("button", { name: "Save and share with Rahul" }));
    expect(screen.getByText("Shared with Rahul")).toBeTruthy();
    expect(screen.getByText("4 of 4 done")).toBeTruthy();
    const ticks = screen.getAllByLabelText(/, done$/);
    expect(ticks).toHaveLength(4);
    expect(screen.getAllByLabelText(/, not done$/)).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("says the workout is on the phone when offline", () => {
    render(
      <WorkoutSummaryScreen
        execution={execution}
        assignment={finishedAssignment}
        coachName="Rahul Verma"
        weekAssignments={staleWeek}
        weekStart="2026-11-09"
        offline
        onDone={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and share with Rahul" }));
    expect(screen.getByText("Saved on your phone")).toBeTruthy();
  });
});
