import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncMutationRequest, SyncPushResponse } from "@fitbud/contracts";
import { createMemorySyncStore, createSyncEngine } from "./engine";
import { createProbeReachability } from "./reachability";
import {
  SYNC_INTERVAL_MS,
  startSyncTriggers,
  type SyncTriggerSource,
} from "./triggers";

/**
 * Z12-41: queued logs send on their own. Each test queues a log while the
 * API is unreachable, then fires exactly one trigger and checks the outbox
 * emptied without anyone tapping "Try sending now".
 */

function harness() {
  const store = createMemorySyncStore();
  let online = false;
  const pushes: SyncMutationRequest[][] = [];
  const engine = createSyncEngine(store, {
    pushSync: async (body): Promise<SyncPushResponse> => {
      if (!online) throw new TypeError("Network request failed");
      pushes.push(body.mutations);
      return {
        results: body.mutations.map((mutation) => ({
          mutationId: mutation.mutationId,
          status: "applied" as const,
          recordId: mutation.recordId,
          serverVersion: 1,
          entityType: mutation.entityType,
          error: null,
        })),
      };
    },
    pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
  });
  const reachability = createProbeReachability({
    probe: async () => {
      if (!online) throw new TypeError("Network request failed");
    },
    retryMs: 5_000,
  });
  const appListeners = new Set<(active: boolean) => void>();
  const apiListeners = new Set<() => void>();
  let active = true;
  const attempts: SyncTriggerSource[] = [];
  const stop = startSyncTriggers({
    engine,
    reachability,
    appState: {
      isActive: () => active,
      subscribe: (listener) => {
        appListeners.add(listener);
        return () => appListeners.delete(listener);
      },
    },
    onApiSuccess: (listener) => {
      apiListeners.add(listener);
      return () => apiListeners.delete(listener);
    },
    onAttempt: (source) => attempts.push(source),
  });
  let n = 0;
  return {
    store,
    engine,
    reachability,
    pushes,
    attempts,
    stop,
    setOnline(next: boolean) {
      online = next;
    },
    setActive(next: boolean) {
      active = next;
      for (const listener of [...appListeners]) listener(next);
    },
    apiSucceeded() {
      for (const listener of [...apiListeners]) listener();
    },
    async log() {
      n += 1;
      const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      await engine.enqueue({
        mutationId: id,
        entityType: "measurement",
        recordId: id,
        operation: "measurement.create",
        expectedServerVersion: null,
        clientOccurredAt: "2026-11-15T07:05:00.000Z",
        payloadJson: JSON.stringify({ id }),
      });
    },
    waiting: async () => (await engine.getStatus()).waiting,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Let queued promise work finish without moving the clock. */
async function settle() {
  await vi.advanceTimersByTimeAsync(0);
}

describe("sync triggers", () => {
  it("start: rows left from the last launch are sent when the app opens", async () => {
    const store = createMemorySyncStore();
    await store.enqueueOutbox({
      mutationId: "00000000-0000-4000-8000-000000000001",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      entityType: "measurement",
      recordId: "00000000-0000-4000-8000-000000000001",
      operation: "measurement.create",
      expectedServerVersion: null,
      clientOccurredAt: "2026-11-15T07:05:00.000Z",
      payloadJson: "{}",
    });
    // Left "sending" by the process that was killed.
    await store.patchOutbox("00000000-0000-4000-8000-000000000001", {
      status: "in_flight",
    });
    let pushed = 0;
    const engine = createSyncEngine(store, {
      pushSync: async (body) => {
        pushed += body.mutations.length;
        return {
          results: body.mutations.map((mutation) => ({
            mutationId: mutation.mutationId,
            status: "applied" as const,
            recordId: mutation.recordId,
            serverVersion: 1,
            entityType: mutation.entityType,
            error: null,
          })),
        };
      },
      pullSync: async () => ({ changes: [], nextCursor: null, hasMore: false }),
    });
    const stop = startSyncTriggers({
      engine,
      reachability: createProbeReachability({ probe: async () => undefined }),
      appState: { isActive: () => true, subscribe: () => () => undefined },
      onApiSuccess: () => () => undefined,
    });

    await settle();

    expect(pushed).toBe(1);
    expect(await store.listOutbox()).toEqual([]);
    stop();
  });

  it("reconnect: a failed send starts the probe, and the queue goes out when the API answers", async () => {
    const h = harness();
    await h.log();
    await h.engine.sendNow();
    expect(await h.waiting()).toBe(1);

    // The 30 s timer fires an attempt, it fails, and that starts the probe.
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(h.reachability.isReachable()).toBe(false);
    h.attempts.length = 0;

    h.setOnline(true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(h.attempts).toEqual(["reconnect"]);
    expect(await h.waiting()).toBe(0);
    expect(h.pushes).toHaveLength(1);
    h.stop();
  });

  it("foreground: coming back to the app sends the queue", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    h.setActive(false);
    await settle();
    h.setOnline(true);

    h.setActive(true);
    await settle();

    expect(h.attempts).toContain("foreground");
    expect(await h.waiting()).toBe(0);
    h.stop();
  });

  it("every 30 s while the outbox is not empty", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    await settle();
    h.attempts.length = 0;

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS - 1);
    expect(h.attempts).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.attempts).toEqual(["interval"]);
    expect(await h.waiting()).toBe(1);

    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS);
    expect(h.attempts.filter((source) => source === "interval")).toHaveLength(2);
    h.stop();
  });

  it("the 30 s timer stops once the outbox is empty, and in the background", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    await settle();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    h.setOnline(true);
    await h.engine.sendNow();
    await settle();
    h.attempts.length = 0;
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
    expect(h.attempts).toEqual([]);

    h.setOnline(false);
    await h.log();
    await h.engine.sendNow();
    await settle();
    h.setActive(false);
    await settle();
    h.attempts.length = 0;
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 3);
    expect(h.attempts).toEqual([]);
    h.stop();
  });

  it("after any successful API call: the API is reachable, so the queue goes out", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    await settle();
    h.setOnline(true);
    h.attempts.length = 0;

    await vi.advanceTimersByTimeAsync(2_500);
    h.apiSucceeded();
    await settle();

    // The call also tells reachability the API is back, so the one attempt
    // may be labelled either way; what matters is that the queue went out.
    expect(h.attempts).toHaveLength(1);
    expect(await h.waiting()).toBe(0);
    h.stop();
  });

  it("a burst of successful calls makes one attempt, not one each", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    await settle();
    await vi.advanceTimersByTimeAsync(2_500);
    h.attempts.length = 0;

    for (let i = 0; i < 6; i += 1) h.apiSucceeded();
    await settle();
    h.apiSucceeded();
    await settle();

    expect(h.attempts).toHaveLength(1);
    // The requests inside the gap are not lost: one more attempt follows it.
    await vi.advanceTimersByTimeAsync(2_000);
    expect(h.attempts).toHaveLength(2);
    h.stop();
  });

  it("does nothing while nothing is waiting", async () => {
    const h = harness();
    await settle();
    h.setOnline(true);

    h.apiSucceeded();
    h.setActive(false);
    h.setActive(true);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);

    expect(h.attempts).toEqual([]);
    expect(h.pushes).toEqual([]);
    h.stop();
  });

  it("stops every trigger when torn down", async () => {
    const h = harness();
    await settle();
    await h.log();
    await h.engine.sendNow();
    await settle();
    h.stop();
    h.setOnline(true);
    h.attempts.length = 0;

    h.apiSucceeded();
    h.setActive(true);
    await vi.advanceTimersByTimeAsync(SYNC_INTERVAL_MS * 2);

    expect(h.attempts).toEqual([]);
    expect(await h.waiting()).toBe(1);
    h.reachability.dispose();
  });
});

describe("probe reachability (the seam Z12-57 swaps for NetInfo)", () => {
  it("is unknown until something is observed", () => {
    const r = createProbeReachability({ probe: async () => undefined });
    expect(r.isReachable()).toBeNull();
  });

  it("probes with a growing gap while unreachable and reports the change once", async () => {
    let online = false;
    let probes = 0;
    const r = createProbeReachability({
      probe: async () => {
        probes += 1;
        if (!online) throw new Error("no route");
      },
      retryMs: 5_000,
      maxRetryMs: 20_000,
    });
    const seen: boolean[] = [];
    r.subscribe((reachable) => seen.push(reachable));

    expect(await r.check()).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(probes).toBe(3);
    online = true;
    await vi.advanceTimersByTimeAsync(20_000);

    expect(seen).toEqual([false, true]);
    expect(r.isReachable()).toBe(true);
    // Reachable: no more probes.
    const settled = probes;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(probes).toBe(settled);
    r.dispose();
  });

  it("one failed request is a hint: the probe decides", async () => {
    const r = createProbeReachability({ probe: async () => undefined });
    r.report(false);
    await settle();
    expect(r.isReachable()).toBe(true);
    r.dispose();
  });

  it("does not probe in the background and asks again on return", async () => {
    let probes = 0;
    const r = createProbeReachability({
      probe: async () => {
        probes += 1;
        throw new Error("no route");
      },
      retryMs: 5_000,
    });
    await r.check();
    r.setForeground(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(probes).toBe(1);

    r.setForeground(true);
    await settle();
    expect(probes).toBe(2);
    r.dispose();
  });

  it("the browser's offline and online events feed it on web", async () => {
    const handlers = new Map<string, () => void>();
    let online = true;
    const r = createProbeReachability({
      probe: async () => {
        if (!online) throw new Error("no route");
      },
      browser: {
        addEventListener: (type, fn) => handlers.set(type, fn),
        removeEventListener: (type) => handlers.delete(type),
      },
    });
    online = false;
    handlers.get("offline")!();
    expect(r.isReachable()).toBe(false);

    online = true;
    handlers.get("online")!();
    await settle();
    expect(r.isReachable()).toBe(true);
    r.dispose();
    expect(handlers.size).toBe(0);
  });
});
