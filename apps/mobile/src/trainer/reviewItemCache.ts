import type {
  ExceptionDetail,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "@fitbud/api-client";
import {
  TRAINER_STALE_MS,
  readTrainerSession,
  trainerCacheEpoch,
  writeTrainerSession,
} from "./cache";

/**
 * Z14-3: one review item as the review sheet and the exception screen show it:
 * the exception and, for a workout or meal item, its source assignment.
 * Kept for the session (owner-scoped, cleared on sign-out) by exception id, so
 * stepping back to a seen item, or on to a prefetched one, makes no request.
 */
export type ReviewItemBundle = {
  detail: ExceptionDetail;
  workout: WorkoutAssignment | null;
  meal: MealAssignment | null;
};

type Stored = { bundle: ReviewItemBundle; at: number };

const keyFor = (exceptionId: string) => `review-item:${exceptionId}`;

const inflight = new Map<string, Promise<ReviewItemBundle | null>>();

/** The kept item, and whether it is old enough to refresh underneath. */
export function readReviewItem(
  exceptionId: string,
): { bundle: ReviewItemBundle; stale: boolean } | null {
  const stored = readTrainerSession<Stored>(keyFor(exceptionId));
  if (!stored) return null;
  return {
    bundle: stored.bundle,
    stale: Date.now() - stored.at > TRAINER_STALE_MS,
  };
}

/** Forget an item (after the trainer changes it, so the next read is fresh). */
export function dropReviewItem(exceptionId: string): void {
  inflight.delete(exceptionId);
  const epoch = trainerCacheEpoch();
  // A session value cannot be removed; overwrite it with an already-stale one.
  const stored = readTrainerSession<Stored>(keyFor(exceptionId));
  if (stored) {
    writeTrainerSession(keyFor(exceptionId), { ...stored, at: 0 }, epoch);
  }
}

/**
 * Load an item: the exception, then its source assignment. `onDetail` runs as
 * soon as the exception is in, so the card can paint before the assignment
 * (which adds the Planned row) arrives. A failed exception read resolves to
 * `null` and is not kept; a failed assignment read just leaves it out.
 * Concurrent calls for one id share one request.
 */
export function loadReviewItem(
  api: FitBudApiClient,
  exceptionId: string,
  onDetail?: (detail: ExceptionDetail) => void,
): Promise<ReviewItemBundle | null> {
  const running = inflight.get(exceptionId);
  if (running) {
    return running;
  }
  const epoch = trainerCacheEpoch();
  const promise = (async (): Promise<ReviewItemBundle | null> => {
    let detail: ExceptionDetail;
    try {
      detail = await api.getException(exceptionId);
    } catch {
      return null;
    }
    onDetail?.(detail);
    let workout: WorkoutAssignment | null = null;
    let meal: MealAssignment | null = null;
    try {
      if (detail.sourceEntityType === "workout_assignment") {
        workout = await api.getWorkoutAssignment(detail.sourceEntityId);
      } else if (detail.sourceEntityType === "meal_assignment") {
        meal = await api.getMealAssignment(detail.sourceEntityId);
      }
    } catch {
      // The Planned row is context: the item shows without it.
    }
    const bundle: ReviewItemBundle = { detail, workout, meal };
    writeTrainerSession(
      keyFor(exceptionId),
      { bundle, at: Date.now() } satisfies Stored,
      epoch,
    );
    return bundle;
  })().finally(() => {
    inflight.delete(exceptionId);
  });
  inflight.set(exceptionId, promise);
  return promise;
}

/** Keep an item a screen loaded itself, so the review sheet can show it too. */
export function storeReviewItem(bundle: ReviewItemBundle, startedAt: number): void {
  writeTrainerSession(
    keyFor(bundle.detail.id),
    { bundle, at: Date.now() } satisfies Stored,
    startedAt,
  );
}

/** Start loading an item nobody is looking at yet; a kept fresh one is left. */
export function prefetchReviewItem(
  api: FitBudApiClient,
  exceptionId: string,
): void {
  const kept = readReviewItem(exceptionId);
  if (kept && !kept.stale) return;
  void loadReviewItem(api, exceptionId);
}
