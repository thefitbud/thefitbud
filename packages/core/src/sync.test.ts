import { describe, expect, it } from "vitest";
import {
  SYNC_CONFLICT_RULES,
  conflictRuleForEntity,
  isDuplicateMutationDelivery,
  shouldAdvanceSyncCursor,
} from "./sync.js";

describe("sync conflict rules", () => {
  it("marks effective plans as pull-only and immutable", () => {
    expect(conflictRuleForEntity("effective_plan").mode).toBe("pull_only");
    expect(SYNC_CONFLICT_RULES.effective_plan.summary).toMatch(/immutable/i);
  });

  it("treats measurements as append-style coexistence", () => {
    expect(conflictRuleForEntity("measurement").mode).toBe("append_coexist");
  });

  it("uses optimistic draft concurrency for check-ins", () => {
    expect(conflictRuleForEntity("checkin").mode).toBe("optimistic_draft");
  });

  it("advances cursor only after local apply", () => {
    expect(
      shouldAdvanceSyncCursor({
        appliedAllChanges: true,
        pullHasChanges: true,
      }),
    ).toBe(true);
    expect(
      shouldAdvanceSyncCursor({
        appliedAllChanges: false,
        pullHasChanges: true,
      }),
    ).toBe(false);
  });

  it("detects duplicate mutation delivery by id or idempotency key", () => {
    expect(
      isDuplicateMutationDelivery({
        existingMutationId: "m1",
        incomingMutationId: "m1",
        existingIdempotencyKey: "k1",
        incomingIdempotencyKey: "k1",
      }),
    ).toBe(true);
    expect(
      isDuplicateMutationDelivery({
        existingMutationId: "m1",
        incomingMutationId: "m2",
        existingIdempotencyKey: "k1",
        incomingIdempotencyKey: "k1",
      }),
    ).toBe(true);
    expect(
      isDuplicateMutationDelivery({
        existingMutationId: "m1",
        incomingMutationId: "m2",
        existingIdempotencyKey: "k1",
        incomingIdempotencyKey: "k2",
      }),
    ).toBe(false);
  });
});
