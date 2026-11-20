/**
 * Z12-57: the active workout keeps the screen awake through `expo-keep-awake`
 * via `activateWorkoutKeepAwake` on mount. Z11b-3's
 * `requireOptionalNativeModule("ExpoKeepAwake")` remains the fallback when the
 * package path throws.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workoutExecutionSchema, type WorkoutExecution } from "@fitbud/contracts";
import { mockAuth, render } from "../test/render";

const keepAwake = vi.hoisted(() => ({
  activateKeepAwakeAsync: vi.fn(async () => undefined),
  deactivateKeepAwake: vi.fn(async () => undefined),
  useKeepAwake: vi.fn(),
  throwOnImport: false,
}));

const native = vi.hoisted(() => ({
  module: null as null | {
    activate: (tag: string) => Promise<boolean>;
    deactivate: (tag: string) => Promise<boolean>;
  },
  requested: [] as string[],
}));

vi.mock("expo-keep-awake", () => {
  if (keepAwake.throwOnImport) {
    throw new Error("expo-keep-awake unavailable");
  }
  return {
    activateKeepAwakeAsync: keepAwake.activateKeepAwakeAsync,
    deactivateKeepAwake: keepAwake.deactivateKeepAwake,
    useKeepAwake: keepAwake.useKeepAwake,
  };
});

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: (name: string) => {
    native.requested.push(name);
    return native.module;
  },
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-11-11T06:00:00.000Z";

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
      enqueue: async () => undefined,
    }),
  };
});

const { ActiveWorkoutScreen, activateWorkoutKeepAwake } = await import("./ActiveWorkoutScreen");

function execution(): WorkoutExecution {
  const set = (n: number, order: number) => ({
    id: uuid(n),
    exerciseExecutionId: uuid(500),
    setTargetId: uuid(n + 100),
    order,
    status: "pending" as const,
    prescribedReps: 10,
    prescribedLoadLabel: "40 kg",
    actualReps: null,
    actualLoadLabel: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
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
        sets: [set(10, 1), set(11, 2)],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function mount() {
  return render(
    <ActiveWorkoutScreen
      execution={execution()}
      onChange={() => undefined}
      onFinished={() => undefined}
      onExit={() => undefined}
      sessionName="Lower body B"
    />,
  );
}

beforeEach(() => {
  keepAwake.throwOnImport = false;
  keepAwake.activateKeepAwakeAsync.mockClear();
  keepAwake.deactivateKeepAwake.mockClear();
  keepAwake.useKeepAwake.mockClear();
  keepAwake.activateKeepAwakeAsync.mockResolvedValue(undefined);
  keepAwake.deactivateKeepAwake.mockResolvedValue(undefined);
  native.module = null;
  native.requested.length = 0;
});

describe("active workout keep-awake", () => {
  it("activates keep-awake on mount with the workout tag", () => {
    mount();
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith(
      "fitbud-active-workout",
    );
  });

  it("activateWorkoutKeepAwake uses expo-keep-awake", async () => {
    const release = activateWorkoutKeepAwake();
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith("fitbud-active-workout");
    release();
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith("fitbud-active-workout");
  });

  it("does not fail the screen when expo-keep-awake rejects", async () => {
    keepAwake.activateKeepAwakeAsync.mockRejectedValueOnce(new Error("boom"));
    keepAwake.deactivateKeepAwake.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    let release: () => void = () => undefined;
    expect(() => {
      release = activateWorkoutKeepAwake();
    }).not.toThrow();
    await Promise.resolve();
    expect(() => release()).not.toThrow();
  });

  it("falls back to ExpoKeepAwake when the package path throws", async () => {
    // Re-import is awkward under vitest; exercise the fallback by making
    // activateKeepAwakeAsync throw synchronously via a mock that throws.
    keepAwake.activateKeepAwakeAsync.mockImplementationOnce(() => {
      throw new Error("sync boom");
    });
    const activate = vi.fn(async () => true);
    const deactivate = vi.fn(async () => true);
    native.module = { activate, deactivate };

    const release = activateWorkoutKeepAwake();
    expect(native.requested).toContain("ExpoKeepAwake");
    expect(activate).toHaveBeenCalledWith("fitbud-active-workout");
    release();
    expect(deactivate).toHaveBeenCalledWith("fitbud-active-workout");
  });
});
