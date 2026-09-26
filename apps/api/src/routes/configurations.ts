import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  activateConfigurationRequestSchema,
  coachingConfigurationSchema,
  configureConfigurationRequestSchema,
  saveConfigurationDraftRequestSchema,
  type SaveConfigurationDraftRequest,
} from "@fitbud/contracts";
import {
  canActivateConfiguration,
  canEditCoachingConfiguration,
  canMarkConfigurationConfigured,
  canSaveConfigurationDraft,
  hasPrimaryGoal,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  checkinSchedules,
  coachingConfigurations,
  coachingRelationships,
  nutritionExpectations,
  trackingRequirements,
  workoutExpectations,
} from "../db/schema";
import { mapCoachingConfiguration } from "../domain/mappers";
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
import type { ActorContext, Env, Variables } from "../types";

const CONFIGURE_OPERATION = "configuration.configure";
const ACTIVATE_OPERATION = "configuration.activate";

export const configurationRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadConfigurationBundle(db: Db, relationshipId: string) {
  const configurations = await db
    .select()
    .from(coachingConfigurations)
    .where(eq(coachingConfigurations.coachingRelationshipId, relationshipId))
    .limit(1);
  const configuration = configurations[0];
  if (!configuration) {
    return null;
  }

  const [workout] = await db
    .select()
    .from(workoutExpectations)
    .where(eq(workoutExpectations.coachingConfigurationId, configuration.id))
    .limit(1);
  const [nutrition] = await db
    .select()
    .from(nutritionExpectations)
    .where(eq(nutritionExpectations.coachingConfigurationId, configuration.id))
    .limit(1);
  const [checkin] = await db
    .select()
    .from(checkinSchedules)
    .where(eq(checkinSchedules.coachingConfigurationId, configuration.id))
    .limit(1);
  const [tracking] = await db
    .select()
    .from(trackingRequirements)
    .where(eq(trackingRequirements.coachingConfigurationId, configuration.id))
    .limit(1);

  if (!workout || !nutrition || !checkin || !tracking) {
    return null;
  }

  return { configuration, workout, nutrition, checkin, tracking };
}

function parseMappedConfiguration(
  bundle: NonNullable<Awaited<ReturnType<typeof loadConfigurationBundle>>>,
) {
  return coachingConfigurationSchema.parse(mapCoachingConfiguration(bundle));
}

async function loadRelationshipForTrainer(
  db: Db,
  relationshipId: string,
  actor: ActorContext,
) {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const relationship = relationships[0];
  if (!relationship) {
    return { kind: "missing" as const };
  }
  if (relationship.trainerUserId !== actor.userId) {
    return { kind: "forbidden" as const };
  }
  return { kind: "ok" as const, relationship };
}

async function upsertExpectationChildren(
  db: Db,
  input: {
    configurationId: string;
    relationshipId: string;
    payload: SaveConfigurationDraftRequest;
    timestamp: string;
    existing: Awaited<ReturnType<typeof loadConfigurationBundle>>;
  },
) {
  const { configurationId, relationshipId, payload, timestamp, existing } =
    input;

  if (existing?.workout) {
    await db
      .update(workoutExpectations)
      .set({
        sessionsPerWeek: payload.workout.sessionsPerWeek,
        completionWindowHours: payload.workout.completionWindowHours,
        updatedAt: timestamp,
      })
      .where(eq(workoutExpectations.id, existing.workout.id));
  } else {
    await db.insert(workoutExpectations).values({
      id: createId(),
      coachingConfigurationId: configurationId,
      sessionsPerWeek: payload.workout.sessionsPerWeek,
      completionWindowHours: payload.workout.completionWindowHours,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (existing?.nutrition) {
    await db
      .update(nutritionExpectations)
      .set({
        mealsPerDay: payload.nutrition.mealsPerDay,
        confirmationWindowHours: payload.nutrition.confirmationWindowHours,
        photoRequirement: payload.nutrition.photoRequirement,
        updatedAt: timestamp,
      })
      .where(eq(nutritionExpectations.id, existing.nutrition.id));
  } else {
    await db.insert(nutritionExpectations).values({
      id: createId(),
      coachingConfigurationId: configurationId,
      mealsPerDay: payload.nutrition.mealsPerDay,
      confirmationWindowHours: payload.nutrition.confirmationWindowHours,
      photoRequirement: payload.nutrition.photoRequirement,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (existing?.checkin) {
    await db
      .update(checkinSchedules)
      .set({
        cadence: payload.checkin.cadence,
        dueWindowHours: payload.checkin.dueWindowHours,
        updatedAt: timestamp,
      })
      .where(eq(checkinSchedules.id, existing.checkin.id));
  } else {
    await db.insert(checkinSchedules).values({
      id: createId(),
      coachingConfigurationId: configurationId,
      coachingRelationshipId: relationshipId,
      cadence: payload.checkin.cadence,
      dueWindowHours: payload.checkin.dueWindowHours,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  if (existing?.tracking) {
    await db
      .update(trackingRequirements)
      .set({
        requireBodyWeight: payload.tracking.requireBodyWeight,
        requireProgressPhotos: payload.tracking.requireProgressPhotos,
        requireSessionRpe: payload.tracking.requireSessionRpe,
        updatedAt: timestamp,
      })
      .where(eq(trackingRequirements.id, existing.tracking.id));
  } else {
    await db.insert(trackingRequirements).values({
      id: createId(),
      coachingConfigurationId: configurationId,
      requireBodyWeight: payload.tracking.requireBodyWeight,
      requireProgressPhotos: payload.tracking.requireProgressPhotos,
      requireSessionRpe: payload.tracking.requireSessionRpe,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

configurationRoutes.get(
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
    if (!relationship) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    const isOwningTrainer =
      actor.selectedRole === "trainer" &&
      relationship.trainerUserId === actor.userId;
    const isRelationshipTrainee =
      actor.selectedRole === "trainee" &&
      relationship.traineeUserId === actor.userId;
    if (!isOwningTrainer && !isRelationshipTrainee) {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    const bundle = await loadConfigurationBundle(db, relationshipId);
    if (!bundle) {
      return fail(
        c,
        404,
        "CONFIGURATION_NOT_FOUND",
        "Coaching configuration not found.",
      );
    }

    return ok(c, parseMappedConfiguration(bundle));
  },
);

configurationRoutes.put(
  "/relationships/:relationshipId/draft",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = saveConfigurationDraftRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid coaching configuration draft request.",
        { issues: parsed.error.issues },
      );
    }

    const relationshipId = c.req.param("relationshipId");
    const db = createDb(c.env.DB);
    const ownership = await loadRelationshipForTrainer(db, relationshipId, actor);
    if (ownership.kind === "missing") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }
    if (ownership.kind === "forbidden") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (!canEditCoachingConfiguration(ownership.relationship.status)) {
      return fail(
        c,
        409,
        "RELATIONSHIP_NOT_READY",
        "Configuration requires a coaching-ready relationship.",
        { status: ownership.relationship.status },
      );
    }

    const existing = await loadConfigurationBundle(db, relationshipId);
    if (!canSaveConfigurationDraft(existing?.configuration.status ?? null)) {
      return fail(
        c,
        409,
        "CONFIGURATION_NOT_EDITABLE",
        "Active configuration cannot be overwritten in place.",
        { status: existing?.configuration.status },
      );
    }

    const expectedVersion = parsed.data.expectedVersion;
    const currentVersion = existing?.configuration.version ?? 0;
    if (currentVersion !== expectedVersion) {
      return fail(
        c,
        409,
        "CONFIGURATION_VERSION_CONFLICT",
        "Configuration was changed after this version was loaded.",
        { expectedVersion, currentVersion },
      );
    }

    const timestamp = nowIso();
    const primaryGoal =
      parsed.data.primaryGoal === undefined
        ? (existing?.configuration.primaryGoal ?? null)
        : parsed.data.primaryGoal;
    const notes =
      parsed.data.notes === undefined
        ? (existing?.configuration.notes ?? null)
        : parsed.data.notes;

    if (existing) {
      await db
        .update(coachingConfigurations)
        .set({
          status: "draft",
          primaryGoal,
          notes,
          configuredAt: null,
          version: existing.configuration.version + 1,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(coachingConfigurations.id, existing.configuration.id),
            eq(coachingConfigurations.version, expectedVersion),
          ),
        );

      await upsertExpectationChildren(db, {
        configurationId: existing.configuration.id,
        relationshipId,
        payload: parsed.data,
        timestamp,
        existing,
      });

      const updated = await loadConfigurationBundle(db, relationshipId);
      return ok(c, parseMappedConfiguration(updated!));
    }

    const configurationId = createId();
    await db.insert(coachingConfigurations).values({
      id: configurationId,
      coachingRelationshipId: relationshipId,
      status: "draft",
      version: 1,
      primaryGoal,
      notes,
      configuredAt: null,
      activatedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await upsertExpectationChildren(db, {
      configurationId,
      relationshipId,
      payload: parsed.data,
      timestamp,
      existing: null,
    });

    const created = await loadConfigurationBundle(db, relationshipId);
    return ok(c, parseMappedConfiguration(created!), 201);
  },
);

configurationRoutes.post(
  "/relationships/:relationshipId/configure",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = configureConfigurationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid configure configuration request.",
        { issues: parsed.error.issues },
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to configure coaching.",
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
      operation: CONFIGURE_OPERATION,
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

    const ownership = await loadRelationshipForTrainer(db, relationshipId, actor);
    if (ownership.kind === "missing") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }
    if (ownership.kind === "forbidden") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (!canEditCoachingConfiguration(ownership.relationship.status)) {
      return fail(
        c,
        409,
        "RELATIONSHIP_NOT_READY",
        "Configuration requires a coaching-ready relationship.",
        { status: ownership.relationship.status },
      );
    }

    const bundle = await loadConfigurationBundle(db, relationshipId);
    if (!bundle) {
      return fail(
        c,
        404,
        "CONFIGURATION_NOT_FOUND",
        "Save a configuration draft before marking it configured.",
      );
    }

    if (bundle.configuration.status === "configured") {
      const data = parseMappedConfiguration(bundle);
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: CONFIGURE_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    if (bundle.configuration.status === "active") {
      return fail(
        c,
        409,
        "CONFIGURATION_ALREADY_ACTIVE",
        "Active configuration cannot be marked configured again.",
      );
    }

    if (!canMarkConfigurationConfigured(bundle.configuration.status)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Configuration cannot be marked configured in the current state.",
        { status: bundle.configuration.status },
      );
    }

    if (bundle.configuration.version !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "CONFIGURATION_VERSION_CONFLICT",
        "Configuration was changed after this version was loaded.",
        {
          expectedVersion: parsed.data.expectedVersion,
          currentVersion: bundle.configuration.version,
        },
      );
    }

    if (!hasPrimaryGoal(bundle.configuration.primaryGoal)) {
      return fail(
        c,
        422,
        "CONFIGURATION_INCOMPLETE",
        "Primary goal is required before configuration can be completed.",
      );
    }

    const timestamp = nowIso();
    await db
      .update(coachingConfigurations)
      .set({
        status: "configured",
        configuredAt: timestamp,
        version: bundle.configuration.version + 1,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(coachingConfigurations.id, bundle.configuration.id),
          eq(coachingConfigurations.version, parsed.data.expectedVersion),
        ),
      );

    const updated = await loadConfigurationBundle(db, relationshipId);
    const data = parseMappedConfiguration(updated!);
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: CONFIGURE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);

configurationRoutes.post(
  "/relationships/:relationshipId/activate",
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = activateConfigurationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        c,
        400,
        "INVALID_REQUEST",
        "Invalid activate configuration request.",
        { issues: parsed.error.issues },
      );
    }

    const idempotencyKey = c.req.header("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required to activate coaching configuration.",
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
      operation: ACTIVATE_OPERATION,
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

    const ownership = await loadRelationshipForTrainer(db, relationshipId, actor);
    if (ownership.kind === "missing") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }
    if (ownership.kind === "forbidden") {
      return fail(
        c,
        404,
        "RELATIONSHIP_NOT_FOUND",
        "Coaching relationship not found.",
      );
    }

    if (!canEditCoachingConfiguration(ownership.relationship.status)) {
      return fail(
        c,
        409,
        "RELATIONSHIP_NOT_READY",
        "Configuration requires a coaching-ready relationship.",
        { status: ownership.relationship.status },
      );
    }

    const bundle = await loadConfigurationBundle(db, relationshipId);
    if (!bundle) {
      return fail(
        c,
        404,
        "CONFIGURATION_NOT_FOUND",
        "Configuration must be drafted and configured before activation.",
      );
    }

    if (bundle.configuration.status === "active") {
      const data = parseMappedConfiguration(bundle);
      const responseBody = { data };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: ACTIVATE_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return ok(c, data);
    }

    if (!canActivateConfiguration(bundle.configuration.status)) {
      return fail(
        c,
        409,
        "UNSUPPORTED_TRANSITION",
        "Configuration must be marked configured before activation.",
        { status: bundle.configuration.status },
      );
    }

    if (bundle.configuration.version !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "CONFIGURATION_VERSION_CONFLICT",
        "Configuration was changed after this version was loaded.",
        {
          expectedVersion: parsed.data.expectedVersion,
          currentVersion: bundle.configuration.version,
        },
      );
    }

    if (!hasPrimaryGoal(bundle.configuration.primaryGoal)) {
      return fail(
        c,
        422,
        "CONFIGURATION_INCOMPLETE",
        "Primary goal is required before activation.",
      );
    }

    const timestamp = nowIso();
    await db
      .update(coachingConfigurations)
      .set({
        status: "active",
        activatedAt: timestamp,
        version: bundle.configuration.version + 1,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(coachingConfigurations.id, bundle.configuration.id),
          eq(coachingConfigurations.version, parsed.data.expectedVersion),
        ),
      );

    const updated = await loadConfigurationBundle(db, relationshipId);
    const data = parseMappedConfiguration(updated!);
    const responseBody = { data };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ACTIVATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return ok(c, data);
  },
);
