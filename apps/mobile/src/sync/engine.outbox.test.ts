import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import type {
  SyncMutationRequest,
  SyncMutationResult,
  SyncPushResponse,
} from "@fitbud/contracts";
import {
  PUSH_BATCH_SIZE,
  classifyPushError,
  createMemorySyncStore,
  createSyncEngine,
  summariseOutbox,
  type SyncEngine,
  type TraineeSyncStore,
} from "./engine";

/**
 * Z12-41: the sync status comes only from the outbox's real state. Each test
 * drives the engine through a fake API that behaves like the server (it
 * remembers applied mutation ids and answers `already_applied` for a
 * duplicate) and then reads the outbox.
 */

const REL = "22222222-2222-4222-8222-222222222222";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function applied(mutation: SyncMutationRequest): SyncMutationResult {
  return {
    mutationId: mutation.mutationId,
    status: "applied",
    recordId: mutation.recordId,
    serverVersion: 1,
    entityType: mutation.entityType,
    error: null,
  };
}

/** A server that dedupes by mutation id, the way `/sync/push` does. */
function fakeServer() {
  const rows = new Map<string, SyncMutationRequest>();
  const requests: SyncMutationRequest[][] = [];
  let mode: "online" | "offline" | "500" = "online";
  const push = async (body: {
    mutations: SyncMutationRequest[];
  }): Promise<SyncPushResponse> => {
    if (mode === "offline") throw new TypeError("Network request failed");
    if (mode === "500") {
      throw new ApiClientError({
        code: "INTERNAL",
        message: "Server error.",
        requestId: "req-1",
        status: 500,
      });
    }
    requests.push(body.mutations);
    return {
      results: body.mutations.map((mutation) => {
        if (rows.has(mutation.mutationId)) {
          return { ...applied(mutation), status: "already_applied" as const };
        }
        rows.set(mutation.mutationId, mutation);
        return applied(mutation);
      }),
    };
  };
  return {
    rows,
    requests,
    push,
    set(next: typeof mode) {
      mode = next;
    },
  };
}

function engineFor(
  store: TraineeSyncStore,
  push: (body: { mutations: SyncMutationRequest[] }) => Promise<SyncPushResponse>,
  options: Parameters<typeof createSyncEngine>[2] = {},
): SyncEngine {
  return createSyncEngine(
    store,
    {
      pushSync: push,
      pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
    },
    options,
  );
}

async function logWeight(engine: SyncEngine, n: number) {
  const id = uuid(n);
  return engine.enqueue({
    mutationId: id,
    entityType: "measurement",
    recordId: id,
    operation: "measurement.create",
    expectedServerVersion: null,
    clientOccurredAt: "2026-11-15T07:05:00.000Z",
    payloadJson: JSON.stringify({
      coachingRelationshipId: REL,
      id,
      body: { type: "body_weight_kg", value: 78.3, unit: "kg" },
    }),
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("outbox status is the outbox's real state", () => {
  it("a new log is waiting: saved on the phone, nothing sending, nothing failed", async () => {
    const store = createMemorySyncStore();
    const engine = engineFor(store, fakeServer().push);
    await logWeight(engine, 1);

    expect(await engine.getStatus()).toEqual({
      waiting: 1,
      sending: 0,
      failed: 0,
      waitingReason: null,
      lastSentAt: null,
    });
  });

  it("a 200 removes the item: the outbox is empty and Last sent is set", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    const engine = engineFor(store, server.push);
    await logWeight(engine, 1);

    const outcome = await engine.sendNow();

    expect(outcome.sent).toBe(1);
    expect(await store.listOutbox()).toEqual([]);
    const status = await engine.getStatus();
    expect(status).toMatchObject({ waiting: 0, sending: 0, failed: 0 });
    expect(status.lastSentAt).not.toBeNull();
    expect(server.rows.size).toBe(1);
  });

  it("shows Sending only while the request is in flight", async () => {
    const store = createMemorySyncStore();
    let release: (value: SyncPushResponse) => void = () => undefined;
    let sent: SyncMutationRequest[] = [];
    const engine = engineFor(
      store,
      (body) =>
        new Promise<SyncPushResponse>((resolve) => {
          sent = body.mutations;
          release = resolve;
        }),
    );
    await logWeight(engine, 1);

    const sending = engine.sendNow();
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(await engine.getStatus()).toMatchObject({ waiting: 0, sending: 1 });

    release({ results: sent.map(applied) });
    await sending;
    expect(await engine.getStatus()).toMatchObject({ waiting: 0, sending: 0 });
  });

  it("no network: the row goes back to waiting with the reason, never stays 'sending'", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    server.set("offline");
    const engine = engineFor(store, server.push);
    await logWeight(engine, 1);

    await expect(engine.pushPending()).rejects.toThrow("Network request failed");

    const [row] = await store.listOutbox();
    expect(row).toMatchObject({
      status: "pending",
      lastErrorCode: "UNREACHABLE",
      attempts: 1,
    });
    expect(await engine.getStatus()).toMatchObject({
      waiting: 1,
      sending: 0,
      failed: 0,
      waitingReason: "UNREACHABLE",
    });
  });

  it("a server error keeps the row waiting with its own reason", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    server.set("500");
    const engine = engineFor(store, server.push);
    await logWeight(engine, 1);

    const outcome = await engine.sendNow();

    expect(outcome.sent).toBe(0);
    expect(outcome.status).toMatchObject({
      waiting: 1,
      failed: 0,
      waitingReason: "SERVER",
    });
  });

  it("a request with no answer times out and the row waits again", async () => {
    vi.useFakeTimers();
    const store = createMemorySyncStore();
    const engine = engineFor(store, () => new Promise<SyncPushResponse>(() => undefined), {
      requestTimeoutMs: 5_000,
    });
    await logWeight(engine, 1);

    const sending = engine.sendNow();
    await vi.advanceTimersByTimeAsync(5_001);
    const outcome = await sending;

    expect(outcome.status).toMatchObject({
      waiting: 1,
      sending: 0,
      waitingReason: "UNREACHABLE",
    });
  });

  it("a refusal keeps the server's reason on the row", async () => {
    const store = createMemorySyncStore();
    const engine = engineFor(store, async (body) => ({
      results: body.mutations.map((mutation) => ({
        mutationId: mutation.mutationId,
        status: "conflicted" as const,
        recordId: mutation.recordId,
        serverVersion: null,
        entityType: mutation.entityType,
        error: {
          code: "LOCKED",
          message: "This meal cannot be logged.",
          details: { reason: "superseded" },
        },
      })),
    }));
    await logWeight(engine, 1);

    const results = await engine.pushPending();

    expect(results[0]?.status).toBe("conflicted");
    const [row] = await store.listOutbox();
    expect(row).toMatchObject({
      status: "conflicted",
      lastErrorCode: "LOCKED",
      lastErrorReason: "superseded",
      lastError: "This meal cannot be logged.",
    });
    expect(await engine.getStatus()).toMatchObject({ waiting: 0, failed: 1 });
  });

  it("a retryable refusal is not a failure: the row keeps waiting", async () => {
    const store = createMemorySyncStore();
    let calls = 0;
    const engine = engineFor(store, async (body) => {
      calls += 1;
      return {
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.mutationId,
          status: "rejected" as const,
          recordId: mutation.recordId,
          serverVersion: null,
          entityType: mutation.entityType,
          error: { code: "INTERNAL", message: "Server error." },
          retryable: true,
        })),
      };
    });
    await logWeight(engine, 1);

    const outcome = await engine.sendNow();

    // Sent once in this attempt, not in a loop.
    expect(calls).toBe(1);
    expect(outcome.status).toMatchObject({
      waiting: 1,
      failed: 0,
      waitingReason: "SERVER",
    });
  });

  it("a row the server did not answer for is waiting, not sending", async () => {
    const store = createMemorySyncStore();
    const engine = engineFor(store, async () => ({ results: [] }));
    await logWeight(engine, 1);

    await engine.pushPending();

    expect(await engine.getStatus()).toMatchObject({ waiting: 1, sending: 0 });
  });

  it("tells listeners about every change", async () => {
    const store = createMemorySyncStore();
    const engine = engineFor(store, fakeServer().push);
    const seen: number[] = [];
    const stop = engine.subscribe(() => {
      void engine.getStatus().then((status) => seen.push(status.waiting));
    });

    await logWeight(engine, 1);
    await engine.sendNow();
    await vi.waitFor(() => expect(seen.at(-1)).toBe(0));
    expect(seen).toContain(1);

    stop();
    const before = seen.length;
    await logWeight(engine, 2);
    await Promise.resolve();
    expect(seen).toHaveLength(before);
  });
});

describe("offline create, restart, reconnect, retry and duplicate delivery", () => {
  it("airplane mode: three logs are saved and none is lost when the push fails", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    server.set("offline");
    const engine = engineFor(store, server.push);

    for (const n of [1, 2, 3]) {
      await logWeight(engine, n);
      await engine.sendNow();
    }

    expect((await store.listOutbox()).map((row) => row.mutationId)).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
    expect(server.rows.size).toBe(0);
  });

  it("reconnect: everything sends in the order it was logged, once", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    server.set("offline");
    const engine = engineFor(store, server.push);
    for (const n of [1, 2, 3]) await logWeight(engine, n);
    await engine.sendNow();

    server.set("online");
    const outcome = await engine.sendNow();

    expect(outcome.sent).toBe(3);
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.map((m) => m.mutationId)).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
    expect(await store.listOutbox()).toEqual([]);
    // The outbox and the server agree: same ids, no duplicates, no losses.
    expect([...server.rows.keys()]).toEqual([uuid(1), uuid(2), uuid(3)]);
  });

  it("retry reuses the same mutation id and idempotency key", async () => {
    const store = createMemorySyncStore();
    const seen: Array<[string, string]> = [];
    let fail = true;
    const engine = engineFor(store, async (body) => {
      for (const m of body.mutations) seen.push([m.mutationId, m.idempotencyKey]);
      if (fail) throw new TypeError("Network request failed");
      return { results: body.mutations.map(applied) };
    });
    await logWeight(engine, 7);

    await engine.sendNow();
    fail = false;
    await engine.sendNow();

    expect(seen).toEqual([
      [uuid(7), uuid(7)],
      [uuid(7), uuid(7)],
    ]);
  });

  it("the answer was lost: the retry is a duplicate delivery and the server keeps one row", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    let dropAnswer = true;
    const engine = engineFor(store, async (body) => {
      const response = await server.push(body);
      if (dropAnswer) {
        dropAnswer = false;
        throw new TypeError("Network request failed");
      }
      return response;
    });
    await logWeight(engine, 1);

    await engine.sendNow();
    expect(server.rows.size).toBe(1);
    expect(await engine.getStatus()).toMatchObject({ waiting: 1 });

    const results = await engine.pushPending();

    expect(results[0]?.status).toBe("already_applied");
    expect(server.rows.size).toBe(1);
    expect(await store.listOutbox()).toEqual([]);
  });

  it("two sends at once never put the same row in two requests", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    const engine = engineFor(store, async (body) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return server.push(body);
    });
    await logWeight(engine, 1);
    const first = engine.pushPending();
    await logWeight(engine, 2);
    const second = engine.pushPending();
    await Promise.all([first, second, engine.sendNow()]);

    const sentIds = server.requests.flat().map((m) => m.mutationId);
    expect(sentIds.sort()).toEqual([uuid(1), uuid(2)]);
    expect(await store.listOutbox()).toEqual([]);
  });

  it("enqueueing the same mutation id again never resets or duplicates the row", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    server.set("offline");
    const engine = engineFor(store, server.push);
    await logWeight(engine, 1);
    await engine.sendNow();

    const again = await logWeight(engine, 1);

    expect(again.attempts).toBe(1);
    expect(await store.listOutbox()).toHaveLength(1);
  });

  it("sends more than one batch when the queue is longer than the server's limit", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    const engine = engineFor(store, server.push);
    for (let n = 1; n <= PUSH_BATCH_SIZE + 3; n += 1) await logWeight(engine, n);

    const outcome = await engine.sendNow();

    expect(outcome.sent).toBe(PUSH_BATCH_SIZE + 3);
    expect(server.requests.map((batch) => batch.length)).toEqual([PUSH_BATCH_SIZE, 3]);
  });

  it("one row the API refuses outright does not hold the others back", async () => {
    const store = createMemorySyncStore();
    const server = fakeServer();
    const engine = engineFor(store, async (body) => {
      if (body.mutations.some((m) => m.mutationId === uuid(2))) {
        throw new ApiClientError({
          code: "INVALID_REQUEST",
          message: "Invalid sync push request.",
          requestId: "req-1",
          status: 400,
        });
      }
      return server.push(body);
    });
    for (const n of [1, 2, 3]) await logWeight(engine, n);

    const outcome = await engine.sendNow();

    expect(outcome.sent).toBe(2);
    expect([...server.rows.keys()]).toEqual([uuid(1), uuid(3)]);
    const rows = await store.listOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      mutationId: uuid(2),
      status: "rejected",
      lastErrorCode: "INVALID_REQUEST",
    });
  });
});

describe("refused rows", () => {
  async function refusedEngine() {
    const store = createMemorySyncStore();
    let refuse = true;
    const server = fakeServer();
    const engine = engineFor(store, async (body) => {
      if (!refuse) return server.push(body);
      return {
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.mutationId,
          status: "conflicted" as const,
          recordId: mutation.recordId,
          serverVersion: null,
          entityType: mutation.entityType,
          error: { code: "LOCKED", message: "This meal cannot be logged." },
        })),
      };
    });
    await logWeight(engine, 1);
    await engine.pushPending();
    return { store, engine, server, allow: () => (refuse = false) };
  }

  it("a refused row is not sent again on its own", async () => {
    const { engine, server } = await refusedEngine();
    await engine.sendNow();
    expect(server.requests).toHaveLength(0);
    expect(await engine.getStatus()).toMatchObject({ failed: 1, waiting: 0 });
  });

  it("Retry puts it back to waiting with the same ids, and a 200 clears it", async () => {
    const { engine, store, server, allow } = await refusedEngine();
    allow();

    await engine.retryEntry(uuid(1));
    expect(await engine.getStatus()).toMatchObject({ failed: 0, waiting: 1 });
    await engine.sendNow();

    expect(server.requests[0]![0]).toMatchObject({
      mutationId: uuid(1),
      idempotencyKey: uuid(1),
    });
    expect(await store.listOutbox()).toEqual([]);
  });

  it("Keep my log marks the conflict as seen and keeps the row", async () => {
    const { engine, store } = await refusedEngine();
    await engine.keepEntry(uuid(1));
    const [row] = await store.listOutbox();
    expect(row?.status).toBe("conflicted");
    expect(row?.keptAt).not.toBeNull();
  });

  it("a caller whose row went out in another push still gets its verdict", async () => {
    const { engine } = await refusedEngine();
    const results = await engine.pushPending();
    expect(results).toEqual([
      expect.objectContaining({
        mutationId: uuid(1),
        status: "conflicted",
        error: expect.objectContaining({ code: "LOCKED" }),
      }),
    ]);
  });

  it("discard removes only a refused row", async () => {
    const { engine, store } = await refusedEngine();
    await logWeight(engine, 2);
    await engine.discardEntry(uuid(2));
    await engine.discardEntry(uuid(1));
    expect((await store.listOutbox()).map((row) => row.mutationId)).toEqual([uuid(2)]);
  });
});

describe("classifyPushError", () => {
  const api = (status: number) =>
    new ApiClientError({ code: "X", message: "m", requestId: "r", status });

  it.each([
    [new TypeError("Network request failed"), "UNREACHABLE"],
    [api(500), "SERVER"],
    [api(503), "SERVER"],
    [api(429), "SERVER"],
    [api(401), "AUTH"],
    [api(403), "AUTH"],
    [Object.assign(new Error("bad shape"), { name: "ZodError" }), "CLIENT"],
  ])("%s keeps the rows waiting as %s", (error, reason) => {
    expect(classifyPushError(error)).toEqual({ kind: "waiting", reason });
  });

  it.each([400, 413, 422])("%i refuses the request itself", (status) => {
    expect(classifyPushError(api(status)).kind).toBe("invalid");
  });
});

describe("summariseOutbox", () => {
  it("counts each row in exactly one state", () => {
    expect(
      summariseOutbox(
        [
          { status: "pending", lastErrorCode: null },
          { status: "pending", lastErrorCode: "UNREACHABLE" },
          { status: "in_flight", lastErrorCode: null },
          { status: "rejected", lastErrorCode: "SET_NOT_FOUND" },
          { status: "conflicted", lastErrorCode: "LOCKED" },
        ],
        "2026-11-15T11:11:00.000Z",
      ),
    ).toEqual({
      waiting: 2,
      sending: 1,
      failed: 2,
      waitingReason: "UNREACHABLE",
      lastSentAt: "2026-11-15T11:11:00.000Z",
    });
  });

  it("a server error code on a refused row is never a waiting reason", () => {
    expect(
      summariseOutbox([{ status: "pending", lastErrorCode: "LOCKED" }], null)
        .waitingReason,
    ).toBeNull();
  });
});
