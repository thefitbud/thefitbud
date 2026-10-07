import type { SyncEntityType, SyncMutationOperation } from "@fitbud/contracts";

/**
 * Per-entity conflict rules for trainee offline sync.
 * There is no silent universal last-write-wins policy.
 *
 * | Entity | Rule |
 * | --- | --- |
 * | effective_plan | Pull-only. Published/effective plan versions are immutable; sync never edits them. |
 * | workout_assignment | Pull-only for trainees. Missed is server-derived, never client-written. |
 * | workout_execution | Transition validation + optional expectedVersion. Stale version → conflicted. Duplicate idempotent retries → already_applied. |
 * | meal_assignment | Pull-only. Derived Pending/Logged Later/Overdue are never client-written. |
 * | meal_compliance | Single-state transition. Idempotent key reuse returns already_applied. A different terminal outcome for the same assignment is rejected (not overwritten). |
 * | checkin (draft) | Optimistic concurrency via expectedVersion. Stale draft → conflicted for explicit resolution. |
 * | checkin (submit) | Idempotent submit. Submitted answers are not silently replaced. |
 * | measurement | Append-style. Client-generated UUIDs coexist; duplicates by id/idempotency return already_applied. No LWW merge of values. |
 */
export const SYNC_CONFLICT_RULES: Record<
  SyncEntityType,
  {
    mode:
      | "pull_only"
      | "transition_idempotent"
      | "optimistic_draft"
      | "append_coexist";
    summary: string;
  }
> = {
  effective_plan: {
    mode: "pull_only",
    summary:
      "Published/effective plan versions are immutable; sync never edits them.",
  },
  workout_assignment: {
    mode: "pull_only",
    summary:
      "Assignments are server-generated; Missed is derived and never client-written.",
  },
  workout_execution: {
    mode: "transition_idempotent",
    summary:
      "Lifecycle transitions with optional expectedVersion; stale versions conflict; retries reuse idempotency keys.",
  },
  meal_assignment: {
    mode: "pull_only",
    summary:
      "Assignments are server-generated; derived meal states are never client-written.",
  },
  meal_compliance: {
    mode: "transition_idempotent",
    summary:
      "Confirm/deviate/skip are single-state actions; duplicates are idempotent; conflicting outcomes are rejected.",
  },
  checkin: {
    mode: "optimistic_draft",
    summary:
      "Drafts use expectedVersion conflicts; submit is idempotent and does not silently replace submitted answers.",
  },
  measurement: {
    mode: "append_coexist",
    summary:
      "Independent measurements coexist under stable client UUIDs; values are never last-write-wins merged.",
  },
};

export type OutboxMutationStatus =
  | "pending"
  | "in_flight"
  | "acked"
  | "rejected"
  | "conflicted";

/** Operations that may be enqueued in the trainee outbox. */
export const OFFLINE_MUTATION_OPERATIONS: readonly SyncMutationOperation[] = [
  "workout.start",
  "workout.pause",
  "workout.resume",
  "workout.complete_set",
  "workout.complete",
  "workout.skip",
  "meal.confirm",
  "meal.deviate",
  "meal.skip",
  "checkin.save_draft",
  "checkin.submit",
  "measurement.create",
] as const;

/**
 * Cursor advances only after the client has applied every change represented
 * by the pull response. Passing a cursor without applying those changes risks
 * skipping authoritative state.
 */
export function shouldAdvanceSyncCursor(input: {
  appliedAllChanges: boolean;
  pullHasChanges: boolean;
}): boolean {
  if (!input.pullHasChanges) {
    return true;
  }
  return input.appliedAllChanges;
}

/**
 * Duplicate delivery of the same mutationId + idempotencyKey must not create
 * a second side effect. Treat matching fingerprints as already applied.
 */
export function isDuplicateMutationDelivery(input: {
  existingMutationId: string | null;
  incomingMutationId: string;
  existingIdempotencyKey: string | null;
  incomingIdempotencyKey: string;
}): boolean {
  if (
    input.existingMutationId !== null &&
    input.existingMutationId === input.incomingMutationId
  ) {
    return true;
  }
  return (
    input.existingIdempotencyKey !== null &&
    input.existingIdempotencyKey === input.incomingIdempotencyKey
  );
}

export function conflictRuleForEntity(entityType: SyncEntityType) {
  return SYNC_CONFLICT_RULES[entityType];
}
