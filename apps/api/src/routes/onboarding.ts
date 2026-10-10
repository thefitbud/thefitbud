import {
  operation,
  relationshipIdQueryParameter,
} from "../openapi/document";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  createOnboardingReviewRequestSchema,
  createOnboardingReviewResponseSchema,
  onboardingAnswersSchema,
  onboardingFormDefinitionSchema,
  onboardingFormResponseSchema,
  onboardingFormVersionSchema,
  saveOnboardingDraftRequestSchema,
  submitOnboardingRequestSchema,
} from "@fitbud/contracts";
import {
  canMarkCoachingReady,
  canSaveOnboardingDraft,
  canSubmitOnboarding,
  onboardingAnswerErrors,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  onboardingFormResponses,
  onboardingFormVersions,
  onboardingReviews,
} from "../db/schema";
import { onboardingStatusForRelationship } from "../domain/client-status";
import { pinnedOnboardingVersionForRelationship } from "../domain/onboarding-forms";
import { onboardingFormTemplateRoutes } from "./onboarding-templates";
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

onboardingRoutes.route("/form-templates", onboardingFormTemplateRoutes);

async function currentFormForRelationship(
  db: Db,
  relationship: { id: string; invitationId: string | null },
) {
  const responses = await db
    .select()
    .from(onboardingFormResponses)
    .where(eq(onboardingFormResponses.coachingRelationshipId, relationship.id))
    .limit(1);
  const response = responses[0];
  if (response) {
    const pinned = await db
      .select()
      .from(onboardingFormVersions)
      .where(eq(onboardingFormVersions.id, response.onboardingFormVersionId))
      .limit(1);
    return pinned[0] ?? null;
  }
  return pinnedOnboardingVersionForRelationship(db, relationship);
}

onboardingRoutes.get(
  "/forms/current",
  operation({
    tag: "Onboarding",
    summary: "Resolves the onboarding form for the caller, pinning the definition already used when a response exists.",
    description: "Resolves the onboarding form for the caller, pinning the definition already used when a response exists.",
    parameters: [
      relationshipIdQueryParameter(),
    ],
    response: onboardingFormVersionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationshipId = c.req.query("relationshipId")?.trim();
    let relationship: {
      id: string;
      invitationId: string | null;
      trainerUserId: string;
      traineeUserId: string;
    } | null = null;

    if (relationshipId) {
      const relationships = await db
        .select()
        .from(coachingRelationships)
        .where(eq(coachingRelationships.id, relationshipId))
        .limit(1);
      const found = relationships[0];
      if (!found || !canAccessRelationship(actor, found)) {
        return fail(
          c,
          404,
          "RELATIONSHIP_NOT_FOUND",
          "Coaching relationship not found.",
        );
      }
      relationship = found;
    } else if (actor.selectedRole === "trainee") {
      const relationships = await db
        .select()
        .from(coachingRelationships)
        .where(eq(coachingRelationships.traineeUserId, actor.userId));
      relationship = relationships.length === 1 ? relationships[0]! : null;
    }

    if (!relationship) {
      return fail(
        c,
        400,
        "RELATIONSHIP_REQUIRED",
        "Pass relationshipId to read the pinned onboarding form.",
      );
    }

    const form = await currentFormForRelationship(db, relationship);
    if (!form) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "No pinned onboarding form is available for this invitation.",
      );
    }
    return ok(c, onboardingFormVersionSchema.parse(mapOnboardingFormVersion(form)));
  },
);

onboardingRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for GET /onboarding/relationships/:relationshipId.",
    description: "Onboarding operation for GET /onboarding/relationships/:relationshipId.",
    roles: ["trainer", "trainee"],
    response: onboardingFormResponseSchema,
  }),
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
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for PUT /onboarding/relationships/:relationshipId/draft.",
    description: "Onboarding operation for PUT /onboarding/relationships/:relationshipId/draft.",
    roles: ["trainee"],
    body: saveOnboardingDraftRequestSchema,
    response: onboardingFormResponseSchema,
  }),
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

    const form = await pinnedOnboardingVersionForRelationship(db, relationship);
    if (!form) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "No pinned onboarding form is available for this invitation.",
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
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for POST /onboarding/relationships/:relationshipId/submit.",
    description: "Onboarding operation for POST /onboarding/relationships/:relationshipId/submit.",
    roles: ["trainee"],
    idempotency: true,
    body: submitOnboardingRequestSchema,
    response: onboardingFormResponseSchema,
  }),
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

    const definition = onboardingFormDefinitionSchema.safeParse(
      JSON.parse(form.schemaJson) as { fields?: unknown },
    );
    if (!definition.success) {
      return fail(
        c,
        500,
        "ONBOARDING_FORM_MISSING",
        "Pinned onboarding form definition is invalid.",
      );
    }
    const storedAnswers = onboardingAnswersSchema.safeParse(
      JSON.parse(response.answersJson),
    );
    if (!storedAnswers.success) {
      return fail(
        c,
        422,
        "ONBOARDING_INCOMPLETE",
        "Required onboarding fields are missing.",
        {
          missingFieldIds: [],
          invalidFieldIds: definition.data.fields.map((field) => field.id),
        },
      );
    }
    const answerErrors = onboardingAnswerErrors(
      definition.data.fields,
      storedAnswers.data,
    );
    if (
      answerErrors.missingFieldIds.length > 0 ||
      answerErrors.invalidFieldIds.length > 0
    ) {
      return fail(
        c,
        422,
        "ONBOARDING_INCOMPLETE",
        "Required onboarding fields are missing.",
        {
          missingFieldIds: answerErrors.missingFieldIds,
          invalidFieldIds: answerErrors.invalidFieldIds,
        },
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
  operation({
    tag: "Onboarding",
    summary: "Onboarding operation for POST /onboarding/relationships/:relationshipId/review.",
    description: "Onboarding operation for POST /onboarding/relationships/:relationshipId/review.",
    roles: ["trainer"],
    idempotency: true,
    body: createOnboardingReviewRequestSchema,
    response: createOnboardingReviewResponseSchema,
  }),
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
