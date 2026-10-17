import type { FitBudApiClient } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import {
  MINIMAL_PNG_CONTENT_TYPE,
  minimalPngBytes,
} from "../lib/minimalPng";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";

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

export async function confirmMealAssignment(
  api: FitBudApiClient,
  sync: SyncEngine,
  relationshipId: string,
  assignment: MealAssignment,
): Promise<void> {
  const photoIntent = assignment.photoRequired
    ? {
        notedAt: new Date().toISOString(),
        mediaAssetId: await uploadMealPhoto(api, relationshipId, assignment),
        contentType: MINIMAL_PNG_CONTENT_TYPE,
        clientRef: `meal-photo-${assignment.id}`,
      }
    : null;
  await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.confirm",
    payload: {
      assignmentId: assignment.id,
      body: { photoIntent },
    },
  });
}

export async function skipMealAssignment(
  sync: SyncEngine,
  assignment: MealAssignment,
  notes?: string | null,
): Promise<void> {
  await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.skip",
    payload: {
      assignmentId: assignment.id,
      body: { notes: notes ?? null },
    },
  });
}
