import { and, eq, or } from "drizzle-orm";
import { Hono } from "hono";
import {
  createOnboardingReviewRequestSchema,
  createOnboardingReviewResponseSchema,
  onboardingFieldDefinitionSchema,
  onboardingFormResponseSchema,
  onboardingFormVersionSchema,
  saveOnboardingDraftRequestSchema,
  submitOnboardingRequestSchema,
} from "@fitbud/contracts";
import {
  canMarkCoachingReady,
  canSaveOnboardingDraft,
  canSubmitOnboarding,
  missingRequiredOnboardingFields,
  resolveOnboardingForm,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  onboardingFormResponses,
  onboardingFormVersions,
  onboardingReviews,
} from "../db/schema";
import { onboardingStatusForRelationship } from "../domain/client-status";
import {
  mapOnboardingFormResponse,
  mapOnboardingFormVersion,
  mapOnboardingReview,
  mapRelationship,
} from "../domain/mappers";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { canAccessRelationship } from "./relationships";
import type { Env, Variables } from "../types";

const SUBMIT_OPERATION = "onboarding.submit";
const REVIEW_OPERATION = "onboarding.review";

export const onboardingRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function resolveFormForTrainer(db: Db, trainerUserId: string) {
  const rows = await db
    .select()
    .from(onboardingFormVersions)
    .where(
      or(
        eq(onboardingFormVersions.scope, "global"),
        and(
          eq(onboardingFormVersions.scope, "trainer"),
          eq(onboardingFormVersions.trainerUserId, trainerUserId),
        ),
      ),
    );
  return resolveOnboardingForm(rows, trainerUserId);
}

onboardingRoutes.get(
  "/forms/current",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationshipId = c.req.query("relationshipId")?.trim();
    let trainerUserId = actor.selectedRole === "trainer" ? actor.userId : null;

    if (relationshipId) {
      const relationships = await db
        .select()
        .from(coachingRelationships)
        .where(eq(coachingRelationships.id, relationshipId))
        .limit(1);
      const relationship = relationships[0];
      if (!relationship || !canAccessRelationship(actor, relationship)) {
        return fail(
          c,
          404,
          "RELATIONSHIP_NOT_FOUND",
          "Coaching relationship not found.",
        );
      }
      trainerUserId = relationship.trainerUserId;

      const responses = await db
        .select()
        .from(onboardingFormResponses)
        .where(eq(onboardingFormResponses.coachingRelationshipId, relationshipId))
        .limit(1);
      const response = responses[0];
      if (response) {
        const pinned = await db
          .select()
          .from(onboardingFormVersions)
          .where(eq(onboardingFormVersions.id, response.onboardingFormVersionId))
          .limit(1);
        const form = pinned[0];
        if (!form) {
          return fail(
            c,
            500,
            "ONBOARDING_FORM_MISSING",
            "Onboarding form for this response is missing.",
          );
        }
        return ok(
          c,
          onboardingFormVersionSchema.parse(mapOnboardingFormVersion(form)),
        );
      }
    }

    if (!trainerUserId) {
      const relationships = await db
        .select()
        .from(coachingRelationships)
        .where(eq(coachingRelationships.traineeUserId, actor.userId));
      const only = relationships.length === 1 ? relationships[0] : null;
      if (only) {
        trainerUserId = only.trainerUserId;
        const responses = await db
          .select()
          .from(onboardingFormResponses)
          .where(eq(onboardingFormResponses.coachingRelationshipId, only.id))
          .limit(1);
        const response = responses[0];
        if (response) {
          const pinned = await db
            .select()
            .from(onboardingFormVersions)
            .where(eq(onboardingFormVersions.id, response.onboardingFormVersionId))
            .limit(1);
          const form = pinned[0];
          if (form) {
            return ok(
              c,
              onboardingFormVersionSchema.parse(mapOnboardingFormVersion(form)),
            );
          }
        }
      }
    }

    if (!trainerUserId) {
      return fail(
        c,
        400,
        "RELATIONSHIP_REQUIRED",
        "Pass relationshipId to resolve the trainee onboarding form.",
      );
    }

    const form = await resolveFormForTrainer(db, trainerUserId);
    if (!form) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "No onboarding form is available.",
      );
    }
    return ok(c, onboardingFormVersionSchema.parse(mapOnboardingFormVersion(form)));
  },
);

onboardingRoutes.get(
  "/relationships/:relationshipId",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || !canAccessRelationship(actor, relationship)) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }

    const responses = await db
      .select()
      .from(onboardingFormResponses)
      .where(eq(onboardingFormResponses.coachingRelationshipId, relationshipId))
      .limit(1);
    const response = responses[0];
    if (!response) {
      return fail(c, 404, "ONBOARDING_NOT_FOUND", "Onboarding response not found.");
    }

    return ok(
      c,
      onboardingFormResponseSchema.parse(mapOnboardingFormResponse(response)),
    );
  },
);

onboardingRoutes.put(
  "/relationships/:relationshipId/draft",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = saveOnboardingDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid onboarding draft request.", {
        issues: parsed.error.issues,
      });
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }

    const onboardingStatus = await onboardingStatusForRelationship(db, relationship);
    if (!canSaveOnboardingDraft(onboardingStatus)) {
      return fail(
        c,
        409,
        "ONBOARDING_NOT_EDITABLE",
        "Submitted onboarding cannot be overwritten.",
        { onboardingStatus },
      );
    }

    const timestamp = nowIso();
    const existingRows = await db
      .select()
      .from(onboardingFormResponses)
      .where(eq(onboardingFormResponses.coachingRelationshipId, relationshipId))
      .limit(1);
    const existing = existingRows[0];

    if (existing) {
      if (existing.status === "submitted") {
        return fail(
          c,
          409,
          "ONBOARDING_ALREADY_SUBMITTED",
          "Submitted onboarding cannot be overwritten.",
        );
      }
      if (existing.version !== parsed.data.expectedVersion) {
        return fail(
          c,
          409,
          "ONBOARDING_VERSION_CONFLICT",
          "Onboarding draft was changed after this version was loaded.",
          {
            expectedVersion: parsed.data.expectedVersion,
            currentVersion: existing.version,
          },
        );
      }

      await db
        .update(onboardingFormResponses)
        .set({
          answersJson: JSON.stringify(parsed.data.answers),
          version: existing.version + 1,
          updatedAt: timestamp,
        })
        .where(eq(onboardingFormResponses.id, existing.id));

      const updated = (
        await db
          .select()
          .from(onboardingFormResponses)
          .where(eq(onboardingFormResponses.id, existing.id))
          .limit(1)
      )[0]!;
      return ok(
        c,
        onboardingFormResponseSchema.parse(mapOnboardingFormResponse(updated)),
      );
    }

    const form = await resolveFormForTrainer(db, relationship.trainerUserId);
    if (!form) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "No onboarding form is available.",
      );
    }

    if (parsed.data.expectedVersion !== 0) {
      return fail(
        c,
        409,
        "ONBOARDING_VERSION_CONFLICT",
        "Onboarding draft was changed after this version was loaded.",
        { expectedVersion: parsed.data.expectedVersion, currentVersion: 0 },
      );
    }

    const responseId = createId();
    await db.insert(onboardingFormResponses).values({
      id: responseId,
      coachingRelationshipId: relationshipId,
      onboardingFormVersionId: form.id,
      traineeUserId: actor.userId,
      status: "draft",
      answersJson: JSON.stringify(parsed.data.answers),
      version: 1,
      submittedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const created = (
      await db
        .select()
        .from(onboardingFormResponses)
        .where(eq(onboardingFormResponses.id, responseId))
        .limit(1)
    )[0]!;
    return ok(
      c,
      onboardingFormResponseSchema.parse(mapOnboardingFormResponse(created)),
      201,
    );
  },
);

onboardingRoutes.post(
  "/relationships/:relationshipId/submit",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = submitOnboardingRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid onboarding submit request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to submit onboarding.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const fingerprint = await sha256Hex(
      JSON.stringify({
        relationshipId,
        expectedVersion: parsed.data.expectedVersion,
      }),
    );

    const db = createDb(c.env.DB);
    const existingIdempotency = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SUBMIT_OPERATION,
      idempotencyKey,
    });
    if (existingIdempotency) {
      if (existingIdempotency.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(existingIdempotency.responseBody),
        existingIdempotency.responseStatus as 200,
      );
    }

    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }

    const responses = await db
      .select()
      .from(onboardingFormResponses)
      .where(eq(onboardingFormResponses.coachingRelationshipId, relationshipId))
      .limit(1);
    const response = responses[0];
    if (!response) {
      return fail(c, 404, "ONBOARDING_NOT_FOUND", "Onboarding draft not found.");
    }

    if (response.status === "submitted") {
      const data = onboardingFormResponseSchema.parse(
        mapOnboardingFormResponse(response),
      );
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: SUBMIT_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    const onboardingStatus = await onboardingStatusForRelationship(db, relationship);
    if (!canSubmitOnboarding(onboardingStatus)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Onboarding cannot be submitted in the current client state.",
        { onboardingStatus },
      );
    }

    if (response.version !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "ONBOARDING_VERSION_CONFLICT",
        "Onboarding draft was changed after this version was loaded.",
        {
          expectedVersion: parsed.data.expectedVersion,
          currentVersion: response.version,
        },
      );
    }

    const formRows = await db
      .select()
      .from(onboardingFormVersions)
      .where(eq(onboardingFormVersions.id, response.onboardingFormVersionId))
      .limit(1);
    const form = formRows[0];
    if (!form) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "Onboarding form for this response is missing.",
      );
    }

    const mappedForm = mapOnboardingFormVersion(form);
    const fields = mappedForm.fields.map((field) =>
      onboardingFieldDefinitionSchema.parse(field),
    );
    const answers = JSON.parse(response.answersJson) as Record<string, string>;
    const missing = missingRequiredOnboardingFields(fields, answers);
    if (missing.length > 0) {
      return fail(
        c,
        422,
        "ONBOARDING_INCOMPLETE",
        "Required onboarding fields are missing.",
        { missingFieldIds: missing },
      );
    }

    const timestamp = nowIso();
    await db
      .update(onboardingFormResponses)
      .set({
        status: "submitted",
        submittedAt: timestamp,
        version: response.version + 1,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(onboardingFormResponses.id, response.id),
          eq(onboardingFormResponses.version, response.version),
        ),
      );

    const updated = (
      await db
        .select()
        .from(onboardingFormResponses)
        .where(eq(onboardingFormResponses.id, response.id))
        .limit(1)
    )[0]!;
    const data = onboardingFormResponseSchema.parse(
      mapOnboardingFormResponse(updated),
    );
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SUBMIT_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);

onboardingRoutes.post(
  "/relationships/:relationshipId/review",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = createOnboardingReviewRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid onboarding review request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required for onboarding review.",
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const fingerprint = await sha256Hex(
      JSON.stringify({
        relationshipId,
        outcome: parsed.data.outcome,
      }),
    );

    const db = createDb(c.env.DB);
    const existingIdempotency = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: REVIEW_OPERATION,
      idempotencyKey,
    });
    if (existingIdempotency) {
      if (existingIdempotency.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request payload.",
        );
      }
      return c.json(
        JSON.parse(existingIdempotency.responseBody),
        existingIdempotency.responseStatus as 200,
      );
    }

    const relationships = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, relationshipId))
      .limit(1);
    const relationship = relationships[0];
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Coaching relationship not found.");
    }

    const responses = await db
      .select()
      .from(onboardingFormResponses)
      .where(
        and(
          eq(onboardingFormResponses.coachingRelationshipId, relationshipId),
          eq(onboardingFormResponses.status, "submitted"),
        ),
      )
      .limit(1);
    const response = responses[0];
    if (!response) {
      return fail(
        c,
        409,
        "ONBOARDING_NOT_SUBMITTED",
        "Onboarding must be submitted before review.",
      );
    }

    const existingReviews = await db
      .select()
      .from(onboardingReviews)
      .where(eq(onboardingReviews.onboardingFormResponseId, response.id))
      .limit(1);
    if (existingReviews[0]) {
      const currentRelationship = (
        await db
          .select()
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, relationshipId))
          .limit(1)
      )[0]!;
      const onboardingStatus = await onboardingStatusForRelationship(
        db,
        currentRelationship,
      );
      const data = createOnboardingReviewResponseSchema.parse({
        review: mapOnboardingReview(existingReviews[0]),
        relationship: mapRelationship(currentRelationship, onboardingStatus),
        onboardingStatus,
      });
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: REVIEW_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    const onboardingStatus = await onboardingStatusForRelationship(db, relationship);
    if (!canMarkCoachingReady(onboardingStatus)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Client is not ready for coaching-ready review.",
        { onboardingStatus },
      );
    }

    if (parsed.data.outcome !== "coaching_ready") {
      return fail(c, 400, "INVALID_OUTCOME", "Unsupported onboarding review outcome.");
    }

    const timestamp = nowIso();
    const reviewId = createId();
    await db.insert(onboardingReviews).values({
      id: reviewId,
      coachingRelationshipId: relationshipId,
      onboardingFormResponseId: response.id,
      trainerUserId: actor.userId,
      outcome: "coaching_ready",
      createdAt: timestamp,
    });

    const review = (
      await db
        .select()
        .from(onboardingReviews)
        .where(eq(onboardingReviews.id, reviewId))
        .limit(1)
    )[0]!;
    const updatedRelationship = (
      await db
        .select()
        .from(coachingRelationships)
        .where(eq(coachingRelationships.id, relationshipId))
        .limit(1)
    )[0]!;
    const updatedStatus = await onboardingStatusForRelationship(
      db,
      updatedRelationship,
    );

    const data = createOnboardingReviewResponseSchema.parse({
      review: mapOnboardingReview(review),
      relationship: mapRelationship(updatedRelationship, updatedStatus),
      onboardingStatus: updatedStatus,
    });
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: REVIEW_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);
