import { describe, expect, it } from "vitest";
import type { SyncMutationRequest, SyncMutationResult } from "@fitbud/contracts";
import { AWAITS_VERDICT, enqueueAndPush } from "./actions";
import { createMemorySyncStore, createSyncEngine, type SyncApi } from "./engine";

/**
 * Z14-2 (D-W14-6): a log returns as soon as it is on the phone; the push runs
 * behind it and its verdict lands on the outbox row.
 */

const MEAL = "00000000-0000-4000-8000-0000000000b1";

/** A transport that answers only when the test says so. */
function slowTransport() {
  const requests: SyncMutationRequest[][] = [];
  let answer: (results: (mutations: SyncMutationRequest[]) => SyncMutationResult[]) => void =
    () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const api: SyncApi = {
    pushSync: (body) =>
      new Promise((resolve, reject) => {
        requests.push(body.mutations);
        answer = (make) => resolve({ results: make(body.mutations) });
        fail = reject;
      }),
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  };
  return {
    api,
    requests,
    answer: (make: (mutations: SyncMutationRequest[]) => SyncMutationResult[]) =>
      answer(make),
    fail: (error: Error) => fail(error),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("enqueueAndPush (Z14-2)", () => {
  it("resolves after the outbox write, before the push answers", async () => {
    const transport = slowTransport();
    const engine = createSyncEngine(createMemorySyncStore(), transport.api);

    const outcome = await enqueueAndPush(engine, {
      recordId: MEAL,
      operation: "meal.confirm",
      payload: { assignmentId: MEAL, body: { photoIntent: null } },
    });

    // Back already, with the log on the phone and the push still open.
    expect(outcome.results).toEqual([]);
    const rows = await engine.store.listOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mutationId).toBe(outcome.mutationId);
    expect(rows[0]!.idempotencyKey).toBe(outcome.mutationId);
    await flush();
    expect(transport.requests).toHaveLength(1);
    expect((await engine.store.listOutbox())[0]!.status).toBe("in_flight");

    // The server refuses it: the verdict lands on the row with its message.
    transport.answer((mutations) =>
      mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: "rejected" as const,
        recordId: mutation.recordId,
        serverVersion: null,
        entityType: mutation.entityType,
        error: { code: "LOCKED", message: "This meal was closed by your coach." },
      })),
    );
    const verdict = await outcome.pushed;
    expect(verdict).toHaveLength(1);
    expect(verdict[0]!.status).toBe("rejected");
    const [row] = await engine.store.listOutbox();
    expect(row!.status).toBe("rejected");
    expect(row!.lastError).toBe("This meal was closed by your coach.");
    expect(row!.lastErrorCode).toBe("LOCKED");
  });

  it("an accepted log leaves the outbox when the push answers", async () => {
    const transport = slowTransport();
    const engine = createSyncEngine(createMemorySyncStore(), transport.api);
    const outcome = await enqueueAndPush(engine, {
      recordId: MEAL,
      operation: "meal.skip",
      payload: { assignmentId: MEAL, body: { notes: null } },
    });
    await flush();
    transport.answer((mutations) =>
      mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: "applied" as const,
        recordId: mutation.recordId,
        serverVersion: 2,
        entityType: mutation.entityType,
        error: null,
      })),
    );
    expect((await outcome.pushed)[0]!.status).toBe("applied");
    expect(await engine.store.listOutbox()).toEqual([]);
  });

  it("a push with no answer never rejects: the row waits with the reason", async () => {
    const transport = slowTransport();
    const engine = createSyncEngine(createMemorySyncStore(), transport.api);
    const outcome = await enqueueAndPush(engine, {
      recordId: MEAL,
      operation: "meal.confirm",
      payload: { assignmentId: MEAL, body: { photoIntent: null } },
    });
    await flush();
    transport.fail(new TypeError("Network request failed"));
    await expect(outcome.pushed).resolves.toEqual([]);
    const [row] = await engine.store.listOutbox();
    expect(row!.status).toBe("pending");
    expect(row!.lastErrorCode).toBe("UNREACHABLE");
    expect(row!.attempts).toBe(1);
  });

  it("waits for the verdict for a workout start and a check-in submit, or when asked", async () => {
    expect([...AWAITS_VERDICT].sort()).toEqual(["checkin.submit", "workout.start"]);
    const transport = slowTransport();
    const engine = createSyncEngine(createMemorySyncStore(), transport.api);
    let settled = false;
    const waiting = enqueueAndPush(engine, {
      recordId: MEAL,
      operation: "meal.confirm",
      payload: { assignmentId: MEAL, body: { photoIntent: null } },
      wait: true,
    }).then((outcome) => {
      settled = true;
      return outcome;
    });
    await flush();
    expect(settled).toBe(false);
    transport.answer((mutations) =>
      mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: "applied" as const,
        recordId: mutation.recordId,
        serverVersion: 1,
        entityType: mutation.entityType,
        error: null,
      })),
    );
    const outcome = await waiting;
    expect(outcome.results.map((result) => result.status)).toEqual(["applied"]);
  });
});
