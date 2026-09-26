import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  createOnboardingReviewRequestSchema,
  createOnboardingReviewResponseSchema,
  intakeDefinitionSchema,
  intakeFieldDefinitionSchema,
  intakeSubmissionSchema,
  saveIntakeDraftRequestSchema,
  submitIntakeRequestSchema,
} from "@fitbud/contracts";
import {
  canMarkCoachingReady,
  canSaveIntakeDraft,
  canSubmitIntake,
  missingRequiredIntakeFields,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  intakeDefinitions,
  intakeSubmissions,
  onboardingReviews,
} from "../db/schema";
import {
  mapIntakeDefinition,
  mapIntakeSubmission,
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

const MVP_INTAKE_KEY = "mvp";
const SUBMIT_INTAKE_OPERATION = "intake.submit";
const REVIEW_ONBOARDING_OPERATION = "onboarding.review";

export const intakeRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

async function loadCurrentMvpDefinition(db: ReturnType<typeof createDb>) {
  const rows = await db
    .select()
    .from(intakeDefinitions)
    .where(eq(intakeDefinitions.key, MVP_INTAKE_KEY))
    .orderBy(desc(intakeDefinitions.version))
    .limit(1);
  return rows[0] ?? null;
}

intakeRoutes.get(
  "/definitions/current",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  async (c) => {
    const db = createDb(c.env.DB);
    const definition = await loadCurrentMvpDefinition(db);
    if (!definition) {
      return fail(
        c,
        500,
        "INTAKE_DEFINITION_MISSING",
        "MVP intake definition is not seeded.",
      );
    }
    return ok(c, intakeDefinitionSchema.parse(mapIntakeDefinition(definition)));
  },
);

intakeRoutes.get(
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

    const submissions = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.coachingRelationshipId, relationshipId))
      .limit(1);
    const submission = submissions[0];
    if (!submission) {
      return fail(c, 404, "INTAKE_NOT_FOUND", "Intake submission not found.");
    }

    return ok(c, intakeSubmissionSchema.parse(mapIntakeSubmission(submission)));
  },
);

intakeRoutes.put(
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
    const parsed = saveIntakeDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid intake draft request.", {
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

    if (!canSaveIntakeDraft(relationship.status)) {
      return fail(
        c,
        409,
        "INTAKE_NOT_EDITABLE",
        "Submitted intake cannot be overwritten.",
        { status: relationship.status },
      );
    }

    const definition = await loadCurrentMvpDefinition(db);
    if (!definition) {
      return fail(
        c,
        500,
        "INTAKE_DEFINITION_MISSING",
        "MVP intake definition is not seeded.",
      );
    }

    const timestamp = nowIso();
    const existingRows = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.coachingRelationshipId, relationshipId))
      .limit(1);
    const existing = existingRows[0];

    if (existing) {
      if (existing.status === "submitted") {
        return fail(
          c,
          409,
          "INTAKE_ALREADY_SUBMITTED",
          "Submitted intake cannot be overwritten.",
        );
      }
      if (existing.version !== parsed.data.expectedVersion) {
        return fail(
          c,
          409,
          "INTAKE_VERSION_CONFLICT",
          "Intake draft was changed after this version was loaded.",
          {
            expectedVersion: parsed.data.expectedVersion,
            currentVersion: existing.version,
          },
        );
      }

      await db
        .update(intakeSubmissions)
        .set({
          answersJson: JSON.stringify(parsed.data.answers),
          version: existing.version + 1,
          updatedAt: timestamp,
        })
        .where(eq(intakeSubmissions.id, existing.id));

      const updated = (
        await db
          .select()
          .from(intakeSubmissions)
          .where(eq(intakeSubmissions.id, existing.id))
          .limit(1)
      )[0]!;
      return ok(c, intakeSubmissionSchema.parse(mapIntakeSubmission(updated)));
    }

    if (parsed.data.expectedVersion !== 0) {
      return fail(
        c,
        409,
        "INTAKE_VERSION_CONFLICT",
        "Intake draft was changed after this version was loaded.",
        { expectedVersion: parsed.data.expectedVersion, currentVersion: 0 },
      );
    }

    const submissionId = createId();
    await db.insert(intakeSubmissions).values({
      id: submissionId,
      coachingRelationshipId: relationshipId,
      intakeDefinitionId: definition.id,
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
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.id, submissionId))
        .limit(1)
    )[0]!;
    return ok(c, intakeSubmissionSchema.parse(mapIntakeSubmission(created)), 201);
  },
);

intakeRoutes.post(
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
    const parsed = submitIntakeRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid intake submit request.", {
        issues: parsed.error.issues,
      });
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to submit intake.",
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
      operation: SUBMIT_INTAKE_OPERATION,
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

    const submissions = await db
      .select()
      .from(intakeSubmissions)
      .where(eq(intakeSubmissions.coachingRelationshipId, relationshipId))
      .limit(1);
    const submission = submissions[0];
    if (!submission) {
      return fail(c, 404, "INTAKE_NOT_FOUND", "Intake draft not found.");
    }

    if (submission.status === "submitted") {
      const data = intakeSubmissionSchema.parse(mapIntakeSubmission(submission));
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: SUBMIT_INTAKE_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    if (!canSubmitIntake(relationship.status)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Intake cannot be submitted in the current relationship state.",
        { status: relationship.status },
      );
    }

    if (submission.version !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "INTAKE_VERSION_CONFLICT",
        "Intake draft was changed after this version was loaded.",
        {
          expectedVersion: parsed.data.expectedVersion,
          currentVersion: submission.version,
        },
      );
    }

    const definitionRows = await db
      .select()
      .from(intakeDefinitions)
      .where(eq(intakeDefinitions.id, submission.intakeDefinitionId))
      .limit(1);
    const definition = definitionRows[0];
    if (!definition) {
      return fail(
        c,
        500,
        "INTAKE_DEFINITION_MISSING",
        "Intake definition for this submission is missing.",
      );
    }

    const mappedDefinition = mapIntakeDefinition(definition);
    const fields = mappedDefinition.fields.map((field) =>
      intakeFieldDefinitionSchema.parse(field),
    );
    const answers = JSON.parse(submission.answersJson) as Record<string, string>;
    const missing = missingRequiredIntakeFields(fields, answers);
    if (missing.length > 0) {
      return fail(
        c,
        422,
        "INTAKE_INCOMPLETE",
        "Required intake fields are missing.",
        { missingFieldIds: missing },
      );
    }

    const timestamp = nowIso();
    await db
      .update(intakeSubmissions)
      .set({
        status: "submitted",
        submittedAt: timestamp,
        version: submission.version + 1,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(intakeSubmissions.id, submission.id),
          eq(intakeSubmissions.version, submission.version),
        ),
      );

    await db
      .update(coachingRelationships)
      .set({
        status: "onboarding_submitted",
        updatedAt: timestamp,
      })
      .where(eq(coachingRelationships.id, relationshipId));

    const updated = (
      await db
        .select()
        .from(intakeSubmissions)
        .where(eq(intakeSubmissions.id, submission.id))
        .limit(1)
    )[0]!;
    const data = intakeSubmissionSchema.parse(mapIntakeSubmission(updated));
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SUBMIT_INTAKE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);

intakeRoutes.post(
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
      operation: REVIEW_ONBOARDING_OPERATION,
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

    const submissions = await db
      .select()
      .from(intakeSubmissions)
      .where(
        and(
          eq(intakeSubmissions.coachingRelationshipId, relationshipId),
          eq(intakeSubmissions.status, "submitted"),
        ),
      )
      .limit(1);
    const submission = submissions[0];
    if (!submission) {
      return fail(
        c,
        409,
        "INTAKE_NOT_SUBMITTED",
        "Intake must be submitted before onboarding review.",
      );
    }

    const existingReviews = await db
      .select()
      .from(onboardingReviews)
      .where(eq(onboardingReviews.intakeSubmissionId, submission.id))
      .limit(1);
    if (existingReviews[0]) {
      const currentRelationship = (
        await db
          .select()
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, relationshipId))
          .limit(1)
      )[0]!;
      const data = createOnboardingReviewResponseSchema.parse({
        review: mapOnboardingReview(existingReviews[0]),
        relationship: mapRelationship(currentRelationship),
        onboardingStatus: mapRelationship(currentRelationship).onboardingStatus,
      });
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: REVIEW_ONBOARDING_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    if (!canMarkCoachingReady(relationship.status)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Relationship is not ready for coaching-ready review.",
        { status: relationship.status },
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
      intakeSubmissionId: submission.id,
      trainerUserId: actor.userId,
      outcome: "coaching_ready",
      createdAt: timestamp,
    });

    await db
      .update(coachingRelationships)
      .set({
        status: "coaching_ready",
        updatedAt: timestamp,
      })
      .where(eq(coachingRelationships.id, relationshipId));

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

    const data = createOnboardingReviewResponseSchema.parse({
      review: mapOnboardingReview(review),
      relationship: mapRelationship(updatedRelationship),
      onboardingStatus: mapRelationship(updatedRelationship).onboardingStatus,
    });
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: REVIEW_ONBOARDING_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);
