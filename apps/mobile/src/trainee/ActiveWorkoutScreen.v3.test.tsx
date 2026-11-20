/**
 * The active workout log (Z12-45, on Z9-7's set entry): the kg keypad with
 * ±2.5 steps, Bodyweight, the numeric `actualLoadKg` that goes into the
 * outbox, the rest bar and its end, the exercise menu, skip with Undo, the
 * set sheet, finish early, pause, minimise, discard and the record banner.
 * DOM-shaped (react-native-web), so layout is checked in the visual captures,
 * not here; swiping a set is native-only and is walked on the device.
 *
 * Z12-63: under system dark the screen opts into v3 tokens (not light-only).
 */
import { useState } from "react";
import { Appearance, Vibration } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { USER_FACING_OFFLINE } from "@fitbud/api-client";
import {
  workoutExecutionSchema,
  completeSetRequestSchema,
  workoutAssignmentSchema,
  type WorkoutAssignment,
  type WorkoutExecution,
} from "@fitbud/contracts";
import { themes } from "@fitbud/ui-mobile";
import { act, mockAuth, render, screen, fireEvent } from "../test/render";
import { ThemeProvider } from "../providers/ThemeProvider";
import {
  backspace,
  initialDraft,
  loadBody,
  pressKey,
  prescribedLoadText,
  stepValue,
} from "./workout/setEntry";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const enqueued: Array<{ operation: string; payloadJson: string }> = [];
/** Every API call the screen made, in order. */
const apiCalls: Array<{ method: string; args: unknown[] }> = [];
/** Make the next call of a method reject (a request that did not land). */
const failNext: Record<string, boolean> = {};
/** What `getStrength` answers; null answers like any other list. */
let strength: unknown = null;

const auth = mockAuth({
  api: new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "then") return undefined;
        return async (...args: unknown[]) => {
          apiCalls.push({ method: key, args });
          if (failNext[key]) {
            failNext[key] = false;
            throw new Error("network down");
          }
          if (key === "getStrength" && strength) return strength;
          return { items: [], nextCursor: null };
        };
      },
    },
  ),
  me: { id: uuid(9), email: "aarav.ontrack@demo.fitbud.test", timezone: "Asia/Kolkata" },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      pushPending: async () => {
        apiCalls.push({ method: "pushPending", args: [] });
        return [];
      },
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

const { ActiveWorkoutScreen, SKIP_UNDO_MS } = await import("./ActiveWorkoutScreen");

const NOW = "2026-11-11T06:00:00.000Z";

function set(n: number, order: number, load: string | null, reps: number) {
  return {
    id: uuid(n),
    exerciseExecutionId: uuid(500),
    setTargetId: uuid(n + 100),
    order,
    status: "pending" as const,
    prescribedReps: reps,
    prescribedLoadLabel: load,
    actualReps: null,
    actualLoadLabel: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function execution(load: string | null): WorkoutExecution {
  return workoutExecutionSchema.parse({
    id: uuid(1),
    assignmentId: uuid(2),
    coachingRelationshipId: uuid(3),
    planVersionId: uuid(4),
    traineeUserId: uuid(9),
    status: "started",
    recordVersion: 1,
    startedAt: NOW,
    pausedAt: null,
    completedAt: null,
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
        sets: [set(10, 1, load, 10), set(11, 2, load, 10)],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

/** The same session with a second exercise, "Step-ups" (two sets, 20 kg). */
function twoExercises(): WorkoutExecution {
  const ex = execution("20 kg");
  ex.exercises[0]!.sets[0] = {
    ...ex.exercises[0]!.sets[0]!,
    status: "completed",
    actualReps: 10,
    actualLoadLabel: "20 kg",
    completedAt: NOW,
  };
  ex.exercises.push({
    ...ex.exercises[0]!,
    id: uuid(501),
    exerciseId: uuid(601),
    name: "Step-ups",
    order: 2,
    sets: [set(20, 1, "20 kg", 10), set(21, 2, "20 kg", 10)].map((x) => ({
      ...x,
      exerciseExecutionId: uuid(501),
    })),
  });
  return ex;
}

/** The assignment of `execution()`, for the screens that read history. */
function assignment(): WorkoutAssignment {
  return workoutAssignmentSchema.parse({
    id: uuid(2),
    coachingRelationshipId: uuid(3),
    planId: uuid(5),
    planVersionId: uuid(4),
    workoutDayId: uuid(6),
    workoutDayName: "Lower body B",
    localDate: "2026-11-11",
    windowStartsAt: "2026-11-10T18:30:00.000Z",
    windowEndsAt: "2026-11-11T18:29:59.000Z",
    status: "in_progress",
    workoutDay: {
      id: uuid(6),
      order: 1,
      name: "Lower body B",
      exercises: [
        {
          id: uuid(600),
          order: 1,
          name: "Romanian deadlift",
          instructions: "Soft knees, push the hips back.",
          primaryMuscles: ["Hamstrings"],
          equipment: ["Barbell"],
          setTargets: [],
        },
      ],
    },
    execution: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

type HarnessOptions = {
  onFinished?: (execution: WorkoutExecution) => void;
  onExit?: () => void;
  onMinimise?: () => void;
  onAskCoach?: (exerciseName?: string) => void;
  coachName?: string;
  assignment?: WorkoutAssignment;
};

function Harness({
  initial,
  options,
}: {
  initial: WorkoutExecution;
  options: HarnessOptions;
}) {
  const [exec, setExec] = useState(initial);
  return (
    <ActiveWorkoutScreen
      execution={exec}
      assignment={options.assignment ?? null}
      onChange={setExec}
      onFinished={options.onFinished ?? (() => undefined)}
      onExit={options.onExit ?? (() => undefined)}
      onMinimise={options.onMinimise}
      onAskCoach={options.onAskCoach}
      coachName={options.coachName}
      sessionName="Lower body B"
    />
  );
}

function renderScreen(
  load: string | null,
  ex: WorkoutExecution = execution(load),
  options: HarnessOptions = {},
) {
  render(<Harness initial={ex} options={options} />);
}

const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name }).at(-1)!);

function lastBody() {
  const row = enqueued.at(-1)!;
  expect(row.operation).toBe("workout.complete_set");
  return JSON.parse(row.payloadJson).body as Record<string, unknown>;
}

beforeEach(() => {
  enqueued.length = 0;
  apiCalls.length = 0;
  for (const key of Object.keys(failNext)) delete failNext[key];
  strength = null;
});

describe("set entry maths", () => {
  it("steps load by 2.5 and keeps it between 0 and 500", () => {
    expect(stepValue("20", 1, "load")).toBe("22.5");
    expect(stepValue("22.5", -1, "load")).toBe("20");
    expect(stepValue("1", -1, "load")).toBe("0");
    expect(stepValue("499", 1, "load")).toBe("500");
    expect(stepValue("", 1, "load")).toBe("2.5");
  });

  it("steps reps by 1 and keeps them between 1 and 100", () => {
    expect(stepValue("8", 1, "reps")).toBe("9");
    expect(stepValue("1", -1, "reps")).toBe("1");
    expect(stepValue("100", 1, "reps")).toBe("100");
  });

  it("types digits and one decimal point, replacing the value first", () => {
    let v = pressKey("20", "2", "load", true);
    expect(v).toBe("2");
    v = pressKey(v, "2", "load", false);
    v = pressKey(v, ".", "load", false);
    v = pressKey(v, "5", "load", false);
    expect(v).toBe("22.5");
    expect(pressKey(v, ".", "load", false)).toBe("22.5");
  });

  it("limits to two decimals, 500 kg and 100 reps; reps take no decimal point", () => {
    expect(pressKey("22.55", "1", "load", false)).toBe("22.55");
    expect(pressKey("500", "1", "load", false)).toBe("500");
    expect(pressKey("10", "1", "reps", false)).toBe("10");
    expect(pressKey("1", "0", "reps", false)).toBe("10");
    expect(pressKey("", ".", "reps", false)).toBe("");
    expect(backspace("22.5", false)).toBe("22.");
  });

  it("builds a numeric load body, or Bodyweight, or nothing for a free-text prescription", () => {
    expect(loadBody(initialDraft("20 kg", 10), "20 kg")).toEqual({ actualLoadLabel: null });
    expect(loadBody({ load: "22.5", reps: "10", bodyweight: false }, "20 kg")).toEqual({
      actualLoadKg: 22.5,
    });
    expect(loadBody({ load: "20", reps: "10", bodyweight: true }, "20 kg")).toEqual({
      actualLoadLabel: "Bodyweight",
    });
    // A bare number prescription, untouched, is not a change.
    expect(loadBody(initialDraft("40", 10), "40")).toEqual({ actualLoadLabel: null });
    expect(loadBody({ load: "42.5", reps: "10", bodyweight: false }, "40")).toEqual({
      actualLoadKg: 42.5,
    });
    expect(loadBody(initialDraft("BW+10", 10), "BW+10")).toEqual({ actualLoadLabel: null });
    expect(loadBody(initialDraft(null, 10), null)).toEqual({ actualLoadLabel: null });
  });

  it("every body it builds passes the API's complete-set schema", () => {
    for (const body of [
      loadBody({ load: "22.5", reps: "10", bodyweight: false }, "20 kg"),
      loadBody({ load: "", reps: "10", bodyweight: true }, "20 kg"),
    ]) {
      expect(completeSetRequestSchema.safeParse(body).success).toBe(true);
    }
  });
});

describe("ActiveWorkoutScreen set entry (W-04)", () => {
  it("opens the kg keypad, steps +2.5, moves to reps and sends a numeric load", () => {
    renderScreen("20 kg");
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load: 20 kg/ }));
    expect(screen.getByText(/Set 1 · Weight \(kg\)/)).toBeTruthy();
    tap("Plus 2.5");
    expect(screen.getByRole("button", { name: /Set 1 load: 22.5 kg/ })).toBeTruthy();
    tap("Next: reps");
    expect(screen.getByText(/Set 1 · Reps/)).toBeTruthy();
    tap("Log set 1");
    expect(lastBody()).toEqual({ actualReps: 10, actualLoadKg: 22.5 });
  });

  it("types a weight on the keypad", () => {
    renderScreen("20 kg");
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load/ }));
    tap("6");
    tap("2");
    tap("Decimal point");
    tap("5");
    tap("Next: reps");
    tap("Log set 1");
    expect(lastBody().actualLoadKg).toBe(62.5);
  });

  it("Bodyweight sends the Bodyweight label and no kg, and drops the kg cell", () => {
    renderScreen("20 kg");
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load/ }));
    tap("Use bodyweight");
    expect(screen.queryByRole("button", { name: /Set 1 load/ })).toBeNull();
    expect(screen.getByText(/Set 1 · Reps/)).toBeTruthy();
    tap("Log set 1");
    const body = lastBody();
    expect(body.actualLoadLabel).toBe("Bodyweight");
    expect(body).not.toHaveProperty("actualLoadKg");
  });

  it("a bodyweight prescription has no kg cell, and switching to kg goes to the weight keypad", () => {
    renderScreen(null);
    expect(screen.queryByRole("button", { name: /Set 1 load/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Set 1 reps/ }));
    tap("Plus 1");
    expect(screen.getByRole("button", { name: /Set 1 reps: 11/ })).toBeTruthy();
    tap("Use a weight in kg");
    expect(screen.getByText(/Set 1 · Weight \(kg\)/)).toBeTruthy();
    tap("4");
    tap("0");
    tap("Next: reps");
    tap("Log set 1");
    expect(lastBody()).toEqual({ actualReps: 11, actualLoadKg: 40 });
  });

  it("logging an unchanged prescribed bodyweight set keeps the prescribed load", () => {
    renderScreen(null);
    tap(/^Log set 1/);
    expect(lastBody()).toEqual({ actualReps: 10, actualLoadLabel: null });
  });

  it("shows the raw prescription for a free-text load and invents no kg", () => {
    expect(prescribedLoadText("RPE 7")).toBe("RPE 7");
    expect(prescribedLoadText("90 lb")).toBe("90 lb");
    expect(prescribedLoadText("BW")).toBe("bodyweight");
    expect(prescribedLoadText("22.5 kg")).toBe("22.5 kg");
    renderScreen("RPE 7");
    expect(screen.getByRole("button", { name: "Set 1 load: RPE 7" })).toBeTruthy();
    tap(/^Log set 1/);
    expect(lastBody()).toEqual({ actualReps: 10, actualLoadLabel: null });
  });

  it("any set can be logged first: the trainee moves freely (W-03)", () => {
    renderScreen("20 kg", twoExercises());
    // Set 2 of the second exercise, before anything else.
    fireEvent.click(screen.getAllByRole("button", { name: /^Log set 2 ·/ }).at(-1)!);
    const row = JSON.parse(enqueued.at(-1)!.payloadJson);
    expect(row.setExecutionId).toBe(uuid(21));
    // The log carries on in that exercise, not back at the top.
    expect(screen.getByText("Rest · next set 1")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /^Set 2, 20 kg × 10, logged/ }),
    ).toHaveLength(1);
  });
});

describe("rest bar (W-05a, W-05b)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts after a logged set, names the next set, and Skip ends it", () => {
    renderScreen("20 kg");
    tap(/^Log set 1/);
    expect(screen.getByText("Rest · next set 2")).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe("1:30");
    expect(screen.getByText("−15")).toBeTruthy();
    expect(screen.getByText("+15")).toBeTruthy();
    tap("Skip rest");
    expect(screen.queryByText("Rest · next set 2")).toBeNull();
    expect(screen.queryByText("Rest done")).toBeNull();
  });

  it("counts down from the end instant, moves by 15 s, and buzzes once at the end", () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T06:10:00.000Z") });
    const vibrate = vi.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
    renderScreen("20 kg");
    tap(/^Log set 1/);
    expect(screen.getByRole("timer").textContent).toBe("1:30");
    act(() => {
      vi.advanceTimersByTime(32_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("0:58");
    tap("15 seconds more");
    expect(screen.getByRole("timer").textContent).toBe("1:13");
    tap("15 seconds less");
    tap("15 seconds less");
    expect(screen.getByRole("timer").textContent).toBe("0:43");
    expect(vibrate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(43_000);
    });
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByText("Rest done")).toBeTruthy();
    expect(screen.getByText("Next: set 2 · 20 kg × 10")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledTimes(1);
    tap("OK");
    expect(screen.queryByText("Rest done")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("a skipped rest never buzzes", () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T06:10:00.000Z") });
    const vibrate = vi.spyOn(Vibration, "vibrate").mockImplementation(() => undefined);
    renderScreen("20 kg");
    tap(/^Log set 1/);
    tap("Skip rest");
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("exercise menu and set actions (W-08, W-09, W-09b, W-13)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("with nothing on the plan, the ⋯ menu hides How to and History opens History", () => {
    const onAskCoach = vi.fn();
    renderScreen("20 kg", execution("20 kg"), { onAskCoach });
    tap("More for Romanian deadlift");
    expect(screen.queryByRole("button", { name: "How to do it" })).toBeNull();
    expect(screen.getByRole("button", { name: "History and records" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Skip exercise/ })).toBeTruthy();
    tap("History and records");
    expect(onAskCoach).not.toHaveBeenCalled();
    expect(screen.queryByRole("tab", { name: "How to" })).toBeNull();
    expect(screen.getByText("No logged sets for this exercise yet.")).toBeTruthy();
    expect(
      screen.queryByText("Your coach hasn’t added notes for this exercise."),
    ).toBeNull();
    tap("Back to workout");
    expect(screen.getByRole("button", { name: "More for Romanian deadlift" })).toBeTruthy();
  });

  it("with a coach note on the plan, How to opens the note, not the coach message", async () => {
    const onAskCoach = vi.fn();
    await act(async () => {
      renderScreen("20 kg", execution("20 kg"), {
        onAskCoach,
        assignment: assignment(),
      });
    });
    tap("More for Romanian deadlift");
    expect(screen.getByRole("button", { name: "How to do it" })).toBeTruthy();
    tap("How to do it");
    expect(onAskCoach).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "How to" })).toBeTruthy();
    expect(screen.getByText("Soft knees, push the hips back.")).toBeTruthy();
    expect(screen.getByText("Hamstrings")).toBeTruthy();
  });

  it("Ask the coach passes the exercise it is about", () => {
    const onAskCoach = vi.fn();
    renderScreen("20 kg", execution("20 kg"), { onAskCoach, coachName: "Rahul Verma" });
    tap("More for Romanian deadlift");
    tap(/^Ask Rahul about this/);
    expect(onAskCoach).toHaveBeenCalledWith("Romanian deadlift");
  });

  it("Skip exercise skips what is left, Undo puts it back, and nothing is sent before the Undo has gone", () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T06:10:00.000Z") });
    renderScreen("20 kg", twoExercises());
    tap("More for Step-ups");
    tap(/^Skip exercise/);
    expect(screen.getByText("Step-ups skipped")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Step-ups, Skipped/ })).toBeTruthy();
    expect(apiCalls.filter((call) => call.method === "skipWorkoutSet")).toHaveLength(0);
    tap("Undo");
    expect(screen.queryByText("Step-ups skipped")).toBeNull();
    expect(screen.getByRole("button", { name: "More for Step-ups" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(SKIP_UNDO_MS + 1000);
    });
    expect(apiCalls.filter((call) => call.method === "skipWorkoutSet")).toHaveLength(0);
  });

  it("a skip is sent set by set once its Undo has gone", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-11T06:10:00.000Z") });
    renderScreen("20 kg", twoExercises());
    tap("More for Step-ups");
    tap(/^Skip exercise/);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SKIP_UNDO_MS + 100);
    });
    expect(
      apiCalls.filter((call) => call.method === "skipWorkoutSet").map((call) => call.args),
    ).toEqual([
      [uuid(1), uuid(20)],
      [uuid(1), uuid(21)],
    ]);
    expect(screen.queryByText("Step-ups skipped")).toBeNull();
  });

  it("one set can be skipped from its options, and a skipped set can still be logged", () => {
    renderScreen("20 kg");
    tap("Set 2 options");
    expect(screen.getByText("Set 2 · Romanian deadlift")).toBeTruthy();
    expect(screen.getByText("Not logged yet")).toBeTruthy();
    tap("Skip set");
    expect(screen.getByText("Set 2 skipped")).toBeTruthy();
    tap(/^Set 2, skipped/);
    // The row and the sheet both say so.
    expect(screen.getAllByText("Skipped")).toHaveLength(2);
    tap("Log set");
    expect(lastBody()).toEqual({ actualReps: 10, actualLoadLabel: null });
    expect(JSON.parse(enqueued.at(-1)!.payloadJson).setExecutionId).toBe(uuid(11));
    expect(screen.getByRole("button", { name: /^Set 2, 20 kg × 10, logged/ })).toBeTruthy();
  });

  it("a logged set can be corrected: the new values go out as the same set", () => {
    renderScreen("20 kg");
    tap(/^Log set 1/);
    tap(/^Set 1, 20 kg × 10, logged/);
    expect(screen.getByText("Set 1 · Romanian deadlift")).toBeTruthy();
    expect(screen.getByText(/^Logged 20 kg × 10 at /)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Weight you used, in kg"), { target: { value: "22.5" } });
    fireEvent.change(screen.getByLabelText("Reps you did"), { target: { value: "8" } });
    tap("Save changes");
    expect(enqueued.filter((row) => row.operation === "workout.complete_set")).toHaveLength(2);
    expect(lastBody()).toEqual({ actualReps: 8, actualLoadKg: 22.5 });
    expect(JSON.parse(enqueued.at(-1)!.payloadJson).setExecutionId).toBe(uuid(10));
    expect(screen.getByRole("button", { name: /^Set 1, 22.5 kg × 8, logged/ })).toBeTruthy();
  });

  it("Mark not done sends queued logs first, then the skip, and the set reads skipped", async () => {
    renderScreen("20 kg");
    tap(/^Log set 1/);
    tap(/^Set 1, 20 kg × 10, logged/);
    await act(async () => {
      tap("Mark not done");
    });
    // Queued logs are sent first, so the skip cannot land before the log it undoes.
    expect(apiCalls.slice(-2)).toEqual([
      { method: "pushPending", args: [] },
      { method: "skipWorkoutSet", args: [uuid(1), uuid(10)] },
    ]);
    expect(screen.getByRole("button", { name: /^Set 1, skipped/ })).toBeTruthy();
  });

  it("Mark not done that does not reach the server leaves the set logged and says so", async () => {
    failNext.skipWorkoutSet = true;
    renderScreen("20 kg");
    tap(/^Log set 1/);
    tap(/^Set 1, 20 kg × 10, logged/);
    await act(async () => {
      tap("Mark not done");
    });
    expect(screen.getByRole("button", { name: /^Set 1, 20 kg × 10, logged/ })).toBeTruthy();
    // Network failure → Z12-64 offline copy (not the WO-UNLOG fallback).
    expect(screen.getByRole("alert").textContent).toBe(USER_FACING_OFFLINE);
  });
});

describe("finish, pause, minimise and discard (W-14, W-15, W-16, W-19)", () => {
  it("Finish early opens when the set sheet closes and Finish is requested in the same tick", () => {
    renderScreen("20 kg");
    tap("Set 2 options");
    expect(screen.getByText("Set 2 · Romanian deadlift")).toBeTruthy();
    // Same tick as a fast tap (and the F06c race): dismiss the set sheet and
    // request Finish together. requestFinish must still present "Finish early?".
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Dismiss sheet" }));
      fireEvent.click(screen.getByRole("button", { name: "Finish workout" }));
    });
    expect(screen.getByText("Finish early?")).toBeTruthy();
  });

  it("Finish mid-session lists what is not logged; Go to makes that set current; Finish anyway completes", async () => {
    const onFinished = vi.fn();
    renderScreen("20 kg", twoExercises(), { onFinished });
    tap("Finish workout");
    expect(screen.getByText("Finish early?")).toBeTruthy();
    expect(screen.getByText(/3 of 4 sets aren’t logged\./)).toBeTruthy();
    expect(screen.getByText("Set 2")).toBeTruthy();
    expect(screen.getByText("2 sets")).toBeTruthy();
    tap("Go to Step-ups");
    fireEvent.click(screen.getAllByRole("button", { name: /Set 1 reps/ }).at(-1)!);
    expect(screen.getByText(/Set 1 · Reps/)).toBeTruthy();
    tap("Close keypad");
    tap("Finish workout");
    await act(async () => {
      tap("Finish anyway");
    });
    const row = enqueued.at(-1)!;
    expect(row.operation).toBe("workout.complete");
    expect(JSON.parse(row.payloadJson)).toMatchObject({
      executionId: uuid(1),
      assignmentId: uuid(2),
      workoutName: "Lower body B",
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(onFinished.mock.calls[0]![0].status).toBe("completed");
  });

  it("Pause is a labelled control away from Minimise, stops logging and shows the banner", () => {
    renderScreen("20 kg");
    const buttons = screen.getAllByRole("button");
    const minimise = screen.getByRole("button", { name: "Minimise workout" });
    const pause = screen.getByRole("button", { name: "Pause workout" });
    expect(pause.textContent).toBe("Pause");
    // Not next to each other: the title sits between them.
    expect(buttons.indexOf(minimise)).toBe(0);
    expect(buttons.indexOf(pause)).toBe(1);
    expect(minimise.parentElement).toBe(pause.parentElement);
    expect(minimise.nextElementSibling).not.toBe(pause);
    tap("Pause workout");
    expect(enqueued.at(-1)!.operation).toBe("workout.pause");
    expect(screen.getByText(/^Paused\. The timer stopped at /)).toBeTruthy();
    const count = enqueued.length;
    tap(/^Log set 1/);
    expect(enqueued).toHaveLength(count);
    tap("Resume");
    expect(enqueued.at(-1)!.operation).toBe("workout.resume");
    expect(screen.queryByText(/^Paused\./)).toBeNull();
  });

  it("Minimise keeps the session: it calls onMinimise, not onExit", () => {
    const onMinimise = vi.fn();
    const onExit = vi.fn();
    renderScreen("20 kg", execution("20 kg"), { onMinimise, onExit });
    tap("Minimise workout");
    expect(onMinimise).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it("Discard asks first, then records the workout as skipped and leaves", async () => {
    const onExit = vi.fn();
    renderScreen("20 kg", execution("20 kg"), { onExit });
    tap(/^Log set 1/);
    tap("Discard workout");
    expect(screen.getByText("Discard this workout?")).toBeTruthy();
    expect(
      screen.getByText("1 logged set won’t count. Your coach will see this workout as skipped."),
    ).toBeTruthy();
    tap("Keep logging");
    expect(onExit).not.toHaveBeenCalled();
    // The list's own button opens the dialog again; the dialog's confirms.
    fireEvent.click(screen.getAllByRole("button", { name: "Discard workout" })[0]!);
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "Discard workout" }).at(-1)!);
    });
    const row = enqueued.at(-1)!;
    expect(row.operation).toBe("workout.skip");
    expect(JSON.parse(row.payloadJson)).toMatchObject({ assignmentId: uuid(2) });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe("personal record (W-12)", () => {
  it("marks the heaviest set of the session when it beats every earlier load, and says so once", async () => {
    strength = {
      exercises: [
        {
          name: "romanian  Deadlift",
          points: [
            { localDate: "2020-01-04", topLoadKg: 20, reps: 10 },
            // Only loads from before today are a record to beat.
            { localDate: "2999-01-01", topLoadKg: 60, reps: 10 },
          ],
        },
      ],
    };
    await act(async () => {
      renderScreen("20 kg", execution("20 kg"), { assignment: assignment() });
    });
    tap(/^Log set 1/);
    expect(screen.queryByText("New personal record")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Set 2 load/ }));
    tap("Plus 2.5");
    tap("Log set 2");
    expect(screen.getByText("New personal record")).toBeTruthy();
    expect(screen.getByText("Romanian deadlift · 22.5 kg × 10")).toBeTruthy();
    // Both sets are in, so the exercise folded; its sets still carry the mark.
    tap(/^Romanian deadlift, 2 sets · best 22.5 kg × 10/);
    expect(screen.getByRole("button", { name: /^Set 2, 22.5 kg × 10, logged, personal record/ })).toBeTruthy();
  });

  it("claims no record without an earlier load to beat", async () => {
    strength = { exercises: [] };
    await act(async () => {
      renderScreen("20 kg", execution("20 kg"), { assignment: assignment() });
    });
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load/ }));
    tap("Plus 2.5");
    tap("Log set 1");
    expect(screen.queryByText("New personal record")).toBeNull();
  });
});

describe("offline addressing (Z12-41)", () => {
  it("sends the plan's own ids and the workout's name with a logged set", () => {
    renderScreen("20 kg");
    tap(/^Log set 1/);
    const row = enqueued.at(-1)!;
    expect(row.operation).toBe("workout.complete_set");
    expect(JSON.parse(row.payloadJson)).toMatchObject({
      executionId: uuid(1),
      setExecutionId: uuid(10),
      assignmentId: uuid(2),
      setTargetId: uuid(110),
      workoutName: "Lower body B",
    });
  });
});

describe("ActiveWorkoutScreen dark opt-in (Z12-63)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("under system dark, key surfaces use dark card/ink — not light-only white", () => {
    // Same Appearance driver as ThemeProvider.render.test: getColorScheme + listeners.
    const current: "light" | "dark" | null = "dark";
    vi.spyOn(Appearance, "getColorScheme").mockImplementation(() => current);
    vi.spyOn(Appearance, "addChangeListener").mockImplementation(() => ({
      remove: () => undefined,
    }) as ReturnType<typeof Appearance.addChangeListener>);
    render(
      <ThemeProvider>
        <Harness initial={execution("20 kg")} options={{}} />
      </ThemeProvider>,
    );
    const title = screen.getByText("Lower body B");
    const dark = themes.dark.colors;
    const light = themes.light.colors;
    const rgbOf = (css: string) =>
      (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const toRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    };
    expect(rgbOf(getComputedStyle(title).color)).toEqual(toRgb(dark.ink));
    expect(rgbOf(getComputedStyle(title).color)).not.toEqual(
      toRgb(light.ink),
    );
    let node: HTMLElement | null = title;
    let bg = "";
    while (node && !bg) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && !/^rgba?\(0, 0, 0, 0(\.0+)?\)$/.test(c) && c !== "transparent") {
        bg = c;
      }
      node = node.parentElement;
    }
    // Screen canvas (bg) or exercise card — either is a dark surface token.
    const surface = rgbOf(bg);
    expect(
      [toRgb(dark.bg), toRgb(dark.card)].some(
        (tok) =>
          tok[0] === surface[0] &&
          tok[1] === surface[1] &&
          tok[2] === surface[2],
      ),
    ).toBe(true);
    expect(surface).not.toEqual(toRgb(light.card));
    expect(surface).not.toEqual(toRgb(light.bg));
  });
});
