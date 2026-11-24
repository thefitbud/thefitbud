import { beforeEach, describe, expect, it } from "vitest";
import type { SyncMutationRequest, SyncMutationResult } from "@fitbud/contracts";
import { enqueueAndPush } from "./actions";
import { createDurableSyncStore } from "./durableStore";
import { createSyncEngine, type SyncApi } from "./engine";
import { createMemoryKeyValue } from "./storage";
import { syncPrefixFor } from "./userStore";
import { createSnapshotStore } from "../trainee/snapshotStore";
import { buildOutboxOverlay } from "../trainee/today/queuedLogs";

/**
 * Airplane-mode cases (AGENTS.md "Offline (mobile)", Z14-2): create offline,
 * kill and restart, reconnect, retry, duplicate delivery. Real engine, real
 * durable store and snapshot store over one device storage map (what
 * survives a kill), and a fake server that applies each idempotency key once.
 */

const USER = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const MEAL = "00000000-0000-4000-8000-0000000000b1";
const DAY_KEY = "dayview:today:00000000-0000-4000-8000-0000000000a1:2026-11-24";

type Mode = "offline" | "online" | "lose-answer";

function fakeServer() {
  let mode: Mode = "offline";
  const applied = new Map<string, SyncMutationRequest>();
  const requests: SyncMutationRequest[][] = [];
  const api: SyncApi = {
    async pushSync(body) {
      requests.push(body.mutations);
      if (mode === "offline") throw new TypeError("Network request failed");
      const results: SyncMutationResult[] = body.mutations.map((mutation) => {
        const seen = applied.has(mutation.idempotencyKey);
        if (!seen) applied.set(mutation.idempotencyKey, mutation);
        return {
          mutationId: mutation.mutationId,
          status: seen ? ("already_applied" as const) : ("applied" as const),
          recordId: mutation.recordId,
          serverVersion: 2,
          entityType: mutation.entityType,
          error: null,
        };
      });
      // Applied on the server, but the answer never reaches the phone.
      if (mode === "lose-answer") throw new TypeError("Network request failed");
      return { results };
    },
    async pullSync() {
      if (mode === "offline") throw new TypeError("Network request failed");
      return { changes: [], nextCursor: null, hasMore: false };
    },
  };
  return {
    api,
    applied,
    requests,
    setMode: (next: Mode) => {
      mode = next;
    },
  };
}

/** One app process over the device storage `map`. */
function launch(map: Map<string, string>, server: ReturnType<typeof fakeServer>) {
  const storage = createMemoryKeyValue(map);
  const store = createDurableSyncStore({
    storage,
    prefix: syncPrefixFor(USER),
    capacity: "full",
  });
  const engine = createSyncEngine(store, server.api);
  const snapshots = createSnapshotStore({ storage, userId: USER, writeDelayMs: 0 });
  return { engine, snapshots };
}

let map: Map<string, string>;
let server: ReturnType<typeof fakeServer>;

beforeEach(() => {
  map = new Map();
  server = fakeServer();
});

describe("airplane mode (Z14-2)", () => {
  it("create offline → kill → restart offline → reconnect → retry → duplicate delivery", async () => {
    // First launch, online once: the day is read and kept on the phone.
    server.setMode("online");
    const first = launch(map, server);
    first.snapshots.write(DAY_KEY, { meals: [{ id: MEAL, status: "pending" }] }, Date.now());
    await first.snapshots.flush();

    // Airplane mode: a meal eaten as planned returns at once and is saved.
    server.setMode("offline");
    const logged = await enqueueAndPush(first.engine, {
      recordId: MEAL,
      operation: "meal.confirm",
      payload: { assignmentId: MEAL, mealName: "Lunch", body: { photoIntent: null } },
    });
    expect(logged.results).toEqual([]);
    expect(await logged.pushed).toEqual([]);
    const [waiting] = await first.engine.store.listOutbox();
    expect(waiting).toMatchObject({ status: "pending", lastErrorCode: "UNREACHABLE" });

    // Kill and restart, still in airplane mode: the log and the day are both
    // on the phone, and the overlay shows the meal logged on the saved day.
    const second = launch(map, server);
    await second.engine.recoverAfterRestart();
    const rows = await second.engine.store.listOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mutationId).toBe(logged.mutationId);
    expect(rows[0]!.status).toBe("pending");
    const [day] = await second.snapshots.hydrate();
    expect(day!.key).toBe(DAY_KEY);
    const overlay = buildOutboxOverlay(rows, { offline: true });
    expect(overlay.meals.get(MEAL)).toMatchObject({ status: "confirmed", waiting: true });

    // Reconnect, but the first answer is lost after the server applied it.
    server.setMode("lose-answer");
    await second.engine.sendNow();
    expect(server.applied.size).toBe(1);
    expect(await second.engine.store.listOutbox()).toHaveLength(1);

    // Retry: the same mutation id and idempotency key, never a new action;
    // the server's duplicate answer clears the row and applies nothing twice.
    server.setMode("online");
    const outcome = await second.engine.sendNow();
    expect(outcome.sent).toBe(1);
    expect(await second.engine.store.listOutbox()).toEqual([]);
    expect(server.applied.size).toBe(1);
    const ids = new Set(server.requests.flat().map((request) => request.mutationId));
    const keys = new Set(server.requests.flat().map((request) => request.idempotencyKey));
    expect([...ids]).toEqual([logged.mutationId]);
    expect([...keys]).toEqual([logged.idempotencyKey]);

    // Duplicate delivery of the same row (a trigger racing a retry) is
    // answered "already applied" and changes nothing.
    await second.engine.sendNow();
    expect(server.applied.size).toBe(1);

    // And after a third launch nothing is left to send.
    const third = launch(map, server);
    expect(await third.engine.store.listOutbox()).toEqual([]);
  });

  it("the same logical action enqueued twice is one row", async () => {
    const app = launch(map, server);
    const id = "00000000-0000-4000-8000-0000000000c1";
    await enqueueAndPush(app.engine, {
      mutationId: id,
      recordId: MEAL,
      operation: "meal.skip",
      payload: { assignmentId: MEAL, body: { notes: null } },
    });
    await enqueueAndPush(app.engine, {
      mutationId: id,
      recordId: MEAL,
      operation: "meal.skip",
      payload: { assignmentId: MEAL, body: { notes: null } },
    });
    expect(await app.engine.store.listOutbox()).toHaveLength(1);
  });
});
