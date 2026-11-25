/**
 * Z14-12 fix round 1: the rating is sent with the version read from the
 * server, never one the phone counted. The "server" below keeps what the API
 * keeps (pause, resume and finish each add 1 to `recordVersion`; feedback
 * needs the exact version, else 409) behind the real sync engine and outbox.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The device store module reads `Platform`; these suites pass their own store.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../../lib/secureSessionStore", () => ({
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));
import type {
  SyncMutationRequest,
  SyncMutationResult,
  WorkoutExecution,
} from "@fitbud/contracts";
import { createMemorySyncStore, createSyncEngine, type SyncApi } from "../../sync/engine";
import { enqueueAndPush } from "../../sync/actions";
import {
  RATING_NOTE_WINDOW_CLOSED_MESSAGE,
  resetActiveHoldsForTests,
  resumeHeldWorkoutFeedback,
  saveWorkoutRating,
} from "./rpeRating";
import { createMemoryKeyValue, type AsyncKeyValue } from "../../sync/storage";
import {
  PENDING_FEEDBACK_MAX_AGE_MS,
  createPendingFeedbackStore,
} from "./pendingFeedbackStore";

const EXECUTION = "00000000-0000-4000-8000-000000000900";

function fakeServer(initial: { recordVersion: number; sessionRpe: number | null; sessionNote?: string | null }) {
  const state = {
    recordVersion: initial.recordVersion,
    sessionRpe: initial.sessionRpe,
    sessionNote: (initial.sessionNote ?? null) as string | null,
    sessionNoteOnBump: undefined as string | null | undefined,
    sentBodies: [] as object[],
    finished: false,
    windowOpen: true,
    online: true,
    // Set to bump the version behind the phone's back once, before the next feedback.
    bumpBeforeFeedback: 0,
    sessionRpeOnBump: undefined as number | null | undefined,
    feedbackVersions: [] as number[],
    reads: 0,
  };
  const result = (
    mutation: SyncMutationRequest,
    over: Partial<SyncMutationResult>,
  ): SyncMutationResult => ({
    mutationId: mutation.mutationId,
    status: "applied",
    recordId: mutation.recordId,
    serverVersion: state.recordVersion,
    entityType: mutation.entityType,
    error: null,
    ...over,
  });
  const syncApi: SyncApi = {
    pushSync: async (body) => {
      if (!state.online) throw new TypeError("Network request failed");
      return {
        results: body.mutations.map((mutation) => {
          if (mutation.operation === "workout.complete") {
            state.recordVersion += 1;
            state.finished = true;
            return result(mutation, {});
          }
          if (mutation.operation === "workout.feedback") {
            const sent = (mutation.payload as { body: { rpe?: number | null; note?: string | null; recordVersion: number } })
              .body;
            state.feedbackVersions.push(sent.recordVersion);
            state.sentBodies.push(sent);
            if (state.bumpBeforeFeedback > 0) {
              state.recordVersion += state.bumpBeforeFeedback;
              state.bumpBeforeFeedback = 0;
              if (state.sessionRpeOnBump !== undefined) state.sessionRpe = state.sessionRpeOnBump;
              if (state.sessionNoteOnBump !== undefined) state.sessionNote = state.sessionNoteOnBump;
            }
            if (!state.windowOpen) {
              return result(mutation, {
                status: "rejected",
                error: {
                  code: "FEEDBACK_EDIT_WINDOW_CLOSED",
                  message: "Ratings can be changed for 48 hours after a workout.",
                },
              });
            }
            if (sent.recordVersion !== state.recordVersion) {
              return result(mutation, {
                status: "conflicted",
                error: { code: "VERSION_CONFLICT", message: "Changed elsewhere." },
              });
            }
            state.recordVersion += 1;
            if (sent.rpe !== undefined) state.sessionRpe = sent.rpe;
            if (sent.note !== undefined) state.sessionNote = sent.note;
            return result(mutation, {});
          }
          return result(mutation, {});
        }),
      };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  };
  const api = {
    getWorkoutExecution: vi.fn(async () => {
      if (!state.online) throw new TypeError("Network request failed");
      state.reads += 1;
      return {
        id: EXECUTION,
        recordVersion: state.recordVersion,
        sessionRpe: state.sessionRpe,
        sessionNote: state.sessionNote,
      } as WorkoutExecution;
    }),
  };
  return { state, syncApi, api };
}

async function finish(sync: ReturnType<typeof createSyncEngine>) {
  return enqueueAndPush(sync, {
    recordId: EXECUTION,
    operation: "workout.complete",
    expectedServerVersion: 1,
    payload: { executionId: EXECUTION, body: { sessionRpe: null } },
    wait: true,
  });
}

describe("saveWorkoutRating (Z14-12 fix round 1)", () => {
  it("after a pause and a resume, sends the server's version, not the phone's count", async () => {
    // Started v1, paused v2, resumed v3, finished v4. The phone knew v1.
    const server = fakeServer({ recordVersion: 3, sessionRpe: null });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);
    await finish(sync);
    expect(server.state.recordVersion).toBe(4);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, change: { rpe: 7 } });

    expect(outcome).toEqual({ kind: "saved", rpe: 7, note: null });
    // The old code sent phone version 1 + 1 = 2 here and got a 409.
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(7);
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("holds the pick while the finish is queued offline, then sends it with the version read after the finish", async () => {
    const server = fakeServer({ recordVersion: 3, sessionRpe: null });
    server.state.online = false;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);
    await finish(sync);
    expect((await sync.store.listOutbox()).map((row) => row.operation)).toEqual(["workout.complete"]);

    const progress = vi.fn();
    const pending = saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 8 },
      progress,
    });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith("held"));
    expect(server.state.feedbackVersions).toEqual([]);

    // Back online: the finish syncs, then the rating goes out with v4.
    server.state.online = true;
    await sync.pushPending();
    const outcome = await pending;

    expect(outcome).toEqual({ kind: "saved", rpe: 8, note: null });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(8);
  });

  it("on a 409 re-reads once and retries with the fresh version when the server's rating is unchanged", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    // The version moves after the phone read it (a coach-side bump), rating unchanged.
    server.state.bumpBeforeFeedback = 2;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, change: { rpe: 9 } });

    expect(outcome).toEqual({ kind: "saved", rpe: 9, note: null });
    expect(server.state.feedbackVersions).toEqual([4, 6]);
    expect(server.state.reads).toBe(2);
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("on a 409 where the server's rating changed, surfaces the conflict with the server's rating and sends nothing more", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    server.state.bumpBeforeFeedback = 1;
    server.state.sessionRpeOnBump = 3;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, change: { rpe: 9 } });

    expect(outcome).toMatchObject({ kind: "refused", reason: "conflict", serverRpe: 3 });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(3);
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("reports a closed window in plain words", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    server.state.windowOpen = false;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, change: { rpe: 9 } });

    expect(outcome).toEqual({
      kind: "refused",
      reason: "window_closed",
      message: "Ratings can be changed for 48 hours after a workout.",
    });
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("carries the note with the rating in one send", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: null });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 7, note: "  Left knee felt tight.  " },
    });

    expect(outcome).toEqual({ kind: "saved", rpe: 7, note: "Left knee felt tight." });
    expect(server.state.sentBodies).toEqual([
      { rpe: 7, note: "Left knee felt tight.", recordVersion: 4 },
    ]);
  });

  it("sends only the note when only the note changed, and clears with whitespace", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 7, sessionNote: "Old note" });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    await saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 7, note: "   " },
    });

    expect(server.state.sentBodies).toEqual([{ note: null, recordVersion: 4 }]);
    expect(server.state.sessionNote).toBeNull();
  });

  it("treats equal values as already saved and sends nothing", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 7, sessionNote: "Same" });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 7, note: " Same " },
    });

    expect(outcome).toEqual({ kind: "saved", rpe: 7, note: "Same" });
    expect(server.state.sentBodies).toEqual([]);
  });

  it("on a 409 where the server's note changed, surfaces the conflict with the server's note", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5, sessionNote: "A" });
    server.state.bumpBeforeFeedback = 1;
    server.state.sessionNoteOnBump = "B";
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { note: "C" },
    });

    expect(outcome).toMatchObject({
      kind: "refused",
      reason: "conflict",
      serverNote: "B",
      message: "Your rating or note was changed somewhere else. Save again to replace it.",
    });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionNote).toBe("B");
  });
});

describe("held rating and note survive a restart (Z14-37)", () => {
  const OWNER = "00000000-0000-4000-8000-0000000000a1";
  const OTHER = "00000000-0000-4000-8000-0000000000b2";
  const T0 = Date.parse("2026-11-20T10:00:00.000Z");

  beforeEach(() => {
    resetActiveHoldsForTests();
  });

  /** One phone's device store; each `store()` is what a fresh process opens. */
  function device() {
    const map = new Map<string, string>();
    const storage = createMemoryKeyValue(map);
    return { map, store: () => createPendingFeedbackStore({ storage: () => storage }) };
  }

  async function offlineWithQueuedFinish() {
    const server = fakeServer({ recordVersion: 3, sessionRpe: null });
    server.state.online = false;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);
    await finish(sync);
    return { server, sync };
  }

  it("writes the held rating and note the moment they are held, and removes them once sent", async () => {
    const phone = device();
    const store = phone.store();
    const { server, sync } = await offlineWithQueuedFinish();
    const progress = vi.fn();
    const pending = saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 8, note: "  Knee felt tight on the last set  " },
      progress,
      hold: { ownerId: OWNER, store, now: () => T0 },
    });
    await vi.waitFor(async () => expect(await store.list(OWNER)).toHaveLength(1));
    expect(progress).toHaveBeenCalledWith("held");
    const [held] = await store.list(OWNER);
    expect(held).toMatchObject({
      ownerId: OWNER,
      executionId: EXECUTION,
      change: { rpe: 8, note: "Knee felt tight on the last set" },
      heldAt: T0,
    });

    server.state.online = true;
    await sync.pushPending();
    expect(await pending).toEqual({
      kind: "saved",
      rpe: 8,
      note: "Knee felt tight on the last set",
    });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(await store.list(OWNER)).toEqual([]);
  });

  it("after a restart, sends the held value once the finish has synced (server's version), then removes it", async () => {
    const phone = device();
    // What the process that died had written when the trainee tapped Save.
    await phone.store().hold({
      ownerId: OWNER,
      executionId: EXECUTION,
      change: { rpe: 6, note: "Felt strong" },
      heldAt: T0,
      token: "first-process",
    });

    // A new process: a new store instance over the same device store, and
    // the outbox still holding the finish.
    const store = phone.store();
    const { server, sync } = await offlineWithQueuedFinish();
    const resumed = resumeHeldWorkoutFeedback({
      ownerId: OWNER,
      sync,
      api: server.api,
      store,
      now: () => T0 + 60 * 60 * 1000,
    });
    await vi.waitFor(async () => {
      const [row] = await store.list(OWNER);
      expect(row?.token).not.toBe("first-process");
    });
    expect(server.state.feedbackVersions).toEqual([]);

    server.state.online = true;
    await sync.pushPending();
    await resumed;

    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(6);
    expect(server.state.sessionNote).toBe("Felt strong");
    expect(await store.list(OWNER)).toEqual([]);

    // Resuming again sends nothing more.
    await resumeHeldWorkoutFeedback({ ownerId: OWNER, sync, api: server.api, store });
    expect(server.state.feedbackVersions).toEqual([4]);
  });

  it("never reads or sends another owner's held value", async () => {
    const phone = device();
    await phone.store().hold({
      ownerId: OWNER,
      executionId: EXECUTION,
      change: { rpe: 6 },
      heldAt: T0,
      token: "a",
    });
    const server = fakeServer({ recordVersion: 4, sessionRpe: null });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    await resumeHeldWorkoutFeedback({
      ownerId: OTHER,
      sync,
      api: server.api,
      store: phone.store(),
      now: () => T0,
    });

    expect(server.state.feedbackVersions).toEqual([]);
    expect(server.state.reads).toBe(0);
    expect(await phone.store().list(OTHER)).toEqual([]);
    expect(await phone.store().list(OWNER)).toHaveLength(1);
  });

  it("checks the owner written in the record, not only the key", async () => {
    // "user:1" and "user_1" share a key once made key-safe; the record says
    // whose it is. The index is made to name the reader, so only the
    // record's own owner field stands between the two users.
    const phone = device();
    await phone.store().hold({
      ownerId: "user:1",
      executionId: EXECUTION,
      change: { rpe: 6 },
      heldAt: T0,
      token: "a",
    });
    const indexKey = "fitbud.pendingFeedback.v1.index";
    const index = JSON.parse(phone.map.get(indexKey)!) as { ownerId: string };
    index.ownerId = "user_1";
    phone.map.set(indexKey, JSON.stringify(index));
    const server = fakeServer({ recordVersion: 4, sessionRpe: null });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    await resumeHeldWorkoutFeedback({
      ownerId: "user_1",
      sync,
      api: server.api,
      store: phone.store(),
      now: () => T0,
    });

    expect(server.state.feedbackVersions).toEqual([]);
    expect(server.state.reads).toBe(0);
  });

  it("drops a held value older than 72 h without sending it", async () => {
    const phone = device();
    await phone.store().hold({
      ownerId: OWNER,
      executionId: EXECUTION,
      change: { rpe: 6 },
      heldAt: T0,
      token: "a",
    });
    const server = fakeServer({ recordVersion: 4, sessionRpe: null });
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    await resumeHeldWorkoutFeedback({
      ownerId: OWNER,
      sync,
      api: server.api,
      store: phone.store(),
      now: () => T0 + PENDING_FEEDBACK_MAX_AGE_MS + 1,
    });

    expect(server.state.feedbackVersions).toEqual([]);
    expect(await phone.store().list(OWNER)).toEqual([]);
  });

  it("a hold still waiting after 72 h gives up with the neutral closed-window message", async () => {
    const phone = device();
    const { server, sync } = await offlineWithQueuedFinish();
    let clock = T0;
    const pending = saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 8, note: "Late" },
      hold: { ownerId: OWNER, store: phone.store(), now: () => clock },
    });
    await vi.waitFor(async () => expect(await phone.store().list(OWNER)).toHaveLength(1));
    clock = T0 + PENDING_FEEDBACK_MAX_AGE_MS + 1;
    // Any outbox change wakes the wait (still offline: it stays queued).
    await enqueueAndPush(sync, {
      recordId: "00000000-0000-4000-8000-000000000778",
      operation: "workout.pause",
      expectedServerVersion: 1,
      payload: {},
    });

    expect(await pending).toEqual({
      kind: "refused",
      reason: "window_closed",
      message: RATING_NOTE_WINDOW_CLOSED_MESSAGE,
    });
    expect(server.state.feedbackVersions).toEqual([]);
    expect(await phone.store().list(OWNER)).toEqual([]);
  });

  it("a device store that fails never blocks the send", async () => {
    const fail = async (): Promise<never> => {
      throw new Error("disk full");
    };
    const broken: AsyncKeyValue = { get: fail, set: fail, remove: fail };
    const report = vi.fn();
    const store = createPendingFeedbackStore({ storage: () => broken, report });
    const { server, sync } = await offlineWithQueuedFinish();
    const progress = vi.fn();
    const pending = saveWorkoutRating({
      sync,
      api: server.api,
      executionId: EXECUTION,
      change: { rpe: 7 },
      progress,
      hold: { ownerId: OWNER, store },
    });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith("held"));
    server.state.online = true;
    await sync.pushPending();

    expect(await pending).toEqual({ kind: "saved", rpe: 7, note: null });
    expect(report).toHaveBeenCalled();
    await expect(
      resumeHeldWorkoutFeedback({ ownerId: OWNER, sync, api: server.api, store }),
    ).resolves.toBeUndefined();
  });
});
