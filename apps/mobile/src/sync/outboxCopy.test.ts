import { describe, expect, it, vi } from "vitest";

// The kept-rows store lives in the Live Activity drain, which imports
// react-native; the vitest env is node, so stub what that import needs.
vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
}));
import {
  createKeptRowsBinding,
  describeOutboxEntry,
  indicatorFromCounts,
} from "./outboxCopy";
import {
  keptLiveActivityRowsCopy,
  liveActivityKeptRows,
} from "../notifications/liveActivityOutbox";

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

describe("kept lock-screen rows binding", () => {
  function store() {
    let count = 0;
    const listeners = new Set<(next: number) => void>();
    return {
      copy: () => keptLiveActivityRowsCopy(count),
      subscribe(listener: (next: number) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(next: number) {
        count = next;
        for (const listener of listeners) listener(count);
      },
    };
  }

  it("shows nothing when no row was kept", () => {
    expect(createKeptRowsBinding(store()).snapshot()).toBeNull();
  });

  it("reports the kept sets once a drain keeps some", () => {
    const source = store();
    const binding = createKeptRowsBinding(source);
    source.set(1);
    expect(binding.snapshot()).toBe(
      "1 set logged on your lock screen · open the workout to save it",
    );
    source.set(3);
    expect(binding.snapshot()).toBe(
      "3 sets logged on your lock screen · open the workout to save them",
    );
  });

  it("reads the store on every snapshot, never a copy taken at bind time", () => {
    const source = store();
    source.set(2);
    const binding = createKeptRowsBinding(source);
    const before = binding.snapshot();
    source.set(0);
    expect(before).not.toBeNull();
    expect(binding.snapshot()).toBeNull();
  });

  it("notifies the screen on every change and stops after unsubscribe", () => {
    const source = store();
    const binding = createKeptRowsBinding(source);
    let changes = 0;
    const unsubscribe = binding.subscribe(() => {
      changes += 1;
    });
    source.set(1);
    source.set(0);
    expect(changes).toBe(2);
    unsubscribe();
    source.set(4);
    expect(changes).toBe(2);
  });

  it("binds the live store the drain writes to", () => {
    const binding = createKeptRowsBinding(liveActivityKeptRows);
    liveActivityKeptRows.set(0);
    expect(binding.snapshot()).toBeNull();
    liveActivityKeptRows.set(2);
    expect(binding.snapshot()).toBe(
      "2 sets logged on your lock screen · open the workout to save them",
    );
    liveActivityKeptRows.set(0);
    expect(binding.snapshot()).toBeNull();
  });

  it("keeps the notice free of raw ids, percentages and ISO dates", () => {
    liveActivityKeptRows.set(5);
    const line = createKeptRowsBinding(liveActivityKeptRows).snapshot() ?? "";
    liveActivityKeptRows.set(0);
    expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(line).not.toMatch(/[0-9a-f]{8}-/i);
    expect(line).not.toMatch(/%/);
    expect(line).not.toMatch(/[a-z]+_[a-z]+/);
  });
});
