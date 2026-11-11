/**
 * Z9-7: set entry on the active workout (frames 11, 11c, 11b). The kg keypad
 * with ±2.5 steps, the Bodyweight toggle, the numeric `actualLoadKg` that goes
 * into the outbox, and the light rest card. DOM-shaped (react-native-web), so
 * layout is checked in the visual captures, not here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  workoutExecutionSchema,
  completeSetRequestSchema,
  type WorkoutExecution,
} from "@fitbud/contracts";
import { mockAuth, render, screen, fireEvent, within } from "../test/render";
import {
  backspace,
  initialDraft,
  loadBody,
  pressKey,
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

const auth = mockAuth({
  api: new Proxy(
    {},
    {
      get(_t, key: string) {
        if (key === "then") return undefined;
        return async () => ({ items: [], nextCursor: null });
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

const { ActiveWorkoutScreen } = await import("./ActiveWorkoutScreen");

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

function renderScreen(load: string | null) {
  const onChange = vi.fn();
  render(
    <ActiveWorkoutScreen
      execution={execution(load)}
      onChange={onChange}
      onFinished={() => undefined}
      onExit={() => undefined}
      sessionName="Lower body B"
    />,
  );
  return { onChange };
}

/** The row check button and the footer share a label; the footer is last. */
const tap = (name: string | RegExp) =>
  fireEvent.click(screen.getAllByRole("button", { name }).at(-1)!);

function lastBody() {
  const row = enqueued.at(-1)!;
  expect(row.operation).toBe("workout.complete_set");
  return JSON.parse(row.payloadJson).body as Record<string, unknown>;
}

beforeEach(() => {
  enqueued.length = 0;
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
    expect(loadBody(initialDraft("20 kg", 10), "20 kg")).toEqual({ actualLoadKg: 20 });
    expect(loadBody({ load: "22.5", reps: "10", bodyweight: false }, "20 kg")).toEqual({
      actualLoadKg: 22.5,
    });
    expect(loadBody({ load: "20", reps: "10", bodyweight: true }, "20 kg")).toEqual({
      actualLoadLabel: "Bodyweight",
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

describe("ActiveWorkoutScreen set entry", () => {
  it("opens the kg keypad, steps +2.5, moves to reps and sends a numeric load", () => {
    renderScreen("20 kg");
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load: 20 kg/ }));
    expect(screen.getByText("Set 1 · load")).toBeTruthy();
    expect(screen.getByText("Weight used, in kg")).toBeTruthy();
    tap("Plus 2.5");
    expect(screen.getByRole("button", { name: /Set 1 load: 22.5 kg/ })).toBeTruthy();
    tap("Next: reps");
    expect(screen.getByText("Set 1 · reps")).toBeTruthy();
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

  it("Bodyweight toggle sends the Bodyweight label and no kg, and disables the digits", () => {
    renderScreen("20 kg");
    fireEvent.click(screen.getByRole("button", { name: /Set 1 load/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Bodyweight" }));
    const keypadOne = screen.getByRole("button", { name: "1" }) as HTMLButtonElement;
    expect(keypadOne.disabled || keypadOne.getAttribute("aria-disabled") === "true").toBe(true);
    expect(screen.getByRole("button", { name: /Set 1 load: Bodyweight/ })).toBeTruthy();
    tap("Next: reps");
    tap("Log set 1");
    const body = lastBody();
    expect(body.actualLoadLabel).toBe("Bodyweight");
    expect(body).not.toHaveProperty("actualLoadKg");
  });

  it("a bodyweight prescription shows Bodyweight, and switching to kg goes to the load keypad", () => {
    renderScreen(null);
    expect(screen.getByRole("button", { name: /Set 1 load: Bodyweight/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Set 1 reps/ }));
    expect(screen.getByText("Holding weight? Switch to kg")).toBeTruthy();
    tap("Plus 1");
    expect(screen.getByRole("button", { name: /Set 1 reps: 11/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "kg" }));
    expect(screen.getByText("Set 1 · load")).toBeTruthy();
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

  it("shows the rest card with −15 s, +15 s, Skip and the next set after logging", () => {
    renderScreen("20 kg");
    tap(/^Log set 1/);
    expect(screen.getByText("REST")).toBeTruthy();
    expect(screen.getByRole("button", { name: "15 seconds less" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "15 seconds more" })).toBeTruthy();
    expect(screen.getByText("−15 s")).toBeTruthy();
    expect(screen.getByText("+15 s")).toBeTruthy();
    expect(screen.getByText("Next: Romanian deadlift, set 1 · 20 kg")).toBeTruthy();
    expect(within(document.body).getAllByText(/s left/).length).toBeGreaterThan(0);
    tap("Skip rest");
    expect(screen.queryByText("REST")).toBeNull();
  });
});
