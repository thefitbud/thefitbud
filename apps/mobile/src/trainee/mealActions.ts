import type { FitBudApiClient } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";
import { invalidateRelationshipDayData, messageFromSyncResults } from "./dataCache";

export class MealSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealSyncError";
  }
}

export async function uploadMealPhoto(
  api: FitBudApiClient,
  relationshipId: string,
  assignment: MealAssignment,
): Promise<string> {
  const target = await api.createUploadTarget(
    {
      coachingRelationshipId: relationshipId,
      mediaType: "meal_photo",
      contentType: MINIMAL_PNG_CONTENT_TYPE,
      originalFilename: `meal-${assignment.id}.png`,
    },
    createIdempotencyKey(),
  );
  await api.uploadMediaContent(
    target.mediaAsset.id,
    minimalPngBytes(),
    MINIMAL_PNG_CONTENT_TYPE,
  );
  return target.mediaAsset.id;
}

function assertSyncOk(
  results: Awaited<ReturnType<typeof enqueueAndPush>>["results"],
  coachName?: string,
) {
  const message = messageFromSyncResults(results, coachName);
  if (message) throw new MealSyncError(message);
}

function afterMealMutation(relationshipId: string) {
  invalidateRelationshipDayData(relationshipId);
}

export async function confirmMealAssignment(
  _api: FitBudApiClient,
  sync: SyncEngine,
  relationshipId: string,
  assignment: MealAssignment,
  coachName?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.confirm",
    payload: {
      assignmentId: assignment.id,
      body: { photoIntent: null },
    },
  });
  assertSyncOk(results, coachName);
  afterMealMutation(relationshipId);
}

/** Best-effort meal photo upload after logging (does not block confirm). */
export async function attachMealPhotoBestEffort(
  api: FitBudApiClient,
  relationshipId: string,
  assignment: MealAssignment,
): Promise<void> {
  try {
    await uploadMealPhoto(api, relationshipId, assignment);
  } catch {
    // Photo is optional post-log; ignore upload failures.
  }
}

export async function skipMealAssignment(
  sync: SyncEngine,
  assignment: MealAssignment,
  notes?: string | null,
  coachName?: string,
  relationshipId?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.skip",
    payload: {
      assignmentId: assignment.id,
      body: { notes: notes ?? null },
    },
  });
  assertSyncOk(results, coachName);
  if (relationshipId) afterMealMutation(relationshipId);
}

export async function deviateMealAssignment(
  sync: SyncEngine,
  assignment: MealAssignment,
  body: Record<string, unknown>,
  coachName?: string,
  relationshipId?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.deviate",
    payload: {
      assignmentId: assignment.id,
      body,
    },
  });
  assertSyncOk(results, coachName);
  if (relationshipId) afterMealMutation(relationshipId);
}
