import { describe, expect, it } from "vitest";
import type {
  SyncMutationRequest,
  SyncMutationResult,
  SyncPullResponse,
  SyncPushResponse,
} from "@fitbud/contracts";
import { shouldAdvanceSyncCursor } from "@fitbud/core";
import { createMemorySyncStore, createSyncEngine } from "./engine";

function createFakeApi(handlers: {
  push?: (body: { mutations: SyncMutationRequest[] }) => Promise<SyncPushResponse>;
  pull?: (query?: {
    cursor?: string | null;
    limit?: number;
  }) => Promise<SyncPullResponse>;
}) {
  return {
    pushSync: async (body: { mutations: SyncMutationRequest[] }) => {
      if (!handlers.push) throw new Error("offline");
      return handlers.push(body);
    },
    pullSync: async (query?: { cursor?: string | null; limit?: number }) => {
      if (!handlers.pull) throw new Error("offline");
      return handlers.pull(query);
    },
  };
}

describe("trainee offline sync engine", () => {
  it("airplane-mode create: writes SQLite outbox before network", async () => {
    const store = createMemorySyncStore();
    const engine = createSyncEngine(store, createFakeApi({}));

    const mutationId = "11111111-1111-4111-8111-111111111111";
    await engine.enqueue({
      mutationId,
      idempotencyKey: mutationId,
      entityType: "measurement",
      recordId: mutationId,
      operation: "measurement.create",
      expectedServerVersion: null,
      clientOccurredAt: new Date().toISOString(),
      payloadJson: JSON.stringify({
        coachingRelationshipId: "22222222-2222-4222-8222-222222222222",
        id: mutationId,
        body: { type: "body_weight_kg", value: 70, unit: "kg" },
      }),
    });

    const pending = await store.listPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.mutationId).toBe(mutationId);
    expect(pending[0]?.status).toBe("pending");
  });

  it("restart: pending outbox survives recoverAfterRestart", async () => {
    const store = createMemorySyncStore();
    const engine = createSyncEngine(store, createFakeApi({}));
    const mutationId = "33333333-3333-4333-8333-333333333333";
    await engine.enqueue({
      mutationId,
      idempotencyKey: mutationId,
      entityType: "meal_compliance",
      recordId: "44444444-4444-4444-8444-444444444444",
      operation: "meal.confirm",
      expectedServerVersion: null,
      clientOccurredAt: new Date().toISOString(),
      payloadJson: JSON.stringify({
        assignmentId: "44444444-4444-4444-8444-444444444444",
        body: {},
      }),
    });

    await store.updateOutboxStatus(mutationId, "in_flight");
    await engine.recoverAfterRestart();

    const pending = await store.listPendingOutbox();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.mutationId).toBe(mutationId);
    expect(pending[0]?.idempotencyKey).toBe(mutationId);
    expect(pending[0]?.status).toBe("pending");
  });

  it("reconnect: pushes pending outbox and acks results", async () => {
    const store = createMemorySyncStore();
    let sawMutations: SyncMutationRequest[] = [];
    const engine = createSyncEngine(
      store,
      createFakeApi({
        push: async (body) => {
          sawMutations = body.mutations;
          return {
            results: body.mutations.map(
              (mutation): SyncMutationResult => ({
                mutationId: mutation.mutationId,
                status: "applied",
                recordId: mutation.recordId,
                serverVersion: 1,
                entityType: mutation.entityType,
                error: null,
              }),
            ),
          };
        },
      }),
    );

    const mutationId = "55555555-5555-4555-8555-555555555555";
    await engine.enqueue({
      mutationId,
      idempotencyKey: mutationId,
      entityType: "checkin",
      recordId: "66666666-6666-4666-8666-666666666666",
      operation: "checkin.submit",
      expectedServerVersion: 0,
      clientOccurredAt: new Date().toISOString(),
      payloadJson: JSON.stringify({
        checkinId: "66666666-6666-4666-8666-666666666666",
        body: {
          expectedVersion: 0,
          answers: { wellbeing: "Good" },
        },
      }),
    });

    const results = await engine.pushPending();
    expect(sawMutations).toHaveLength(1);
    expect(results[0]?.status).toBe("applied");
    const row = await store.getOutbox(mutationId);
    expect(row?.status).toBe("acked");
  });

  it("retry: reuses the same mutation UUID and idempotency key", async () => {
    const store = createMemorySyncStore();
    const mutationId = "77777777-7777-4777-8777-777777777777";
    const seenKeys: string[] = [];
    const engine = createSyncEngine(
      store,
      createFakeApi({
        push: async (body) => {
          seenKeys.push(body.mutations[0]!.idempotencyKey);
          if (seenKeys.length === 1) {
            throw new Error("transient");
          }
          return {
            results: [
              {
                mutationId,
                status: "applied",
                recordId: mutationId,
                serverVersion: 0,
                entityType: "measurement",
                error: null,
              },
            ],
          };
        },
      }),
    );

    await engine.enqueue({
      mutationId,
      idempotencyKey: mutationId,
      entityType: "measurement",
      recordId: mutationId,
      operation: "measurement.create",
      expectedServerVersion: null,
      clientOccurredAt: new Date().toISOString(),
      payloadJson: JSON.stringify({
        coachingRelationshipId: "88888888-8888-4888-8888-888888888888",
        id: mutationId,
        body: { type: "waist_cm", value: 80, unit: "cm" },
      }),
    });

    await expect(engine.pushPending()).rejects.toThrow("transient");
    await engine.recoverAfterRestart();

    const retry = await engine.pushPending();
    expect(seenKeys).toEqual([mutationId, mutationId]);
    expect(retry[0]?.status).toBe("applied");
  });

  it("duplicate delivery: second identical push result is already_applied and does not double-apply locally", async () => {
    const store = createMemorySyncStore();
    const mutationId = "99999999-9999-4999-8999-999999999999";
    let deliveries = 0;
    const engine = createSyncEngine(
      store,
      createFakeApi({
        push: async (body) => {
          deliveries += 1;
          return {
            results: body.mutations.map((mutation) => ({
              mutationId: mutation.mutationId,
              status: deliveries === 1 ? "applied" : "already_applied",
              recordId: mutation.recordId,
              serverVersion: 1,
              entityType: mutation.entityType,
              error: null,
            })),
          } satisfies SyncPushResponse;
        },
      }),
    );

    await engine.enqueue({
      mutationId,
      idempotencyKey: mutationId,
      entityType: "measurement",
      recordId: mutationId,
      operation: "measurement.create",
      expectedServerVersion: null,
      clientOccurredAt: new Date().toISOString(),
      payloadJson: JSON.stringify({
        coachingRelationshipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        id: mutationId,
        body: { type: "body_weight_kg", value: 71, unit: "kg" },
      }),
    });

    const first = await engine.pushPending();
    expect(first[0]?.status).toBe("applied");

    await store.updateOutboxStatus(mutationId, "pending");
    const second = await engine.pushPending();
    expect(second[0]?.status).toBe("already_applied");
    expect(deliveries).toBe(2);
    expect(await store.getOutbox(mutationId)).toMatchObject({
      mutationId,
      status: "acked",
    });
  });

  it("advances sync cursor only after applying pull changes", async () => {
    const store = createMemorySyncStore();
    const engine = createSyncEngine(
      store,
      createFakeApi({
        pull: async () => ({
          changes: [
            {
              sequence: 1,
              entityType: "measurement",
              recordId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              changeKind: "upsert",
              serverVersion: 0,
              coachingRelationshipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              changedAt: "2026-09-26T12:00:00.000Z",
              payload: {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                type: "body_weight_kg",
                value: 70,
              },
            },
          ],
          nextCursor: "cursor-1",
          hasMore: false,
        }),
      }),
    );

    expect(
      shouldAdvanceSyncCursor({
        appliedAllChanges: false,
        pullHasChanges: true,
      }),
    ).toBe(false);

    const result = await engine.pullAndApply();
    expect(result.applied).toBe(1);
    expect(result.advancedCursor).toBe(true);
    expect((await store.getMeta()).cursor).toBe("cursor-1");
    const local = await store.getLocal(
      "measurement",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(local?.payloadJson).toContain("body_weight_kg");
  });
});
