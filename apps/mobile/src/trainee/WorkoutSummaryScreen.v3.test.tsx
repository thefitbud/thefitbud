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

  it("says the workout is on the phone when offline (W-17a4)", () => {
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
    expect(screen.getByTestId("offline-banner")).toBeTruthy();
    expect(
      screen.getByText(
        "You're offline. Your workout is saved on your phone and sends to Rahul when you're back.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save and share with Rahul" }));
    expect(screen.getByText("Saved on your phone")).toBeTruthy();
  });

  it("asks how hard it was, optional, and queues the pick with the next version (W-17a2)", () => {
    const onSaveRpe = vi.fn();
    render(
      <WorkoutSummaryScreen
        execution={execution}
        assignment={finishedAssignment}
        coachName="Rahul Verma"
        onSaveRpe={onSaveRpe}
        onDone={() => undefined}
      />,
    );
    expect(screen.getByText("HOW HARD WAS IT?")).toBeTruthy();
    expect(screen.getByText("Optional")).toBeTruthy();
    expect(screen.getByText("1 Very easy · 5 Hard · 10 Max effort")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save and share with Rahul" });
    expect((save as HTMLButtonElement).disabled).toBeFalsy();
    fireEvent.click(screen.getByRole("radio", { name: "7 of 10" }));
    expect(onSaveRpe).toHaveBeenLastCalledWith(7, 5);
    // Choosing it again clears it (optional); each change takes the next version.
    fireEvent.click(screen.getByRole("radio", { name: "7 of 10" }));
    expect(onSaveRpe).toHaveBeenLastCalledWith(null, 6);
  });

  it("shows a rating chosen at the finish as selected, with no second prompt", () => {
    render(
      <WorkoutSummaryScreen
        execution={{ ...execution, sessionRpe: 8, requireSessionRpe: true }}
        assignment={finishedAssignment}
        coachName="Rahul Verma"
        onDone={() => undefined}
      />,
    );
    expect(screen.getByText("Rahul asks for this")).toBeTruthy();
    // The chosen value is read back beside the grid, so no "Tap a number" prompt.
    expect(screen.queryByText("Tap a number")).toBeNull();
    expect(screen.getAllByText("8")).toHaveLength(2);
    const save = screen.getByRole("button", { name: "Save and share with Rahul" });
    expect((save as HTMLButtonElement).disabled).toBeFalsy();
  });

  it("holds Save and share until a rating is chosen when the plan requires it (W-17a3)", () => {
    render(
      <WorkoutSummaryScreen
        execution={{ ...execution, requireSessionRpe: true }}
        assignment={finishedAssignment}
        coachName="Rahul Verma"
        onSaveRpe={vi.fn()}
        onDone={() => undefined}
      />,
    );
    const save = () =>
      screen.getByRole("button", { name: "Save and share with Rahul" }) as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    expect(screen.getByText("Pick how hard it was to save.")).toBeTruthy();
    expect(screen.getByText("Tap a number")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "6 of 10" }));
    expect(save().disabled).toBe(false);
    expect(screen.queryByText("Pick how hard it was to save.")).toBeNull();
  });

  describe("View summary (W-17c, W-17c3)", () => {
    const viewed = {
      ...execution,
      sessionRpe: 7,
      feedbackEditableUntil: "2026-11-16T13:52:00.000Z",
    } as WorkoutExecution;
    const during = new Date("2026-11-15T10:00:00.000Z");

    function renderView(over: Partial<WorkoutExecution> = {}, now = during, onSaveRpe = vi.fn()) {
      const onDone = vi.fn();
      render(
        <WorkoutSummaryScreen
          mode="view"
          execution={{ ...viewed, ...over }}
          assignment={finishedAssignment}
          coachName="Rahul Verma"
          now={now}
          onSaveRpe={onSaveRpe}
          onDone={onDone}
        />,
      );
      return { onDone, onSaveRpe };
    }

    it("is read-only with one Done and never offers Save and share", () => {
      const { onDone } = renderView();
      expect(screen.queryByRole("button", { name: /Save and share/ })).toBeNull();
      expect(screen.queryByRole("radio")).toBeNull();
      expect(screen.getByText("YOUR RATING")).toBeTruthy();
      expect(screen.getByText("7 of 10")).toBeTruthy();
      expect(screen.getByText("Sent to Rahul")).toBeTruthy();
      expect(screen.getByText("Shared Sat 14 Nov, 7:22 pm")).toBeTruthy();
      expect(screen.queryByText(/note/i)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("lets the trainee change the rating inside the 48 h window and queues it (W-17c2)", () => {
      const { onSaveRpe } = renderView();
      expect(
        screen.getByText("You can change this until Mon 16 Nov, 7:22 pm."),
      ).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Change your rating" }));
      expect(screen.getByText("Your rating")).toBeTruthy();
      fireEvent.click(screen.getByRole("radio", { name: "9 of 10" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSaveRpe).toHaveBeenCalledTimes(1);
      expect(onSaveRpe).toHaveBeenCalledWith(9, 4);
      expect(screen.getByText("9 of 10")).toBeTruthy();
    });

    it("clears the rating when it is optional", () => {
      const { onSaveRpe } = renderView();
      fireEvent.click(screen.getByRole("button", { name: "Change your rating" }));
      fireEvent.click(screen.getByRole("radio", { name: "7 of 10" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(onSaveRpe).toHaveBeenCalledWith(null, 4);
      expect(screen.getByText("Not rated")).toBeTruthy();
    });

    it("cancel saves nothing", () => {
      const { onSaveRpe } = renderView();
      fireEvent.click(screen.getByRole("button", { name: "Change your rating" }));
      fireEvent.click(screen.getByRole("radio", { name: "2 of 10" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onSaveRpe).not.toHaveBeenCalled();
      expect(screen.getByText("7 of 10")).toBeTruthy();
    });

    it("hides Change at and after the 48 h boundary (W-17c3)", () => {
      renderView({}, new Date("2026-11-16T13:52:00.000Z"));
      expect(screen.queryByRole("button", { name: "Change your rating" })).toBeNull();
      expect(
        screen.getByText("Ratings can be changed for 48 hours after a workout."),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();
    });

    it("shows Not rated and no Change when the API gives no window", () => {
      renderView({ sessionRpe: null, feedbackEditableUntil: null });
      expect(screen.getByText("Not rated")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Change your rating" })).toBeNull();
    });
  });
});
