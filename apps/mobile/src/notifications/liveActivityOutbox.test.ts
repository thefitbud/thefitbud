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
  SyncPushResponse,
  WorkoutExecution,
} from "@fitbud/contracts";
import { syncMutationRequestSchema } from "@fitbud/contracts";
import type { NativeOutboxRead, NativeOutboxRow } from "../../modules/live-activity";
import { createMemorySyncStore, createSyncEngine, type SyncEngine } from "../sync/engine";
import {
  assignmentIdFromOpenUrl,
  liveActivityRowsOrigin,
  createRunningWorkoutLookup,
  drainLiveActivityOutbox,
  keptLiveActivityRowsCopy,
  loadLabelFor,
  matchSetExecution,
  mutationIdFromKey,
  outboxRowKey,
} from "./liveActivityOutbox";

const ASSIGNMENT_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const RELATIONSHIP_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_VERSION_ID = "44444444-4444-4444-8444-444444444444";
const TRAINEE_ID = "55555555-5555-4555-8555-555555555555";
const EXERCISE_EXECUTION_ID = "66666666-6666-4666-8666-666666666666";
const SET_1_ID = "77777777-7777-4777-8777-777777777777";
const SET_2_ID = "88888888-8888-4888-8888-888888888888";

const NOW = "2026-11-01T07:00:00.000Z";

/** A started workout the way the app holds it: one exercise, two sets. */
function runningExecution(
  overrides: { set1Done?: boolean; set2Done?: boolean } = {},
): WorkoutExecution {
  const set = (
    id: string,
    order: number,
    done: boolean,
  ): WorkoutExecution["exercises"][number]["sets"][number] => ({
    id,
    exerciseExecutionId: EXERCISE_EXECUTION_ID,
    setTargetId: id,
    order,
    status: done ? "completed" : "pending",
    prescribedReps: 10,
    prescribedLoadLabel: "20 kg",
    actualReps: done ? 10 : null,
    actualLoadLabel: done ? "20 kg" : null,
    completedAt: done ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return {
    id: EXECUTION_ID,
    assignmentId: ASSIGNMENT_ID,
    coachingRelationshipId: RELATIONSHIP_ID,
    planVersionId: PLAN_VERSION_ID,
    traineeUserId: TRAINEE_ID,
    status: "started",
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
        sets: [
          set(SET_1_ID, 1, overrides.set1Done ?? false),
          set(SET_2_ID, 2, overrides.set2Done ?? false),
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const SET_3_ID = "99999999-9999-4999-8999-999999999991";
const SECOND_OCCURRENCE_SET_ID = "99999999-9999-4999-8999-999999999992";

/** The same workout with a third pending set, for the partial-clear case. */
function threeSetExecution(): WorkoutExecution {
  const base = runningExecution();
  const exercise = base.exercises[0]!;
  const third = { ...exercise.sets[1]!, id: SET_3_ID, order: 3 };
  return {
    ...base,
    exercises: [{ ...exercise, sets: [...exercise.sets, third] }],
  };
}

/** One workout, the same exercise name twice: the row cannot tell them apart. */
function repeatedExerciseExecution(
  overrides: { firstDone?: boolean } = {},
): WorkoutExecution {
  const base = runningExecution({ set1Done: overrides.firstDone ?? false });
  const first = base.exercises[0]!;
  const second = {
    ...first,
    id: SECOND_OCCURRENCE_SET_ID,
    order: 2,
    sets: [{ ...first.sets[0]!, id: SECOND_OCCURRENCE_SET_ID, status: "pending" as const }],
  };
  return {
    ...base,
    exercises: [
      { ...first, name: "Bench press", sets: [first.sets[0]!] },
      { ...second, name: "Bench press" },
    ],
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

/** The native module as a dev build behaves: rows in order, prefix clearing. */
function fakeModule(rows: NativeOutboxRow[], openUrl: string | null = `fitbud://?workout=${ASSIGNMENT_ID}`) {
  const state = { rows: [...rows], openUrl };
  const readOutbox = vi.fn(
    (): NativeOutboxRead => ({ rows: [...state.rows], openUrl: state.openUrl }),
  );
  const removeOutbox = vi.fn((count: number) => {
    const removed = Math.min(count, state.rows.length);
    state.rows = state.rows.slice(removed);
    return removed;
  });
  return { state, readOutbox, removeOutbox };
}

/** Real engine + memory store; the fake API validates every pushed mutation. */
function engineWithPush(): {
  engine: SyncEngine;
  pushed: SyncMutationRequest[];
} {
  const pushed: SyncMutationRequest[] = [];
  const engine = createSyncEngine(createMemorySyncStore(), {
    pushSync: async (body): Promise<SyncPushResponse> => {
      for (const mutation of body.mutations) {
        pushed.push(syncMutationRequestSchema.parse(mutation));
      }
      return {
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.mutationId,
          status: "applied" as const,
          recordId: mutation.recordId,
          serverVersion: 4,
          entityType: mutation.entityType,
          error: null,
        })),
      };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  });
  return { engine, pushed };
}

function drain(
  mod: ReturnType<typeof fakeModule>,
  engine: SyncEngine,
  running: WorkoutExecution | null | (() => Promise<WorkoutExecution | null>),
  onKept?: (count: number) => void,
  platformOS: string = "ios",
  isSupported = true,
) {
  return drainLiveActivityOutbox({
    sync: engine,
    findRunningWorkout: typeof running === "function" ? running : async () => running,
    platformOS,
    loadModule: () => ({
      isSupported: () => isSupported,
      start: async () => "activity-1",
      update: async () => undefined,
      end: async () => undefined,
      restState: () => ({ running: true }),
      readOutbox: mod.readOutbox,
      removeOutbox: mod.removeOutbox,
    }),
    onKept,
    warn: () => undefined,
  });
}

beforeEach(() => {
  liveActivityRowsOrigin.set(null);
});

describe("assignmentIdFromOpenUrl", () => {
  it("reads the assignment id the activity carries", () => {
    expect(assignmentIdFromOpenUrl(`fitbud://?workout=${ASSIGNMENT_ID}`)).toBe(ASSIGNMENT_ID);
    expect(assignmentIdFromOpenUrl(`fitbud://workout/${ASSIGNMENT_ID}`)).toBe(ASSIGNMENT_ID);
    expect(assignmentIdFromOpenUrl("fitbud://today/self")).toBeNull();
    expect(assignmentIdFromOpenUrl(null)).toBeNull();
  });
});

describe("loadLabelFor", () => {
  it("formats the logged load and omits a bodyweight set", () => {
    expect(loadLabelFor(22.5)).toBe("22.5 kg");
    expect(loadLabelFor(20)).toBe("20 kg");
    expect(loadLabelFor(0)).toBeNull();
  });
});

describe("matchSetExecution", () => {
  it("maps exercise name and set position onto the set execution id", () => {
    const execution = runningExecution();
    expect(matchSetExecution(execution, row({ setIndex: 2 }))).toEqual({
      setExecutionId: SET_2_ID,
      pending: true,
    });
    expect(matchSetExecution(execution, row({ exerciseName: "romanian deadlift " }))).toEqual({
      setExecutionId: SET_1_ID,
      pending: true,
    });
  });

  it("returns null for an unknown exercise, a missing set or a malformed row", () => {
    const execution = runningExecution();
    expect(matchSetExecution(execution, row({ exerciseName: "Back squat" }))).toBeNull();
    expect(matchSetExecution(execution, row({ setIndex: 9 }))).toBeNull();
    expect(matchSetExecution(execution, row({ exerciseName: "", setIndex: 0 }))).toBeNull();
  });

  it("reports a set already logged in the app", () => {
    expect(matchSetExecution(runningExecution({ set1Done: true }), row())).toEqual({
      setExecutionId: SET_1_ID,
      pending: false,
    });
  });
});

describe("mutationIdFromKey", () => {
  it("is a stable UUID per row key", () => {
    const key = outboxRowKey(EXECUTION_ID, row(), 0);
    expect(mutationIdFromKey(key)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mutationIdFromKey(key)).toBe(mutationIdFromKey(key));
    expect(mutationIdFromKey(outboxRowKey(EXECUTION_ID, row({ setIndex: 2 }), 0))).not.toBe(
      mutationIdFromKey(key),
    );
  });
});

describe("drainLiveActivityOutbox", () => {
  it("maps a lock-screen row to one workout.complete_set and clears it", async () => {
    const mod = fakeModule([row({ setIndex: 2 })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution({ set1Done: true }));

    expect(result).toMatchObject({ rows: 1, enqueued: 1, kept: 0, cleared: 1 });
    expect(mod.state.rows).toEqual([]);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({
      operation: "workout.complete_set",
      entityType: "workout_execution",
      recordId: EXECUTION_ID,
      expectedServerVersion: 3,
      payload: {
        executionId: EXECUTION_ID,
        setExecutionId: SET_2_ID,
        expectedVersion: 3,
        body: { actualReps: 9, actualLoadLabel: "22.5 kg" },
      },
    });
    expect(pushed[0]!.mutationId).toBe(pushed[0]!.idempotencyKey);
  });

  it("logs a double tap of the same set once", async () => {
    const mod = fakeModule([row(), row()]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution());

    expect(result).toMatchObject({ rows: 2, enqueued: 1, duplicates: 1, cleared: 2 });
    expect(pushed).toHaveLength(1);
    expect(await engine.store.listOutbox()).toHaveLength(1);
    expect(mod.state.rows).toEqual([]);
  });

  it("re-draining the same row reuses one mutation", async () => {
    const mod = fakeModule([row()]);
    mod.removeOutbox.mockImplementation(() => 0); // clear failed: the row stays
    const { engine, pushed } = engineWithPush();

    await drain(mod, engine, runningExecution());
    await drain(mod, engine, runningExecution());

    expect(mod.readOutbox).toHaveBeenCalledTimes(2);
    expect(new Set(pushed.map((mutation) => mutation.mutationId)).size).toBe(1);
    expect(await engine.store.listOutbox()).toHaveLength(1);
  });

  it("stops at the first row it cannot place and keeps the rest", async () => {
    const mod = fakeModule([row({ exerciseName: "Back squat" }), row({ setIndex: 2 })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution({ set1Done: true }));

    // Clearing is a prefix, so nothing past the kept row may be enqueued: its
    // position — and so its idempotency key — would change on the next read.
    expect(result).toMatchObject({ rows: 2, enqueued: 0, kept: 2, cleared: 0 });
    expect(pushed).toEqual([]);
    expect(mod.state.rows).toHaveLength(2);
  });

  it("a partial clear then a re-drain still logs each set once", async () => {
    // [enqueued, kept, would-be-enqueued]: the third row shifts position when
    // the first is cleared, so draining past the kept row logged set 2 twice.
    const mod = fakeModule([
      row({ setIndex: 1 }),
      row({ exerciseName: "Back squat" }),
      row({ setIndex: 2 }),
    ]);
    const { engine, pushed } = engineWithPush();

    const first = await drain(mod, engine, threeSetExecution());
    await drain(mod, engine, threeSetExecution());
    await drain(mod, engine, threeSetExecution());

    // One mutation id per set, however often the rows are re-read.
    const idsPerSet = new Map<unknown, Set<string>>();
    for (const mutation of pushed) {
      const setId = mutation.payload.setExecutionId;
      const ids = idsPerSet.get(setId) ?? new Set<string>();
      ids.add(mutation.mutationId);
      idsPerSet.set(setId, ids);
    }
    for (const [setId, ids] of idsPerSet) {
      expect(ids, `set ${String(setId)}`).toHaveLength(1);
    }
    expect(pushed.map((mutation) => mutation.payload.setExecutionId)).toEqual([SET_1_ID]);
    expect(await engine.store.listOutbox()).toHaveLength(1);
    expect(first).toMatchObject({ rows: 3, enqueued: 1, kept: 2, cleared: 1 });
    expect(mod.state.rows).toHaveLength(2);
  });

  it("keeps a row it cannot tell apart from a repeated exercise", async () => {
    const mod = fakeModule([row({ exerciseName: "Bench press" })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, repeatedExerciseExecution());

    expect(result).toMatchObject({ rows: 1, enqueued: 0, kept: 1, cleared: 0 });
    expect(pushed).toEqual([]);
    expect(mod.state.rows).toHaveLength(1);
  });

  it("places the row once only one occurrence is still waiting", async () => {
    const mod = fakeModule([row({ exerciseName: "Bench press" })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, repeatedExerciseExecution({ firstDone: true }));

    expect(result).toMatchObject({ enqueued: 1, cleared: 1 });
    expect(pushed[0]!.payload).toMatchObject({ setExecutionId: SECOND_OCCURRENCE_SET_ID });
  });

  it("never logs rows observed under one workout against another", async () => {
    const mod = fakeModule([row()]);
    const { engine, pushed } = engineWithPush();

    // Monday: the lookup failed, so the row is kept against workout A.
    const kept = await drain(mod, engine, null);
    expect(kept).toMatchObject({ kept: 1, cleared: 0 });
    expect(liveActivityRowsOrigin.get()).toBe(ASSIGNMENT_ID);

    // Wednesday: a different workout is running, with the same exercise name.
    const otherAssignment = "99999999-9999-4999-8999-999999999999";
    mod.state.openUrl = `fitbud://?workout=${otherAssignment}`;
    const result = await drain(mod, engine, {
      ...runningExecution(),
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assignmentId: otherAssignment,
    });

    expect(result).toMatchObject({ rows: 1, enqueued: 0, kept: 1, cleared: 0 });
    expect(pushed).toEqual([]);
    expect(mod.state.rows).toHaveLength(1);
  });

  it("keeps a row the widget appended while the drain was running", async () => {
    const mod = fakeModule([row()]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, async () => {
      mod.state.rows.push(row({ setIndex: 2 })); // Log set tapped mid-drain
      return runningExecution();
    });

    expect(result).toMatchObject({ rows: 1, enqueued: 1, cleared: 1 });
    expect(pushed).toHaveLength(1);
    expect(mod.state.rows).toEqual([row({ setIndex: 2 })]);
  });

  it("keeps a row whose operation is not a logged set", async () => {
    const mod = fakeModule([row({ operation: "workout.skip" })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution());

    expect(result).toMatchObject({ rows: 1, enqueued: 0, kept: 1, cleared: 0 });
    expect(pushed).toEqual([]);
  });

  it("keeps every row and reports the count when no workout is running", async () => {
    const mod = fakeModule([row(), row({ setIndex: 2 })], null);
    const { engine, pushed } = engineWithPush();
    const kept: number[] = [];

    const result = await drain(mod, engine, null, (count) => kept.push(count));

    expect(result).toMatchObject({ rows: 2, enqueued: 0, kept: 2, cleared: 0 });
    expect(pushed).toEqual([]);
    expect(mod.removeOutbox).not.toHaveBeenCalled();
    expect(mod.state.rows).toHaveLength(2);
    expect(kept).toEqual([2]);
    expect(keptLiveActivityRowsCopy(2)).toBe(
      "2 sets logged on your lock screen · open the workout to save them",
    );
    expect(keptLiveActivityRowsCopy(0)).toBeNull();
  });

  it("sends nothing for a set already logged in the app, and clears the row", async () => {
    const mod = fakeModule([row()]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution({ set1Done: true }));

    expect(result).toMatchObject({ rows: 1, enqueued: 0, alreadyLogged: 1, cleared: 1 });
    expect(pushed).toEqual([]);
    expect(mod.state.rows).toEqual([]);
  });

  it("keeps the row when the outbox write fails", async () => {
    const mod = fakeModule([row()]);
    const { engine } = engineWithPush();
    const failing: SyncEngine = {
      ...engine,
      enqueue: async () => {
        throw new Error("sqlite is full");
      },
    };

    const result = await drain(mod, failing, runningExecution());

    expect(result).toMatchObject({ enqueued: 0, kept: 1, cleared: 0 });
    expect(mod.state.rows).toHaveLength(1);
  });

  it("does nothing on web", async () => {
    const { engine, pushed } = engineWithPush();
    const loadModule = vi.fn(() => null);

    const result = await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => runningExecution(),
      platformOS: "web",
      loadModule,
      warn: () => undefined,
    });

    expect(result).toMatchObject({ rows: 0, enqueued: 0, kept: 0, cleared: 0 });
    expect(loadModule).not.toHaveBeenCalled();
    expect(pushed).toEqual([]);
  });

  it("does nothing in a build whose module has no outbox functions", async () => {
    const { engine } = engineWithPush();
    const result = await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => runningExecution(),
      platformOS: "ios",
      loadModule: () => ({
        isSupported: () => true,
        start: async () => null,
        update: async () => undefined,
        end: async () => undefined,
        restState: () => ({ running: false }),
      }),
      warn: () => undefined,
    });
    expect(result).toMatchObject({ rows: 0, enqueued: 0 });
  });
});

describe("drainLiveActivityOutbox on Android (LA3b)", () => {
  it("drains a notification row into the same mutation as iOS", async () => {
    // One function, one row shape, one dedupe key: the same tap on either
    // platform is the same mutation, so a set is never logged twice.
    const perPlatform: Record<string, string[]> = {};
    for (const platformOS of ["ios", "android"]) {
      const mod = fakeModule([row({ setIndex: 2 })]);
      const { engine, pushed } = engineWithPush();

      const result = await drain(
        mod,
        engine,
        runningExecution({ set1Done: true }),
        undefined,
        platformOS,
      );

      expect(result, platformOS).toMatchObject({ rows: 1, enqueued: 1, kept: 0, cleared: 1 });
      expect(mod.state.rows).toEqual([]);
      expect(pushed[0]).toMatchObject({
        operation: "workout.complete_set",
        recordId: EXECUTION_ID,
        payload: {
          setExecutionId: SET_2_ID,
          body: { actualReps: 9, actualLoadLabel: "22.5 kg" },
        },
      });
      perPlatform[platformOS] = pushed.map((mutation) => mutation.mutationId);
      liveActivityRowsOrigin.set(null);
    }
    expect(perPlatform.android).toEqual(perPlatform.ios);
    expect(perPlatform.android).toEqual([
      mutationIdFromKey(outboxRowKey(EXECUTION_ID, row({ setIndex: 2 }), 0)),
    ]);
  });

  it("logs two Log set taps in the shade as one set", async () => {
    const mod = fakeModule([row(), row()]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(mod, engine, runningExecution(), undefined, "android");

    expect(result).toMatchObject({ rows: 2, enqueued: 1, duplicates: 1, cleared: 2 });
    expect(pushed).toHaveLength(1);
    expect(await engine.store.listOutbox()).toHaveLength(1);
    expect(mod.state.rows).toEqual([]);
  });

  it("stops at the first row it cannot place, as on iOS", async () => {
    const mod = fakeModule([row({ exerciseName: "Back squat" }), row({ setIndex: 2 })]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(
      mod,
      engine,
      runningExecution({ set1Done: true }),
      undefined,
      "android",
    );

    // WorkoutSetStore.removeFirst clears a leading prefix, exactly as the App
    // Group does, so a kept row never shifts an enqueued row's position.
    expect(result).toMatchObject({ rows: 2, enqueued: 0, kept: 2, cleared: 0 });
    expect(pushed).toEqual([]);
    expect(mod.state.rows).toHaveLength(2);
  });

  it("still drains rows written before notifications were turned off", async () => {
    const mod = fakeModule([row()]);
    const { engine, pushed } = engineWithPush();

    const result = await drain(
      mod,
      engine,
      runningExecution(),
      undefined,
      "android",
      false, // isSupported: notifications off since the tap
    );

    expect(result).toMatchObject({ rows: 1, enqueued: 1, cleared: 1 });
    expect(pushed).toHaveLength(1);
    expect(mod.state.rows).toEqual([]);
  });

  it("does nothing in an Android build made before LA3", async () => {
    const { engine, pushed } = engineWithPush();
    const result = await drainLiveActivityOutbox({
      sync: engine,
      findRunningWorkout: async () => runningExecution(),
      platformOS: "android",
      loadModule: () => null,
      warn: () => undefined,
    });
    expect(result).toMatchObject({ rows: 0, enqueued: 0, kept: 0, cleared: 0 });
    expect(pushed).toEqual([]);
  });
});

describe("createRunningWorkoutLookup", () => {
  const assignment = {
    id: ASSIGNMENT_ID,
    execution: { id: EXECUTION_ID, status: "started" },
  };

  it("uses the authoritative execution for the activity's assignment", async () => {
    const store = createMemorySyncStore();
    const getWorkoutExecution = vi.fn(async () => runningExecution());
    const lookup = createRunningWorkoutLookup({
      api: {
        getWorkoutAssignment: vi.fn(async () => assignment),
        getWorkoutExecution,
      } as unknown as Parameters<typeof createRunningWorkoutLookup>[0]["api"],
      store,
    });

    await expect(lookup(ASSIGNMENT_ID)).resolves.toMatchObject({ id: EXECUTION_ID });
    expect(getWorkoutExecution).toHaveBeenCalledWith(EXECUTION_ID);
  });

  it("falls back to the local sync store when offline", async () => {
    const store = createMemorySyncStore();
    await store.upsertLocal({
      entityType: "workout_execution",
      recordId: EXECUTION_ID,
      serverVersion: 3,
      payloadJson: JSON.stringify(runningExecution()),
      tombstone: false,
      updatedAt: NOW,
    });
    const lookup = createRunningWorkoutLookup({
      api: {
        getWorkoutAssignment: async () => {
          throw new Error("offline");
        },
        getWorkoutExecution: async () => {
          throw new Error("offline");
        },
      } as unknown as Parameters<typeof createRunningWorkoutLookup>[0]["api"],
      store,
    });

    await expect(lookup(ASSIGNMENT_ID)).resolves.toMatchObject({ id: EXECUTION_ID });
    // A different workout is never guessed for a named assignment.
    await expect(lookup("99999999-9999-4999-8999-999999999999")).resolves.toBeNull();
  });

  it("returns null when nothing is running", async () => {
    const lookup = createRunningWorkoutLookup({
      api: {
        getWorkoutAssignment: async () => {
          throw new Error("offline");
        },
        getWorkoutExecution: async () => {
          throw new Error("offline");
        },
      } as unknown as Parameters<typeof createRunningWorkoutLookup>[0]["api"],
      store: createMemorySyncStore(),
    });
    await expect(lookup(ASSIGNMENT_ID)).resolves.toBeNull();
  });
});
