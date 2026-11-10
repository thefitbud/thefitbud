import {
  operation,
} from "../openapi/document";
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import {
  coachEditMeasurementRequestSchema,
  createMeasurementRequestSchema,
  createProgressEntryRequestSchema,
  measurementListResponseSchema,
  measurementSchema,
  progressEntryListResponseSchema,
  progressEntrySchema,
  progressMetricsQuerySchema,
  progressMetricsResponseSchema,
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
import { formatLocalDate } from "@fitbud/core";
import { loadTraineeTimezone } from "../domain/assignment-schedule";
import {
  loadProgressMetricSeries,
  resolveMetricsWindow,
} from "../domain/progress-metrics";
import { COACH_LOGGED_READ_ONLY_CODE } from "../domain/compliance-logging.js";
import {
  CoachLogConflict,
  LOG_WRITE_CONFLICT,
  measurementLogSnapshot,
  recordCoachLogChange,
} from "../domain/coach-log.js";
import {
  COACH_LOG_BACKDATE_ERROR,
  LOG_TIME_ERROR_CODES,
  LOG_TIME_ERROR_MESSAGES,
  isInEndedPeriod,
  isWithinCoachLogWindow,
} from "../domain/log-time-bounds.js";
import { appendChangeLog } from "../domain/sync";
import { resolvePushProviderMode } from "../lib/push-provider.js";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import { fail, ok, type AppContext } from "../lib/envelope";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
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

function coachPushConfig(env: Env) {
  return {
    pushProviderMode: resolvePushProviderMode(env.PUSH_PROVIDER_MODE),
    expoAccessToken: env.EXPO_ACCESS_TOKEN,
  };
}

function coachMeasurementVersionConflict(c: AppContext) {
  return fail(
    c,
    409,
    "VERSION_CONFLICT",
    "This measurement changed since it was opened. Reload and try again.",
  );
}

function measurementLogWriteConflict(c: AppContext) {
  return fail(c, 409, LOG_WRITE_CONFLICT.code, LOG_WRITE_CONFLICT.message);
}

async function measurementCreateConflict(
  c: AppContext,
  db: Db,
  measurementId: string,
  relationshipId: string,
) {
  const [existing] = await db
    .select()
    .from(measurements)
    .where(eq(measurements.id, measurementId))
    .limit(1);
  if (!existing) return measurementLogWriteConflict(c);
  if (existing.coachingRelationshipId !== relationshipId) {
    return fail(
      c,
      409,
      "MEASUREMENT_ID_CONFLICT",
      "Measurement id is already used by another relationship.",
    );
  }
  return c.json({ data: measurementSchema.parse(mapMeasurement(existing)) }, 200);
}

function coachLoggedReadOnlyError(c: AppContext) {
  return fail(
    c,
    409,
    COACH_LOGGED_READ_ONLY_CODE,
    "This measurement was logged by your coach and cannot be changed.",
  );
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

progressRoutes.get(
  "/relationships/:relationshipId/metrics",
  operation({
    tag: "Progress",
    summary: "Numeric progress series by question key for one client.",
    description:
      "Series for one or two standard question keys over 4 weeks, 12 weeks, all time or a custom local-date range. Values only, oldest first, one point per local date in the client's stored timezone. A check-in answer wins a day it shares with a stored measurement. Ended relationships stay readable.",
    roles: ["trainer", "trainee"],
    parameters: [
      {
        name: "keys",
        in: "query",
        required: true,
        description:
          "One or two comma-separated keys: weight, waist, hips, chest, arm, thigh, energy, sleep_quality, stress, hunger.",
        schema: { type: "string" },
      },
      {
        name: "range",
        in: "query",
        description: "4w, 12w (default), all or custom.",
        schema: { type: "string", enum: ["4w", "12w", "all", "custom"] },
      },
      {
        name: "from",
        in: "query",
        description: "Local date YYYY-MM-DD, required with range=custom.",
        schema: { type: "string" },
      },
      {
        name: "to",
        in: "query",
        description: "Local date YYYY-MM-DD, required with range=custom, not before from.",
        schema: { type: "string" },
      },
    ],
    response: progressMetricsResponseSchema,
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
    const relationshipId = c.req.param("relationshipId");
    const relationship = await loadAccessibleRelationship(db, relationshipId, actor);
    if (!relationship) {
      if (actor.selectedRole === "trainer") {
        // Another trainer's client is 403; an unknown id stays 404.
        const [other] = await db
          .select({ id: coachingRelationships.id })
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, relationshipId))
          .limit(1);
        if (other) {
          return fail(c, 403, "FORBIDDEN", "You cannot view progress for this client.");
        }
      }
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const parsed = progressMetricsQuerySchema.safeParse({
      keys: (c.req.query("keys") ?? "")
        .split(",")
        .map((key) => key.trim())
        .filter((key) => key.length > 0),
      range: c.req.query("range") || undefined,
      from: c.req.query("from") || undefined,
      to: c.req.query("to") || undefined,
    });
    if (!parsed.success) {
      return fail(c, 422, "INVALID_REQUEST", "Invalid progress metrics query.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path,
          code: issue.code,
        })),
      });
    }
    const query = parsed.data;

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const window = resolveMetricsWindow({
      range: query.range,
      from: query.from,
      to: query.to,
      today: formatLocalDate(new Date(), timezone),
    });
    const series = await loadProgressMetricSeries(db, {
      relationshipId: relationship.id,
      keys: query.keys,
      window,
      timezone,
    });

    return ok(
      c,
      progressMetricsResponseSchema.parse({
        relationshipId: relationship.id,
        range: query.range,
        from: window.from,
        to: window.to,
        timezone,
        series,
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
      if (actor.selectedRole === "trainer") {
        // Another trainer's client is 403 (Z6-20); an unknown id stays 404.
        const [other] = await db
          .select({ id: coachingRelationships.id })
          .from(coachingRelationships)
          .where(eq(coachingRelationships.id, c.req.param("relationshipId")))
          .limit(1);
        if (other) {
          return fail(c, 403, "FORBIDDEN", "You cannot log measurements for this client.");
        }
      }
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const writableMeasurement = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writableMeasurement.ok) return writableMeasurement.response;

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
    const byCoach = actor.selectedRole === "trainer";
    const observedAt = parsed.data.observedAt
      ? new Date(parsed.data.observedAt).toISOString()
      : now;
    const row = {
      id: parsed.data.id ?? createId(),
      coachingRelationshipId: relationship.id,
      traineeUserId: relationship.traineeUserId,
      type: parsed.data.type,
      value: parsed.data.value,
      unit: parsed.data.unit,
      observedAt: byCoach ? observedAt : (parsed.data.observedAt ?? now),
      source: byCoach ? ("trainer_entry" as const) : ("trainee_entry" as const),
      checkinId: null as string | null,
      mediaAssetId: parsed.data.mediaAssetId ?? null,
      recordVersion: 0,
      // Z6-20 (D-W6-32 (3)): a trainer's entry is the coach's from now on and
      // read-only to the trainee (R1). Earlier trainer_entry rows are not backfilled.
      loggedByRole: byCoach ? ("coach" as const) : ("trainee" as const),
      loggedByUserId: byCoach ? actor.userId : null,
      lastEditedByRole: null,
      lastEditedByUserId: null,
      lastEditedAt: null,
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
        // R1: a trainee write on a coach-created measurement is refused, on this
        // route and so on sync push replays too.
        if (actor.selectedRole === "trainee" && existing.loggedByRole === "coach") {
          return coachLoggedReadOnlyError(c);
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
    if (byCoach) {
      // R2: the trainer skips the Z6-11 bounds, but the entry must be dated
      // within the last 7 days and not in the future (trainee timezone).
      const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
      if (
        !isWithinCoachLogWindow({
          localDates: [],
          instants: [observedAt],
          now,
          timeZone,
        })
      ) {
        return fail(c, 422, COACH_LOG_BACKDATE_ERROR.code, COACH_LOG_BACKDATE_ERROR.message);
      }
      const localDate = formatLocalDate(new Date(observedAt), timeZone);
      if (
        isInEndedPeriod({
          reactivatedAt: relationship.reactivatedAt,
          loggedAt: now,
          localDate,
          timeZone,
        })
      ) {
        return fail(
          c,
          422,
          LOG_TIME_ERROR_CODES.ended_period,
          LOG_TIME_ERROR_MESSAGES.ended_period,
        );
      }
      try {
        await recordCoachLogChange(db, {
          domainWrites: () => [db.insert(measurements).values(row)],
          entity: {
            type: "measurement",
            id: row.id,
            coachingRelationshipId: relationship.id,
            traineeUserId: relationship.traineeUserId,
            serverVersion: row.recordVersion,
            routing: {
              domainEntityType: "coaching_relationship",
              domainEntityId: relationship.id,
            },
          },
          action: "create",
          actorUserId: actor.userId,
          before: null,
          after: measurementLogSnapshot({ localDate, measurement: row }),
          now,
          push: coachPushConfig(c.env),
        });
      } catch (error) {
        if (error instanceof CoachLogConflict) {
          if (error.kind === "entry") {
            return measurementCreateConflict(c, db, row.id, relationship.id);
          }
          return measurementLogWriteConflict(c);
        }
        throw error;
      }
    } else {
      await db.insert(measurements).values(row);
    }

    const mapped = measurementSchema.parse(mapMeasurement(row));
    if (!byCoach) {
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

progressRoutes.patch(
  "/measurements/:measurementId",
  operation({
    tag: "Progress",
    summary: "Trainer edits a client's measurement",
    description:
      "Changes the value, unit or time of a measurement dated within the last 7 days (422 BACKDATE_LIMIT). recordVersion must match (409 VERSION_CONFLICT). Sets last_edited_* to the coach; a trainee-logged measurement stays the trainee's. A measurement that came from a check-in cannot be edited. Audited, shown in the activity feed and notifies the trainee when their coach-updates setting is on.",
    roles: ["trainer"],
    body: coachEditMeasurementRequestSchema,
    response: measurementSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = coachEditMeasurementRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid measurement edit.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const [measurement] = await db
      .select()
      .from(measurements)
      .where(eq(measurements.id, c.req.param("measurementId")))
      .limit(1);
    if (!measurement) {
      return fail(c, 404, "MEASUREMENT_NOT_FOUND", "Measurement not found.");
    }
    const [relationship] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, measurement.coachingRelationshipId))
      .limit(1);
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 403, "FORBIDDEN", "You cannot edit measurements for this client.");
    }
    const writable = await requireWritableRelationship(c, db, relationship.id);
    if (!writable.ok) return writable.response;

    if (measurement.source === "checkin" || measurement.checkinId) {
      // The client's own check-in answers are what the review is about.
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "A measurement from a check-in cannot be edited.",
      );
    }
    if (measurement.recordVersion !== parsed.data.recordVersion) {
      return coachMeasurementVersionConflict(c);
    }

    const now = nowIso();
    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const nextObservedAt = parsed.data.observedAt
      ? new Date(parsed.data.observedAt).toISOString()
      : measurement.observedAt;
    // R2: the entry as it is and as it would be must both be within the last 7 days.
    if (
      !isWithinCoachLogWindow({
        localDates: [],
        instants:
          nextObservedAt === measurement.observedAt
            ? [measurement.observedAt]
            : [measurement.observedAt, nextObservedAt],
        now,
        timeZone,
      })
    ) {
      return fail(c, 422, COACH_LOG_BACKDATE_ERROR.code, COACH_LOG_BACKDATE_ERROR.message);
    }
    const nextLocalDate = formatLocalDate(new Date(nextObservedAt), timeZone);
    // D-W6-20, D-W6-40: the entry as it is now and as it would be must both be
    // outside the frozen period, so moving the date cannot unfreeze it.
    if (
      isInEndedPeriod({
        reactivatedAt: relationship.reactivatedAt,
        loggedAt: nextObservedAt,
        localDate: nextLocalDate,
        timeZone,
      }) ||
      isInEndedPeriod({
        reactivatedAt: relationship.reactivatedAt,
        loggedAt: measurement.observedAt,
        localDate: formatLocalDate(new Date(measurement.observedAt), timeZone),
        timeZone,
      })
    ) {
      return fail(
        c,
        422,
        LOG_TIME_ERROR_CODES.ended_period,
        LOG_TIME_ERROR_MESSAGES.ended_period,
      );
    }

    const nextValue = parsed.data.value ?? measurement.value;
    const nextUnit = parsed.data.unit ?? measurement.unit;
    if (
      nextValue === measurement.value &&
      nextUnit === measurement.unit &&
      Date.parse(nextObservedAt) === Date.parse(measurement.observedAt)
    ) {
      // Nothing changed: no audit row, no notification, no new version.
      return ok(c, measurementSchema.parse(mapMeasurement(measurement)));
    }

    const nextVersion = measurement.recordVersion + 1;
    const saved = {
      ...measurement,
      value: nextValue,
      unit: nextUnit,
      observedAt: nextObservedAt,
      recordVersion: nextVersion,
      lastEditedByRole: "coach" as const,
      lastEditedByUserId: actor.userId,
      lastEditedAt: now,
      updatedAt: now,
    };
    try {
      await recordCoachLogChange(db, {
        domainWrites: () => [
          db
            .update(measurements)
            .set({
              value: nextValue,
              unit: nextUnit,
              observedAt: nextObservedAt,
              recordVersion: nextVersion,
              lastEditedByRole: "coach",
              lastEditedByUserId: actor.userId,
              lastEditedAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(measurements.id, measurement.id),
                eq(measurements.recordVersion, measurement.recordVersion),
              ),
            ),
        ],
        claim: {
          entity: "measurement",
          id: measurement.id,
          recordVersion: nextVersion,
        },
        entity: {
          type: "measurement",
          id: measurement.id,
          coachingRelationshipId: relationship.id,
          traineeUserId: relationship.traineeUserId,
          serverVersion: nextVersion,
          routing: {
            domainEntityType: "coaching_relationship",
            domainEntityId: relationship.id,
          },
        },
        action: "edit",
        actorUserId: actor.userId,
        before: measurementLogSnapshot({
          localDate: formatLocalDate(new Date(measurement.observedAt), timeZone),
          measurement,
        }),
        after: measurementLogSnapshot({ localDate: nextLocalDate, measurement: saved }),
        now,
        push: coachPushConfig(c.env),
      });
    } catch (error) {
      if (error instanceof CoachLogConflict) {
        if (error.kind === "version") return coachMeasurementVersionConflict(c);
        return measurementLogWriteConflict(c);
      }
      throw error;
    }
    return ok(c, measurementSchema.parse(mapMeasurement(saved)));
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
    const writableMeasurement = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writableMeasurement.ok) return writableMeasurement.response;

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
