/**
 * Z14-8 (D-W14-12): the shell's drain hook drains the moment Z14-5's native
 * event says a lock-screen or notification "Log set" row was appended, not
 * only on the next foreground; and a row appended while a drain runs is
 * drained right after it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkoutExecution } from "@fitbud/contracts";
import type { NativeOutboxRead, NativeOutboxRow } from "../../modules/live-activity";
import { createMemorySyncStore, createSyncEngine, type SyncEngine } from "../sync/engine";
import { act, render, waitFor } from "../test/render";
import {
  closeActiveSession,
  getActiveSession,
  openActiveSession,
} from "../trainee/workout/activeSession";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const native = vi.hoisted(() => ({
  listeners: new Set<(count: number) => void>(),
  rows: [] as unknown[],
}));

vi.mock("./liveActivityNative", async () => {
  const actual =
    await vi.importActual<typeof import("./liveActivityNative")>("./liveActivityNative");
  const mod = {
    isSupported: () => true,
    start: async () => "activity-1",
    update: async () => undefined,
    end: async () => undefined,
    restState: () => ({ running: true }),
    readOutbox: (): NativeOutboxRead => ({
      rows: [...(native.rows as NativeOutboxRow[])],
      openUrl: "fitbud://?workout=11111111-1111-4111-8111-111111111111",
    }),
    removeOutbox: (count: number) => {
      native.rows = native.rows.slice(count);
      return count;
    },
  };
  return {
    ...actual,
    liveActivityModuleAccess: { get: () => mod, supported: () => true },
    subscribeLiveActivityOutbox: (_access: unknown, listener: (count: number) => void) => {
      native.listeners.add(listener);
      return () => native.listeners.delete(listener);
    },
  };
});

const { useLiveActivityOutboxDrain } = await import("./liveActivityOutbox");

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-11-24T07:00:00.000Z";

function execution(): WorkoutExecution {
  return {
    id: EXECUTION_ID,
    assignmentId: ASSIGNMENT_ID,
    coachingRelationshipId: RELATIONSHIP_ID,
    planVersionId: "44444444-4444-4444-8444-444444444444",
    traineeUserId: "55555555-5555-4555-8555-555555555555",
    status: "started",
    recordVersion: 3,
    startedAt: NOW,
    pausedAt: null,
    completedAt: null,
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        workoutExecutionId: EXECUTION_ID,
        exerciseId: "wger-romanian-deadlift",
        name: "Romanian deadlift",
        order: 1,
        status: "pending",
        sets: [1, 2].map((order) => ({
          id: `7777777${order}-7777-4777-8777-777777777777`,
          exerciseExecutionId: "66666666-6666-4666-8666-666666666666",
          setTargetId: `7777777${order}-7777-4777-8777-777777777777`,
          order,
          status: "pending" as const,
          prescribedReps: 10,
          prescribedLoadLabel: "20 kg",
          actualReps: null,
          actualLoadLabel: null,
          completedAt: null,
          createdAt: NOW,
          updatedAt: NOW,
        })),
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const logRow = (setIndex: number): NativeOutboxRow => ({
  operation: "workout.log_set",
  exerciseName: "Romanian deadlift",
  setIndex,
  kilograms: 20,
  reps: 10,
});

function Shell({ sync }: { sync: SyncEngine }) {
  useLiveActivityOutboxDrain({
    sync,
    api: {} as Parameters<typeof useLiveActivityOutboxDrain>[0]["api"],
  });
  return null;
}

afterEach(() => {
  native.listeners.clear();
  native.rows = [];
  closeActiveSession();
});

describe("useLiveActivityOutboxDrain (D-W14-12)", () => {
  it("drains at once on the native event, and the set shows in the open workout", async () => {
    const engine = createSyncEngine(createMemorySyncStore(), {
      // Offline at the gym: the row waits in the outbox, which is what counts.
      pushSync: async () => {
        throw new TypeError("Network request failed");
      },
      pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
    });
    openActiveSession({ relationshipId: RELATIONSHIP_ID, execution: execution(), assignment: null });
    render(<Shell sync={engine} />);
    await waitFor(() => expect(native.listeners.size).toBe(1));

    native.rows = [logRow(1)];
    await act(async () => {
      for (const listener of native.listeners) listener(1);
    });

    await waitFor(async () => {
      const outbox = await engine.store.listOutbox();
      expect(outbox.map((entry) => entry.operation)).toEqual(["workout.complete_set"]);
    });
    expect(native.rows).toEqual([]);
    expect(
      getActiveSession(RELATIONSHIP_ID)!.execution.exercises[0]!.sets.map((set) => set.status),
    ).toEqual(["completed", "pending"]);

    // A second tap while the first drain may still be running is not lost.
    native.rows = [logRow(2)];
    await act(async () => {
      for (const listener of native.listeners) listener(1);
      for (const listener of native.listeners) listener(1);
    });
    await waitFor(async () => {
      expect(await engine.store.listOutbox()).toHaveLength(2);
    });
    expect(native.rows).toEqual([]);
  });
});
