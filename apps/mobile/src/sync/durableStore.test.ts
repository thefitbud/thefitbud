import { describe, expect, it } from "vitest";
import { createDurableSyncStore, type SyncStorage } from "./durableStore";

function memoryStorage(): SyncStorage {
  const bag = new Map<string, string>();
  return {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => {
      bag.set(key, value);
    },
  };
}

describe("durable sync store", () => {
  it("keeps an unsent meal log after a new store is opened", async () => {
    const storage = memoryStorage();
    const first = createDurableSyncStore(storage, "test");
    await first.enqueueOutbox({
      mutationId: "m1",
      idempotencyKey: "k1",
      entityType: "meal_compliance",
      recordId: "meal-1",
      operation: "meal.confirm",
      expectedServerVersion: null,
      clientOccurredAt: "2026-10-15T08:22:00.000Z",
      payloadJson: JSON.stringify({ mealName: "Lunch" }),
    });
    const second = createDurableSyncStore(storage, "test");
    const rows = await second.listOutbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.operation).toBe("meal.confirm");
    expect(rows[0]?.status).toBe("pending");
  });
});
