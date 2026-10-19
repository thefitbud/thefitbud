import { describe, expect, it } from "vitest";
import { describeOutboxEntry, indicatorFromCounts } from "./outboxCopy";

describe("outbox copy", () => {
  it("describes a meal confirm as a sentence", () => {
    const line = describeOutboxEntry({
      operation: "meal.confirm",
      payloadJson: JSON.stringify({ mealName: "Lunch" }),
      clientOccurredAt: "2026-10-19T08:22:00.000Z",
      lastError: null,
      status: "pending",
    });
    expect(line.startsWith("Lunch · Eaten as planned ·")).toBe(true);
    expect(line).not.toMatch(/meal\.confirm/);
    expect(line).not.toMatch(/[0-9a-f]{8}-/);
  });

  it("hides raw operations", () => {
    const line = describeOutboxEntry({
      operation: "workout.start",
      payloadJson: "{}",
      clientOccurredAt: "2026-10-19T08:22:00.000Z",
      lastError: "already has a finished execution",
      status: "rejected",
    });
    expect(line.startsWith("Workout started")).toBe(true);
    expect(line).not.toContain("workout.start");
  });

  it("exposes four indicator states", () => {
    const now = 1_000_000;
    expect(
      indicatorFromCounts({
        pending: 0,
        inFlight: 0,
        failed: 0,
        offline: false,
        syncedAt: now - 500,
        now,
      }).kind,
    ).toBe("synced");
    expect(
      indicatorFromCounts({
        pending: 0,
        inFlight: 1,
        failed: 0,
        offline: false,
        syncedAt: null,
        now,
      }).kind,
    ).toBe("syncing");
    expect(
      indicatorFromCounts({
        pending: 2,
        inFlight: 0,
        failed: 0,
        offline: false,
        syncedAt: null,
        now,
      }).kind,
    ).toBe("waiting");
    expect(
      indicatorFromCounts({
        pending: 0,
        inFlight: 0,
        failed: 1,
        offline: false,
        syncedAt: null,
        now,
      }).kind,
    ).toBe("problem");
  });
});
