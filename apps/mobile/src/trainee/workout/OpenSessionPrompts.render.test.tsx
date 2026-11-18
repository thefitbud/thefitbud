/**
 * Z12-45: the Workout tab's prompts for a workout that is open but not on
 * screen (W-18 resume after the app was closed, "Finish now" → W-16, discard
 * → W-15) and the minimised bar (W-14). Render harness: text, roles and what
 * goes into the outbox; layout is the visual check's.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  workoutAssignmentSchema,
  workoutExecutionSchema,
  type WorkoutAssignment,
  type WorkoutExecution,
} from "@fitbud/contracts";
import { act, fireEvent, render, screen } from "../../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const enqueued: Array<{ operation: string; payloadJson: string }> = [];
vi.mock("../../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../../sync/SyncProvider");
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      pushPending: async () => [],
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
      enqueue: async (row: { operation: string; payloadJson: string }) => {
        enqueued.push(row);
      },
    }),
  };
});

const { OpenSessionPrompts, resetResumePrompt } = await import("./OpenSessionPrompts");
const { MinimisedWorkoutBar } = await import("./MinimisedWorkoutBar");
const { closeActiveSession, openActiveSession, updateActiveSession } = await import(
  "./activeSession"
);

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const START = "2026-11-14T13:00:00.000Z";

function set(id: number, order: number, logged: boolean) {
  return {
    id: uuid(id),
    exerciseExecutionId: uuid(500),
    setTargetId: uuid(id + 1000),
    order,
    status: logged ? ("completed" as const) : ("pending" as const),
    prescribedReps: 10,
    prescribedLoadLabel: "40 kg",
    actualReps: logged ? 10 : null,
    actualLoadLabel: logged ? "40 kg" : null,
    completedAt: logged ? "2026-11-14T13:22:00.000Z" : null,
    createdAt: START,
    updatedAt: START,
  };
}

function execution(logged: number, status: "started" | "completed" = "started"): WorkoutExecution {
  return workoutExecutionSchema.parse({
    id: uuid(1),
    assignmentId: uuid(2),
    coachingRelationshipId: uuid(3),
    planVersionId: uuid(4),
    traineeUserId: uuid(5),
    status,
    recordVersion: 3,
    startedAt: START,
    pausedAt: null,
    completedAt: status === "completed" ? START : null,
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [
      {
        id: uuid(500),
        workoutExecutionId: uuid(1),
        exerciseId: uuid(600),
        name: "Romanian deadlift",
        order: 1,
        status: "pending",
        sets: [1, 2, 3].map((order) => set(10 + order, order, order <= logged)),
        createdAt: START,
        updatedAt: START,
      },
    ],
    createdAt: START,
    updatedAt: START,
  });
}

const assignment: WorkoutAssignment = workoutAssignmentSchema.parse({
  id: uuid(2),
  coachingRelationshipId: uuid(3),
  planId: uuid(6),
  planVersionId: uuid(4),
  workoutDayId: uuid(7),
  workoutDayName: "Lower body B",
  localDate: "2026-11-14",
  windowStartsAt: "2026-11-14T01:30:00.000Z",
  windowEndsAt: "2026-11-15T01:30:00.000Z",
  status: "in_progress",
  workoutDay: { id: uuid(7), order: 1, name: "Lower body B", exercises: [] },
  execution: null,
  createdAt: START,
  updatedAt: START,
});

function makeHandlers() {
  return {
    onResume: vi.fn<(assignment: WorkoutAssignment) => void>(),
    onFinished: vi.fn<(execution: WorkoutExecution, assignment: WorkoutAssignment) => void>(),
    onDiscarded: vi.fn<(execution: WorkoutExecution, assignment: WorkoutAssignment) => void>(),
  };
}
type Handlers = ReturnType<typeof makeHandlers>;

function renderPrompts(
  props: Partial<Parameters<typeof OpenSessionPrompts>[0]> = {},
): Handlers {
  const handlers = makeHandlers();
  render(
    <OpenSessionPrompts
      assignment={assignment}
      execution={execution(2)}
      canPrompt
      finishRequested={false}
      onFinishRequestHandled={() => undefined}
      coachFirst="Rahul"
      timeZone="Asia/Kolkata"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name }).at(-1)!);

beforeEach(() => {
  enqueued.length = 0;
  resetResumePrompt();
  closeActiveSession();
});

describe("resume after the app was closed (W-18)", () => {
  it("asks once, with what was logged and when, and Resume goes back to the log", () => {
    const { onResume } = renderPrompts();
    expect(screen.getByText("Pick up where you left off?")).toBeTruthy();
    expect(
      screen.getByText(
        "Lower body B was in progress. 2 sets were logged, the last at 6:52 pm.",
      ),
    ).toBeTruthy();
    tap("Resume workout");
    expect(onResume).toHaveBeenCalledWith(assignment);
    expect(enqueued).toHaveLength(0);
  });

  it("does not ask while a session is in memory or a start is under way, nor for a finished workout", () => {
    renderPrompts({ canPrompt: false });
    expect(screen.queryByText("Pick up where you left off?")).toBeNull();
    renderPrompts({ execution: execution(3, "completed") });
    expect(screen.queryByText("Pick up where you left off?")).toBeNull();
    renderPrompts({ assignment: null });
    expect(screen.queryByText("Pick up where you left off?")).toBeNull();
  });

  it("asks about one execution once per launch", () => {
    const first = render(
      <OpenSessionPrompts
        assignment={assignment}
        execution={execution(2)}
        canPrompt
        finishRequested={false}
        onFinishRequestHandled={() => undefined}
        coachFirst="Rahul"
        timeZone="Asia/Kolkata"
        onResume={() => undefined}
        onFinished={() => undefined}
        onDiscarded={() => undefined}
      />,
    );
    expect(screen.getByText("Pick up where you left off?")).toBeTruthy();
    first.unmount();
    renderPrompts();
    expect(screen.queryByText("Pick up where you left off?")).toBeNull();
  });

  it("Finish and save shows what is not logged, then completes the workout as it stands", async () => {
    const { onFinished } = renderPrompts();
    tap("Finish and save");
    expect(screen.getByText("Finish early?")).toBeTruthy();
    expect(screen.getByText(/1 of 3 sets aren’t logged\. Rahul will see which sets you did\./)).toBeTruthy();
    expect(screen.getByText("Set 3")).toBeTruthy();
    await act(async () => {
      tap("Finish anyway");
    });
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]!.operation).toBe("workout.complete");
    expect(JSON.parse(enqueued[0]!.payloadJson)).toMatchObject({
      executionId: uuid(1),
      assignmentId: uuid(2),
      expectedVersion: 3,
      workoutName: "Lower body B",
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    const [finished] = onFinished.mock.calls[0]!;
    expect(finished!.status).toBe("completed");
    expect(finished!.exercises[0]!.sets[2]!.status).toBe("pending");
  });

  it("Discard asks first, then records the workout as skipped", async () => {
    const { onDiscarded } = renderPrompts();
    tap("Discard");
    expect(screen.getByText("Discard this workout?")).toBeTruthy();
    expect(
      screen.getByText("2 logged sets won’t count. Rahul will see this workout as skipped."),
    ).toBeTruthy();
    expect(enqueued).toHaveLength(0);
    await act(async () => {
      tap("Discard workout");
    });
    expect(enqueued[0]!.operation).toBe("workout.skip");
    expect(JSON.parse(enqueued[0]!.payloadJson)).toMatchObject({ assignmentId: uuid(2) });
    expect(onDiscarded).toHaveBeenCalledTimes(1);
    expect(onDiscarded.mock.calls[0]![0].status).toBe("skipped");
  });
});

describe("Finish now on the in-progress card (W-01b → W-16)", () => {
  it("opens the same sheet without the resume dialog", () => {
    const handled = vi.fn();
    renderPrompts({ canPrompt: false, finishRequested: true, onFinishRequestHandled: handled });
    expect(handled).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Finish early?")).toBeTruthy();
    expect(screen.queryByText("Pick up where you left off?")).toBeNull();
  });

  it("finishes at once when every set is logged and no effort is asked for", async () => {
    let handlers: Handlers | null = null;
    await act(async () => {
      handlers = renderPrompts({
        canPrompt: false,
        execution: execution(3),
        finishRequested: true,
      });
    });
    expect(screen.queryByText("Finish early?")).toBeNull();
    expect(enqueued[0]!.operation).toBe("workout.complete");
    expect(handlers!.onFinished).toHaveBeenCalledTimes(1);
  });
});

describe("minimised workout bar (W-14)", () => {
  it("shows the open session only while it is minimised, and Resume asks for the log back", () => {
    const onResume = vi.fn();
    render(<MinimisedWorkoutBar relationshipId={uuid(3)} onResume={onResume} />);
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      openActiveSession({ relationshipId: uuid(3), execution: execution(2), assignment });
    });
    // On screen: no bar.
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      updateActiveSession(uuid(3), { minimised: true });
    });
    const bar = screen.getByRole("button");
    expect(bar.getAttribute("aria-label")).toMatch(
      /^Lower body B, in progress, [0-9:]+\. Romanian deadlift · set 3 of 3\. Resume$/,
    );
    fireEvent.click(bar);
    expect(onResume).toHaveBeenCalledTimes(1);
    act(() => {
      closeActiveSession(uuid(3));
    });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("never shows another relationship's session", () => {
    act(() => {
      openActiveSession({ relationshipId: uuid(3), execution: execution(1), assignment });
      updateActiveSession(uuid(3), { minimised: true });
    });
    render(<MinimisedWorkoutBar relationshipId={uuid(99)} onResume={() => undefined} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
