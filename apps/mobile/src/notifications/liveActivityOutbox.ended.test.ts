/**
 * Z14-8 (D-W14-12, diagnosis #13): lock-screen and notification "Log set"
 * rows land in the open workout at once, and a row for a workout that has
 * already ended on this phone is dropped with a sync status note, never sent.
 * Late writes the server settled (or refused before Z14-7) become notes, not
 * refusals. Real engine and memory store; the fake API answers like the
 * server's sync/push.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));

import type {
  SyncMutationRequest,
  SyncMutationResult,
  SyncPushResponse,
  WorkoutExecution,
} from "@fitbud/contracts";
import { syncMutationRequestSchema } from "@fitbud/contracts";
import type { NativeOutboxRead, NativeOutboxRow } from "../../modules/live-activity";
import { enqueueAndPush } from "../sync/actions";
import { createMemorySyncStore, createSyncEngine, type SyncEngine } from "../sync/engine";
import { createResolvedNotes, sheetItems } from "../sync/outboxCopy";
import {
  closeActiveSession,
  getActiveSession,
  openActiveSession,
} from "../trainee/workout/activeSession";
import {
  finishMutationId,
  isWorkoutEndedOnPhone,
  markWorkoutEndedLocally,
  resetWorkoutActionsForTests,
} from "../trainee/workoutSession";
import {
  applyDrainedSetToSession,
  createRunningWorkoutLookup,
  drainLiveActivityOutbox,
  liveActivityRowsOrigin,
  settleFinishedWorkoutRefusals,
} from "./liveActivityOutbox";

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const EXERCISE_EXECUTION_ID = "66666666-6666-4666-8666-666666666666";
const SET_1_ID = "77777777-7777-4777-8777-777777777777";
const SET_2_ID = "88888888-8888-4888-8888-888888888888";
const NOW = "2026-11-24T07:00:00.000Z";

function execution(status: WorkoutExecution["status"] = "started"): WorkoutExecution {
  const set = (id: string, order: number) => ({
    id,
    exerciseExecutionId: EXERCISE_EXECUTION_ID,
    setTargetId: id,
    order,
    status: "pending" as const,
    prescribedReps: 10,
    prescribedLoadLabel: "20 kg",
    actualReps: null,
    actualLoadLabel: null,
    completedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return {
    id: EXECUTION_ID,
    assignmentId: ASSIGNMENT_ID,
    coachingRelationshipId: RELATIONSHIP_ID,
    planVersionId: "44444444-4444-4444-8444-444444444444",
    traineeUserId: "55555555-5555-4555-8555-555555555555",
    status,
    recordVersion: 3,
    startedAt: NOW,
    pausedAt: null,
    completedAt: null,
    sessionRpe: null,
    requireSessionRpe: false,
    exercises: [
      {
        id: EXERCISE_EXECUTION_ID,
        workoutExecutionId: EXECUTION_ID,
        exerciseId: "wger-romanian-deadlift",
        name: "Romanian deadlift",
        order: 1,
        status: "pending",
        sets: [set(SET_1_ID, 1), set(SET_2_ID, 2)],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function row(overrides: Partial<NativeOutboxRow> = {}): NativeOutboxRow {
  return {
    operation: "workout.log_set",
    exerciseName: "Romanian deadlift",
    setIndex: 1,
    kilograms: 22.5,
    reps: 9,
    ...overrides,
  };
}

function fakeModule(rows: NativeOutboxRow[]) {
  const state = { rows: [...rows] };
  const readOutbox = vi.fn(
    (): NativeOutboxRead => ({
      rows: [...state.rows],
      openUrl: `fitbud://?workout=${ASSIGNMENT_ID}`,
    }),
  );
  const removeOutbox = vi.fn((count: number) => {
    const removed = Math.min(count, state.rows.length);
    state.rows = state.rows.slice(removed);
    return removed;
  });
  return { state, readOutbox, removeOutbox };
}

type Answer = (mutation: SyncMutationRequest) => SyncMutationResult;

const applied: Answer = (mutation) => ({
  mutationId: mutation.mutationId,
  status: "applied",
  recordId: mutation.recordId,
  serverVersion: 4,
  entityType: mutation.entityType,
  error: null,
});

function engineWith(answer: Answer = applied): {
  engine: SyncEngine;
  pushed: SyncMutationRequest[];
} {
  const pushed: SyncMutationRequest[] = [];
  const engine = createSyncEngine(createMemorySyncStore(), {
    pushSync: async (body): Promise<SyncPushResponse> => {
      const parsed = body.mutations.map((m) => syncMutationRequestSchema.parse(m));
      pushed.push(...parsed);
      return { results: parsed.map(answer) };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  });
  return { engine, pushed };
}

function moduleFor(mod: ReturnType<typeof fakeModule>) {
  return () => ({
    isSupported: () => true,
    start: async () => "activity-1",
    update: async () => undefined,
    end: async () => undefined,
    restState: () => ({ running: true }),
    readOutbox: mod.readOutbox,
    removeOutbox: mod.removeOutbox,
  });
}

beforeEach(() => {
  liveActivityRowsOrigin.set(null);
  resetWorkoutActionsForTests();
  closeActiveSession();
});

describe("a row for a workout that ended on this phone (D-W14-12)", () => {
  it("is dropped with a note and never sent when the finish is still queued", async () => {
    const { engine, pushed } = engineWith();
    // The finish is on the phone but not sent yet (offline at the gym).
    await engine.enqueue({
      mutationId: finishMutationId(EXECUTION_ID),
      entityType: "workout_execution",
      recordId: EXECUTION_ID,
      operation: "workout.complete",
      expectedServerVersion: 3,
      clientOccurredAt: NOW,
      payloadJson: JSON.stringify({ executionId: EXECUTION_ID, assignmentId: ASSIGNMENT_ID }),
    });
    const mod = fakeModule([row(), row({ setIndex: 2 })]);
    const onDropped = vi.fn();

    const result = await drainLiveActivityOutbox({
      sync: engine,
      // The server still reads the workout as open: without the check the
      // rows would be sent after the finish and turned away.
      findRunningWorkout: async () => execution(),
      isWorkoutEnded: (ids) => isWorkoutEndedOnPhone(engine.store, ids),
      onDropped,
      platformOS: "ios",
      loadModule: moduleFor(mod),
      warn: () => undefined,
    });

    expect(result).toMatchObject({ rows: 2, enqueued: 0, dropped: 2, kept: 0, cleared: 2 });
    expect(mod.state.rows).toEqual([]);
    expect(onDropped).toHaveBeenCalledWith(2, ASSIGNMENT_ID);
    const outbox = await engine.store.listOutbox();
    expect(outbox.map((entry) => entry.operation)).toEqual(["workout.complete"]);
    expect(pushed).toHaveLength(0);
  });

  it("is dropped when the workout was finished or discarded in this session", async () => {
    const { engine, pushed } = engineWith();
    markWorkoutEndedLocally({ id: EXECUTION_ID, assignmentId: ASSIGNMENT_ID });
    const mod = fakeModule([row()]);
    const result = await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => null,
      isWorkoutEnded: (ids) => isWorkoutEndedOnPhone(engine.store, ids),
      platformOS: "ios",
      loadModule: moduleFor(mod),
      warn: () => undefined,
    });
    await engine.sendNow();
    expect(result).toMatchObject({ dropped: 1, cleared: 1 });
    expect(pushed).toHaveLength(0);
  });

  it("a finished record in the local store also counts as ended", async () => {
    const { engine } = engineWith();
    await engine.store.upsertLocal({
      entityType: "workout_execution",
      recordId: EXECUTION_ID,
      serverVersion: 4,
      payloadJson: JSON.stringify(execution("completed")),
      tombstone: false,
      updatedAt: NOW,
    });
    await expect(
      isWorkoutEndedOnPhone(engine.store, { assignmentId: ASSIGNMENT_ID, executionId: null }),
    ).resolves.toBe(true);
    await expect(
      isWorkoutEndedOnPhone(engine.store, {
        assignmentId: "99999999-9999-4999-8999-999999999999",
        executionId: null,
      }),
    ).resolves.toBe(false);
  });

  it("an open workout's rows are still sent, once each (the row-key dedupe stays)", async () => {
    const { engine, pushed } = engineWith();
    const mod = fakeModule([row(), row(), row({ setIndex: 2 })]);
    const result = await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => execution(),
      isWorkoutEnded: (ids) => isWorkoutEndedOnPhone(engine.store, ids),
      platformOS: "ios",
      loadModule: moduleFor(mod),
      warn: () => undefined,
    });
    await engine.sendNow();
    expect(result).toMatchObject({ enqueued: 2, duplicates: 1, dropped: 0, cleared: 3 });
    expect(pushed.map((m) => (m.payload as { setExecutionId: string }).setExecutionId)).toEqual([
      SET_1_ID,
      SET_2_ID,
    ]);
    // The plan's own id rides along, so an offline-opened workout is found.
    expect(pushed[0]!.payload).toMatchObject({ assignmentId: ASSIGNMENT_ID });
  });
});

describe("a drained set lands in the open workout at once", () => {
  it("the lookup prefers the open session and the set shows as logged in it", async () => {
    const { engine, pushed } = engineWith();
    openActiveSession({ relationshipId: RELATIONSHIP_ID, execution: execution(), assignment: null });
    const mod = fakeModule([row({ setIndex: 2, reps: 8 })]);
    const api = {
      getWorkoutAssignment: vi.fn(async () => {
        throw new Error("not reached");
      }),
      getWorkoutExecution: vi.fn(),
    } as unknown as Parameters<typeof createRunningWorkoutLookup>[0]["api"];

    await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: createRunningWorkoutLookup({ api, store: engine.store }),
      applyLocally: applyDrainedSetToSession,
      platformOS: "ios",
      loadModule: moduleFor(mod),
      warn: () => undefined,
    });
    await engine.sendNow();

    expect(api.getWorkoutAssignment).not.toHaveBeenCalled();
    expect(pushed).toHaveLength(1);
    const sets = getActiveSession(RELATIONSHIP_ID)!.execution.exercises[0]!.sets;
    expect(sets[1]).toMatchObject({ id: SET_2_ID, status: "modified", actualReps: 8, actualLoadLabel: "22.5 kg" });
    expect(sets[0]!.status).toBe("pending");
  });

  it("a set the app logged meanwhile is left as the app logged it", () => {
    const logged = execution();
    logged.exercises[0]!.sets[0] = {
      ...logged.exercises[0]!.sets[0]!,
      status: "completed",
      actualReps: 10,
      actualLoadLabel: "20 kg",
      completedAt: NOW,
    };
    openActiveSession({ relationshipId: RELATIONSHIP_ID, execution: logged, assignment: null });
    applyDrainedSetToSession(execution(), SET_1_ID, { actualReps: 5, actualLoadLabel: "40 kg" });
    expect(getActiveSession(RELATIONSHIP_ID)!.execution.exercises[0]!.sets[0]).toMatchObject({
      actualReps: 10,
      actualLoadLabel: "20 kg",
    });
  });
});

describe("late writes are settled, not refused (D-W14-3)", () => {
  it("a lock-screen set the server answers already finished becomes a note", async () => {
    const { engine } = engineWith((mutation) => ({
      ...applied(mutation),
      status: "already_applied",
      note: {
        code: "WORKOUT_ALREADY_FINISHED",
        message: "This set arrived after you finished the workout, so it wasn't added.",
      },
    }));
    const notes = createResolvedNotes();
    const mod = fakeModule([row()]);
    await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => execution(),
      notes,
      platformOS: "ios",
      loadModule: moduleFor(mod),
      warn: () => undefined,
    });
    await engine.sendNow();
    await Promise.resolve();
    expect(notes.lines()).toEqual([
      "1 set logged on your lock screen arrived after the workout ended, so it wasn't added.",
    ]);
    expect(await engine.store.listOutbox()).toEqual([]);
  });

  it("refusals stored before Z14-7 are settled into notes; a real finish conflict stays", async () => {
    const { engine } = engineWith((mutation) => ({
      mutationId: mutation.mutationId,
      status: "rejected",
      recordId: mutation.recordId,
      serverVersion: null,
      entityType: mutation.entityType,
      error:
        mutation.operation === "workout.complete_set"
          ? { code: "INVALID_TRANSITION", message: "Sets can only be completed during an open workout." }
          : { code: "WORKOUT_ALREADY_FINISHED", message: "This workout is already finished." },
    }));
    const payload = {
      executionId: EXECUTION_ID,
      assignmentId: ASSIGNMENT_ID,
      workoutName: "Lower body B",
    };
    for (const [operation, extra] of [
      ["workout.complete_set", { setExecutionId: SET_1_ID }],
      ["workout.complete_set", { setExecutionId: SET_2_ID }],
      ["workout.complete", { body: { sessionRpe: 8 } }],
    ] as const) {
      await enqueueAndPush(engine, {
        recordId: EXECUTION_ID,
        operation,
        payload: { ...payload, ...extra },
      });
    }
    await engine.sendNow();
    const before = await engine.store.listOutbox();
    expect(before.map((entry) => entry.status)).toEqual(["rejected", "rejected", "rejected"]);
    // The sheet already hides the settled ones; only the finish conflict shows.
    expect(sheetItems(before).map((item) => item.state)).toEqual(["failed"]);

    const notes = createResolvedNotes();
    await expect(settleFinishedWorkoutRefusals(engine, notes)).resolves.toBe(2);
    const after = await engine.store.listOutbox();
    expect(after.map((entry) => entry.operation)).toEqual(["workout.complete"]);
    expect(notes.lines()).toEqual([
      "2 sets arrived after Lower body B ended, so they weren't added.",
    ]);
  });
});
