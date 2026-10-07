import {
  operation,
} from "../openapi/document";
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  createMeasurementRequestSchema,
  createProgressEntryRequestSchema,
  measurementListResponseSchema,
  measurementSchema,
  progressEntryListResponseSchema,
  progressEntrySchema,
  progressSummarySchema,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import {
  coachingRelationships,
  measurements,
  mediaAssets,
  progressEntries,
} from "../db/schema";
import {
  mapMeasurement,
  mapMediaAsset,
  mapProgressEntry,
} from "../domain/mappers";
import { appendChangeLog } from "../domain/sync";
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
import { canAccessRelationship } from "./relationships";

const MEASUREMENT_OPERATION = "progress.measurement.create";
const ENTRY_OPERATION = "progress.entry.create";

export const progressRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

async function loadAccessibleRelationship(
  db: Db,
  relationshipId: string,
  actor: ActorContext,
) {
  const rows = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  const row = rows[0];
  if (!row || !canAccessRelationship(actor, row)) return null;
  return row;
}

function requireIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

async function loadReadyOwnedMedia(
  db: Db,
  mediaAssetId: string,
  relationshipId: string,
) {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaAssetId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.coachingRelationshipId !== relationshipId) return null;
  if (row.status !== "ready") return null;
  return row;
}

progressRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Progress",
    summary: "Progress operation for GET /progress/relationships/:relationshipId.",
    description: "Progress operation for GET /progress/relationships/:relationshipId.",
    roles: ["trainer", "trainee"],
    response: progressSummarySchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const [measurementRows, entryRows, mediaRows] = await Promise.all([
      db
        .select()
        .from(measurements)
        .where(eq(measurements.coachingRelationshipId, relationship.id))
        .orderBy(desc(measurements.observedAt))
        .limit(50),
      db
        .select()
        .from(progressEntries)
        .where(eq(progressEntries.coachingRelationshipId, relationship.id))
        .orderBy(desc(progressEntries.observedAt))
        .limit(50),
      db
        .select()
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.coachingRelationshipId, relationship.id),
            eq(mediaAssets.status, "ready"),
          ),
        )
        .orderBy(desc(mediaAssets.createdAt))
        .limit(50),
    ]);

    return ok(
      c,
      progressSummarySchema.parse({
        measurements: measurementRows.map(mapMeasurement),
        entries: entryRows.map(mapProgressEntry),
        media: mediaRows.map(mapMediaAsset),
      }),
    );
  },
);

progressRoutes.get(
  "/relationships/:relationshipId/measurements",
  operation({
    tag: "Progress",
    summary: "Progress operation for GET /progress/relationships/:relationshipId/measurements.",
    description: "Progress operation for GET /progress/relationships/:relationshipId/measurements.",
    roles: ["trainer", "trainee"],
    response: measurementListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const rows = await db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationship.id))
      .orderBy(desc(measurements.observedAt))
      .limit(100);

    return ok(
      c,
      measurementListResponseSchema.parse({
        items: rows.map(mapMeasurement),
        nextCursor: null,
      }),
    );
  },
);

progressRoutes.post(
  "/relationships/:relationshipId/measurements",
  operation({
    tag: "Progress",
    summary: "Progress operation for POST /progress/relationships/:relationshipId/measurements.",
    description: "Progress operation for POST /progress/relationships/:relationshipId/measurements.",
    roles: ["trainer", "trainee"],
    idempotency: true,
    body: createMeasurementRequestSchema,
    response: measurementSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const parsed = createMeasurementRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid measurement request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        relationshipId: c.req.param("relationshipId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: MEASUREMENT_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    if (
      actor.selectedRole === "trainee" &&
      relationship.traineeUserId !== actor.userId
    ) {
      return fail(
        c,
        403,
        "FORBIDDEN",
        "Trainee cannot write for this relationship.",
      );
    }

    if (parsed.data.mediaAssetId) {
      const media = await loadReadyOwnedMedia(
        db,
        parsed.data.mediaAssetId,
        relationship.id,
      );
      if (!media) {
        return fail(
          c,
          422,
          "MEDIA_ASSET_INVALID",
          "Linked media asset must be ready and owned by this relationship.",
        );
      }
    }

    const now = nowIso();
    const row = {
      id: parsed.data.id ?? createId(),
      coachingRelationshipId: relationship.id,
      traineeUserId: relationship.traineeUserId,
      type: parsed.data.type,
      value: parsed.data.value,
      unit: parsed.data.unit,
      observedAt: parsed.data.observedAt ?? now,
      source:
        actor.selectedRole === "trainer"
          ? ("trainer_entry" as const)
          : ("trainee_entry" as const),
      checkinId: null as string | null,
      mediaAssetId: parsed.data.mediaAssetId ?? null,
      recordVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (parsed.data.id) {
      const existingRows = await db
        .select()
        .from(measurements)
        .where(eq(measurements.id, parsed.data.id))
        .limit(1);
      if (existingRows[0]) {
        const existing = existingRows[0];
        if (existing.coachingRelationshipId !== relationship.id) {
          return fail(
            c,
            409,
            "MEASUREMENT_ID_CONFLICT",
            "Measurement id is already used by another relationship.",
          );
        }
        const responseBody = {
          data: measurementSchema.parse(mapMeasurement(existing)),
        };
        await saveIdempotencyRecord(db, {
          actorUserId: actor.userId,
          operation: MEASUREMENT_OPERATION,
          idempotencyKey,
          requestFingerprint: fingerprint,
          responseStatus: 200,
          responseBody,
          expiresAt: addDaysIso(7),
        });
        return c.json(responseBody, 200);
      }
    }
    await db.insert(measurements).values(row);

    const mapped = measurementSchema.parse(mapMeasurement(row));
    if (actor.selectedRole === "trainee") {
      await appendChangeLog(db, {
        entityType: "measurement",
        recordId: mapped.id,
        changeKind: "upsert",
        serverVersion: mapped.recordVersion,
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
      });
    }

    const responseBody = {
      data: mapped,
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: MEASUREMENT_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

progressRoutes.get(
  "/relationships/:relationshipId/entries",
  operation({
    tag: "Progress",
    summary: "Progress operation for GET /progress/relationships/:relationshipId/entries.",
    description: "Progress operation for GET /progress/relationships/:relationshipId/entries.",
    roles: ["trainer", "trainee"],
    response: progressEntryListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const rows = await db
      .select()
      .from(progressEntries)
      .where(eq(progressEntries.coachingRelationshipId, relationship.id))
      .orderBy(desc(progressEntries.observedAt))
      .limit(100);

    return ok(
      c,
      progressEntryListResponseSchema.parse({
        items: rows.map(mapProgressEntry),
        nextCursor: null,
      }),
    );
  },
);

progressRoutes.post(
  "/relationships/:relationshipId/entries",
  operation({
    tag: "Progress",
    summary: "Progress operation for POST /progress/relationships/:relationshipId/entries.",
    description: "Progress operation for POST /progress/relationships/:relationshipId/entries.",
    roles: ["trainer", "trainee"],
    idempotency: true,
    body: createProgressEntryRequestSchema,
    response: progressEntrySchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const idempotencyKey = requireIdempotencyKey(c);
    if (!idempotencyKey) {
      return fail(
        c,
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Idempotency-Key header is required.",
      );
    }

    const parsed = createProgressEntryRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid progress entry request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        relationshipId: c.req.param("relationshipId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ENTRY_OPERATION,
      idempotencyKey,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        return fail(
          c,
          409,
          "IDEMPOTENCY_KEY_REUSE",
          "Idempotency key was reused with a different request.",
        );
      }
      return c.json(
        JSON.parse(existing.responseBody),
        existing.responseStatus as 200,
      );
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    if (
      actor.selectedRole === "trainee" &&
      relationship.traineeUserId !== actor.userId
    ) {
      return fail(
        c,
        403,
        "FORBIDDEN",
        "Trainee cannot write for this relationship.",
      );
    }

    if (parsed.data.mediaAssetId) {
      const media = await loadReadyOwnedMedia(
        db,
        parsed.data.mediaAssetId,
        relationship.id,
      );
      if (!media) {
        return fail(
          c,
          422,
          "MEDIA_ASSET_INVALID",
          "Linked media asset must be ready and owned by this relationship.",
        );
      }
    }

    const now = nowIso();
    const row = {
      id: createId(),
      coachingRelationshipId: relationship.id,
      traineeUserId: relationship.traineeUserId,
      entryType: parsed.data.entryType,
      title: parsed.data.title ?? null,
      body: parsed.data.body ?? null,
      observedAt: parsed.data.observedAt ?? now,
      mediaAssetId: parsed.data.mediaAssetId ?? null,
      recordVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(progressEntries).values(row);

    const responseBody = {
      data: progressEntrySchema.parse(mapProgressEntry(row)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ENTRY_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);
