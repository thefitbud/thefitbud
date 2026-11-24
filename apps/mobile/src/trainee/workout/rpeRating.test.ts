/**
 * Z14-12 fix round 1: the rating is sent with the version read from the
 * server, never one the phone counted. The "server" below keeps what the API
 * keeps (pause, resume and finish each add 1 to `recordVersion`; feedback
 * needs the exact version, else 409) behind the real sync engine and outbox.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  SyncMutationRequest,
  SyncMutationResult,
  WorkoutExecution,
} from "@fitbud/contracts";
import { createMemorySyncStore, createSyncEngine, type SyncApi } from "../../sync/engine";
import { enqueueAndPush } from "../../sync/actions";
import { saveWorkoutRating } from "./rpeRating";

const EXECUTION = "00000000-0000-4000-8000-000000000900";

function fakeServer(initial: { recordVersion: number; sessionRpe: number | null }) {
  const state = {
    recordVersion: initial.recordVersion,
    sessionRpe: initial.sessionRpe,
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
            const sent = (mutation.payload as { body: { rpe: number | null; recordVersion: number } })
              .body;
            state.feedbackVersions.push(sent.recordVersion);
            if (state.bumpBeforeFeedback > 0) {
              state.recordVersion += state.bumpBeforeFeedback;
              state.bumpBeforeFeedback = 0;
              if (state.sessionRpeOnBump !== undefined) state.sessionRpe = state.sessionRpeOnBump;
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
            state.sessionRpe = sent.rpe;
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

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, rpe: 7 });

    expect(outcome).toEqual({ kind: "saved", rpe: 7 });
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
      rpe: 8,
      progress,
    });
    await vi.waitFor(() => expect(progress).toHaveBeenCalledWith("held"));
    expect(server.state.feedbackVersions).toEqual([]);

    // Back online: the finish syncs, then the rating goes out with v4.
    server.state.online = true;
    await sync.pushPending();
    const outcome = await pending;

    expect(outcome).toEqual({ kind: "saved", rpe: 8 });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(8);
  });

  it("on a 409 re-reads once and retries with the fresh version when the server's rating is unchanged", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    // The version moves after the phone read it (a coach-side bump), rating unchanged.
    server.state.bumpBeforeFeedback = 2;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, rpe: 9 });

    expect(outcome).toEqual({ kind: "saved", rpe: 9 });
    expect(server.state.feedbackVersions).toEqual([4, 6]);
    expect(server.state.reads).toBe(2);
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("on a 409 where the server's rating changed, surfaces the conflict with the server's rating and sends nothing more", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    server.state.bumpBeforeFeedback = 1;
    server.state.sessionRpeOnBump = 3;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, rpe: 9 });

    expect(outcome).toMatchObject({ kind: "refused", reason: "conflict", serverRpe: 3 });
    expect(server.state.feedbackVersions).toEqual([4]);
    expect(server.state.sessionRpe).toBe(3);
    expect(await sync.store.listOutbox()).toEqual([]);
  });

  it("reports a closed window in plain words", async () => {
    const server = fakeServer({ recordVersion: 4, sessionRpe: 5 });
    server.state.windowOpen = false;
    const sync = createSyncEngine(createMemorySyncStore(), server.syncApi);

    const outcome = await saveWorkoutRating({ sync, api: server.api, executionId: EXECUTION, rpe: 9 });

    expect(outcome).toEqual({
      kind: "refused",
      reason: "window_closed",
      message: "Ratings can be changed for 48 hours after a workout.",
    });
    expect(await sync.store.listOutbox()).toEqual([]);
  });
});
