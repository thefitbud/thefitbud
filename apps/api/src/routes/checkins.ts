import {
  operation,
  dateWindowParameters,
} from "../openapi/document";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  checkinListResponseSchema,
  checkinReviewContextSchema,
  checkinSchema,
  createTrainerNoteRequestSchema,
  localDateSchema,
  recordCheckinReviewRequestSchema,
  saveCheckinDraftRequestSchema,
  scheduleCheckinRequestSchema,
  scheduleCheckinResponseSchema,
  scheduleNextCheckinRequestSchema,
  submitCheckinRequestSchema,
  trainerCheckinInboxResponseSchema,
  trainerNoteListResponseSchema,
  trainerNoteSchema,
  type CheckinDraftAnswers,
} from "@fitbud/contracts";
import {
  MVP_CHECKIN_DEFINITION_VERSION,
  addDaysToLocalDate,
  canRecordCheckinReview,
  canSaveCheckinDraft,
  canSubmitCheckin,
  checkinWindowForLocalDate,
  deriveMealAssignmentStatus,
  deriveWorkoutAssignmentStatus,
  formatLocalDate,
  missingRequiredCheckinAnswers,
  nextCheckinLocalDate,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  checkinReviews,
  checkinSchedules,
  checkins,
  coachingConfigurations,
  coachingRelationships,
  interventions,
  mealAssignments,
  mealCompliance,
  measurements,
  plans,
  planVersions,
  trainerNotes,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import {
  detectExceptionsForRelationship,
  listActiveExceptionsForRelationship,
} from "../domain/exceptions";
import { mapActiveExceptionSummary, mapCheckin, mapTrainerNote } from "../domain/mappers";
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
import { queueRealtimeHint } from "../realtime/emit";
import { canAccessRelationship } from "./relationships";
import type { ActorContext, Env, Variables } from "../types";

const SCHEDULE_OPERATION = "checkin.schedule";
const SCHEDULE_NEXT_OPERATION = "checkin.schedule_next";
const ENSURE_DUE_OPERATION = "checkin.ensure_due";
const SUBMIT_OPERATION = "checkin.submit";
const REVIEW_OPERATION = "checkin.review";
const NOTE_OPERATION = "checkin.note.create";

export const checkinRoutes = new Hono<{
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

async function loadActiveCheckinSchedule(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      configuration: coachingConfigurations,
      schedule: checkinSchedules,
    })
    .from(coachingConfigurations)
    .innerJoin(
      checkinSchedules,
      eq(checkinSchedules.coachingConfigurationId, coachingConfigurations.id),
    )
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function loadTraineeTimezone(db: Db, traineeUserId: string) {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, traineeUserId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
}

async function loadCheckinWithReview(db: Db, checkinId: string) {
  const checkinRows = await db
    .select()
    .from(checkins)
    .where(eq(checkins.id, checkinId))
    .limit(1);
  const checkin = checkinRows[0];
  if (!checkin) return null;

  const reviewRows = await db
    .select()
    .from(checkinReviews)
    .where(eq(checkinReviews.checkinId, checkin.id))
    .limit(1);

  return {
    checkin,
    review: reviewRows[0] ?? null,
  };
}

function requireIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

function serializeAnswers(
  answers: CheckinDraftAnswers | null | undefined,
): string | null {
  if (!answers) return null;
  return JSON.stringify(answers);
}

async function createCheckinForLocalDate(
  db: Db,
  input: {
    relationshipId: string;
    scheduleId: string;
    localDate: string;
    timeZone: string;
    dueWindowHours: number;
  },
): Promise<{
  row: typeof checkins.$inferSelect;
  created: boolean;
}> {
  const existing = await db
    .select()
    .from(checkins)
    .where(
      and(
        eq(checkins.coachingRelationshipId, input.relationshipId),
        eq(checkins.localDate, input.localDate),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return { row: existing[0], created: false };
  }

  const window = checkinWindowForLocalDate({
    localDate: input.localDate,
    timeZone: input.timeZone,
    dueWindowHours: input.dueWindowHours,
  });
  const now = nowIso();
  const row = {
    id: createId(),
    coachingRelationshipId: input.relationshipId,
    checkinScheduleId: input.scheduleId,
    localDate: input.localDate,
    windowStartsAt: window.windowStartsAt,
    windowEndsAt: window.windowEndsAt,
    recordStatus: "draft" as const,
    recordVersion: 0,
    definitionVersion: MVP_CHECKIN_DEFINITION_VERSION,
    answersJson: null,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(checkins).values(row);
  return { row, created: true };
}

async function resolveScheduleLocalDate(
  db: Db,
  input: {
    relationshipId: string;
    cadence: "weekly" | "biweekly" | "monthly";
    explicitLocalDate?: string;
    fromCheckinId?: string;
    traineeTimeZone: string;
  },
): Promise<string> {
  if (input.explicitLocalDate) return input.explicitLocalDate;

  if (input.fromCheckinId) {
    const source = await db
      .select()
      .from(checkins)
      .where(eq(checkins.id, input.fromCheckinId))
      .limit(1);
    if (source[0]?.coachingRelationshipId === input.relationshipId) {
      return nextCheckinLocalDate({
        fromLocalDate: source[0].localDate,
        cadence: input.cadence,
      });
    }
  }

  const latest = await db
    .select()
    .from(checkins)
    .where(eq(checkins.coachingRelationshipId, input.relationshipId))
    .orderBy(desc(checkins.localDate), desc(checkins.createdAt))
    .limit(1);
  if (latest[0]) {
    return nextCheckinLocalDate({
      fromLocalDate: latest[0].localDate,
      cadence: input.cadence,
    });
  }

  return formatLocalDate(new Date(), input.traineeTimeZone);
}

checkinRoutes.post(
  "/relationships/:relationshipId/schedule",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/relationships/:relationshipId/schedule.",
    description: "Checkins operation for POST /checkins/relationships/:relationshipId/schedule.",
    roles: ["trainer"],
    idempotency: true,
    body: scheduleCheckinRequestSchema,
    response: scheduleCheckinResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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

    const parsed = scheduleCheckinRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid schedule request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SCHEDULE_OPERATION,
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
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const config = await loadActiveCheckinSchedule(db, relationship.id);
    if (!config) {
      return fail(
        c,
        422,
        "NO_ACTIVE_CONFIGURATION",
        "An active coaching configuration is required to schedule check-ins.",
      );
    }

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const { row, created } = await createCheckinForLocalDate(db, {
      relationshipId: relationship.id,
      scheduleId: config.schedule.id,
      localDate: parsed.data.localDate,
      timeZone: timezone,
      dueWindowHours: config.schedule.dueWindowHours,
    });

    const responseBody = {
      data: scheduleCheckinResponseSchema.parse({
        checkin: mapCheckin(row, null, nowIso()),
        created,
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SCHEDULE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

checkinRoutes.post(
  "/relationships/:relationshipId/schedule-next",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/relationships/:relationshipId/schedule-next.",
    description: "Checkins operation for POST /checkins/relationships/:relationshipId/schedule-next.",
    roles: ["trainer"],
    idempotency: true,
    body: scheduleNextCheckinRequestSchema,
    response: scheduleCheckinResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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

    const parsed = scheduleNextCheckinRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid schedule-next request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SCHEDULE_NEXT_OPERATION,
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
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const config = await loadActiveCheckinSchedule(db, relationship.id);
    if (!config) {
      return fail(
        c,
        422,
        "NO_ACTIVE_CONFIGURATION",
        "An active coaching configuration is required to schedule check-ins.",
      );
    }

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const localDate = await resolveScheduleLocalDate(db, {
      relationshipId: relationship.id,
      cadence: config.schedule.cadence,
      explicitLocalDate: parsed.data.localDate,
      fromCheckinId: parsed.data.fromCheckinId,
      traineeTimeZone: timezone,
    });

    const { row, created } = await createCheckinForLocalDate(db, {
      relationshipId: relationship.id,
      scheduleId: config.schedule.id,
      localDate,
      timeZone: timezone,
      dueWindowHours: config.schedule.dueWindowHours,
    });

    const responseBody = {
      data: scheduleCheckinResponseSchema.parse({
        checkin: mapCheckin(row, null, nowIso()),
        created,
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SCHEDULE_NEXT_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

checkinRoutes.post(
  "/relationships/:relationshipId/ensure-due",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/relationships/:relationshipId/ensure-due.",
    description: "Checkins operation for POST /checkins/relationships/:relationshipId/ensure-due.",
    roles: ["trainer", "trainee"],
    idempotency: true,
    response: scheduleCheckinResponseSchema,
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

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({ relationshipId: c.req.param("relationshipId") }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ENSURE_DUE_OPERATION,
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

    const config = await loadActiveCheckinSchedule(db, relationship.id);
    if (!config) {
      return fail(
        c,
        422,
        "NO_ACTIVE_CONFIGURATION",
        "An active coaching configuration is required to schedule check-ins.",
      );
    }

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const today = formatLocalDate(new Date(), timezone);

    const openDraft = await db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationship.id),
          eq(checkins.recordStatus, "draft"),
        ),
      )
      .orderBy(asc(checkins.localDate))
      .limit(1);

    let result: { row: typeof checkins.$inferSelect; created: boolean };
    if (openDraft[0]) {
      result = { row: openDraft[0], created: false };
    } else {
      const latest = await db
        .select()
        .from(checkins)
        .where(eq(checkins.coachingRelationshipId, relationship.id))
        .orderBy(desc(checkins.localDate))
        .limit(1);

      let dueLocalDate = today;
      if (latest[0]) {
        const next = nextCheckinLocalDate({
          fromLocalDate: latest[0].localDate,
          cadence: config.schedule.cadence,
        });
        if (next > today) {
          const reviewRows = await db
            .select()
            .from(checkinReviews)
            .where(eq(checkinReviews.checkinId, latest[0].id))
            .limit(1);
          const responseBody = {
            data: scheduleCheckinResponseSchema.parse({
              checkin: mapCheckin(latest[0], reviewRows[0] ?? null, nowIso()),
              created: false,
            }),
          };
          await saveIdempotencyRecord(db, {
            actorUserId: actor.userId,
            operation: ENSURE_DUE_OPERATION,
            idempotencyKey,
            requestFingerprint: fingerprint,
            responseStatus: 200,
            responseBody,
            expiresAt: addDaysIso(7),
          });
          return c.json(responseBody, 200);
        }
        dueLocalDate = next;
      }

      result = await createCheckinForLocalDate(db, {
        relationshipId: relationship.id,
        scheduleId: config.schedule.id,
        localDate: dueLocalDate,
        timeZone: timezone,
        dueWindowHours: config.schedule.dueWindowHours,
      });
    }

    const reviewRows = await db
      .select()
      .from(checkinReviews)
      .where(eq(checkinReviews.checkinId, result.row.id))
      .limit(1);

    const responseBody = {
      data: scheduleCheckinResponseSchema.parse({
        checkin: mapCheckin(result.row, reviewRows[0] ?? null, nowIso()),
        created: result.created,
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: ENSURE_DUE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

checkinRoutes.get(
  "/relationships/:relationshipId",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for GET /checkins/relationships/:relationshipId.",
    description: "Checkins operation for GET /checkins/relationships/:relationshipId.",
    roles: ["trainer", "trainee"],
    parameters: [
      ...dateWindowParameters(),
    ],
    response: checkinListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer", "trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const fromDate = c.req.query("fromDate");
    const toDate = c.req.query("toDate");
    if (fromDate) {
      const parsed = localDateSchema.safeParse(fromDate);
      if (!parsed.success) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid fromDate.");
      }
    }
    if (toDate) {
      const parsed = localDateSchema.safeParse(toDate);
      if (!parsed.success) {
        return fail(c, 400, "INVALID_REQUEST", "Invalid toDate.");
      }
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

    const conditions = [eq(checkins.coachingRelationshipId, relationship.id)];
    if (fromDate) conditions.push(gte(checkins.localDate, fromDate));
    if (toDate) conditions.push(lte(checkins.localDate, toDate));

    const rows = await db
      .select({
        checkin: checkins,
        review: checkinReviews,
      })
      .from(checkins)
      .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
      .where(and(...conditions))
      .orderBy(desc(checkins.localDate), desc(checkins.createdAt));

    const now = nowIso();
    return ok(
      c,
      checkinListResponseSchema.parse({
        items: rows.map((row) =>
          mapCheckin(row.checkin, row.review ?? null, now),
        ),
        nextCursor: null,
      }),
    );
  },
);

checkinRoutes.get(
  "/relationships/:relationshipId/notes",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for GET /checkins/relationships/:relationshipId/notes.",
    description: "Checkins operation for GET /checkins/relationships/:relationshipId/notes.",
    roles: ["trainer"],
    response: trainerNoteListResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const rows = await db
      .select()
      .from(trainerNotes)
      .where(eq(trainerNotes.coachingRelationshipId, relationship.id))
      .orderBy(desc(trainerNotes.createdAt));

    return ok(
      c,
      trainerNoteListResponseSchema.parse({
        items: rows.map(mapTrainerNote),
        nextCursor: null,
      }),
    );
  },
);

checkinRoutes.post(
  "/relationships/:relationshipId/notes",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/relationships/:relationshipId/notes.",
    description: "Checkins operation for POST /checkins/relationships/:relationshipId/notes.",
    roles: ["trainer"],
    idempotency: true,
    body: createTrainerNoteRequestSchema,
    response: trainerNoteSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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

    const parsed = createTrainerNoteRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid note request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: NOTE_OPERATION,
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
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    if (parsed.data.checkinId) {
      const linked = await loadCheckinWithReview(db, parsed.data.checkinId);
      if (
        !linked ||
        linked.checkin.coachingRelationshipId !== relationship.id
      ) {
        return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
      }
    }

    const now = nowIso();
    const row = {
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      checkinId: parsed.data.checkinId ?? null,
      body: parsed.data.body,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(trainerNotes).values(row);

    await db.insert(interventions).values({
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      kind: "note",
      exceptionId: null,
      checkinId: row.checkinId,
      resultingPlanVersionId: null,
      summary: "Trainer note recorded",
      createdAt: now,
      updatedAt: now,
    });

    const responseBody = {
      data: trainerNoteSchema.parse(mapTrainerNote(row)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: NOTE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

checkinRoutes.get(
  "/inbox",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for GET /checkins/inbox.",
    description: "Checkins operation for GET /checkins/inbox.",
    roles: ["trainer"],
    response: trainerCheckinInboxResponseSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const rows = await db
      .select({
        checkin: checkins,
        review: checkinReviews,
        relationship: coachingRelationships,
      })
      .from(checkins)
      .innerJoin(
        coachingRelationships,
        eq(coachingRelationships.id, checkins.coachingRelationshipId),
      )
      .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
      .where(eq(coachingRelationships.trainerUserId, actor.userId))
      .orderBy(desc(checkins.localDate), desc(checkins.createdAt));

    const now = nowIso();
    const items = rows
      .map((row) => ({
        checkin: mapCheckin(row.checkin, row.review ?? null, now),
        coachingRelationshipId: row.relationship.id,
        traineeUserId: row.relationship.traineeUserId,
      }))
      .filter((item) =>
        ["due", "overdue", "submitted"].includes(item.checkin.status),
      );

    return ok(
      c,
      trainerCheckinInboxResponseSchema.parse({
        items,
        nextCursor: null,
      }),
    );
  },
);

checkinRoutes.get(
  "/:checkinId",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for GET /checkins/:checkinId.",
    description: "Checkins operation for GET /checkins/:checkinId.",
    roles: ["trainer", "trainee"],
    response: checkinSchema,
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
    const loaded = await loadCheckinWithReview(db, c.req.param("checkinId"));
    if (!loaded) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.checkin.coachingRelationshipId,
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    return ok(
      c,
      checkinSchema.parse(mapCheckin(loaded.checkin, loaded.review, nowIso())),
    );
  },
);

checkinRoutes.get(
  "/:checkinId/review-context",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for GET /checkins/:checkinId/review-context.",
    description: "Checkins operation for GET /checkins/:checkinId/review-context.",
    roles: ["trainer"],
    response: checkinReviewContextSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const db = createDb(c.env.DB);
    const loaded = await loadCheckinWithReview(db, c.req.param("checkinId"));
    if (!loaded) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.checkin.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const now = nowIso();
    const mappedCheckin = mapCheckin(loaded.checkin, loaded.review, now);
    const fromDate = addDaysToLocalDate(loaded.checkin.localDate, -14);
    const toDate = loaded.checkin.localDate;

    const workoutRows = await db
      .select({
        assignment: workoutAssignments,
        execution: workoutExecutions,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, relationship.id),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
          gte(workoutAssignments.localDate, fromDate),
          lte(workoutAssignments.localDate, toDate),
        ),
      );

    const recentWorkoutAdherence = {
      completed: 0,
      missed: 0,
      modified: 0,
      skipped: 0,
      pending: 0,
    };
    for (const row of workoutRows) {
      const status = deriveWorkoutAssignmentStatus({
        nowIso: now,
        windowEndsAt: row.assignment.windowEndsAt,
        executionStatus: row.execution?.status ?? null,
      });
      if (status === "completed") recentWorkoutAdherence.completed += 1;
      else if (status === "missed") recentWorkoutAdherence.missed += 1;
      else if (status === "modified") recentWorkoutAdherence.modified += 1;
      else if (status === "skipped") recentWorkoutAdherence.skipped += 1;
      else recentWorkoutAdherence.pending += 1;
    }

    const mealRows = await db
      .select({
        assignment: mealAssignments,
        compliance: mealCompliance,
      })
      .from(mealAssignments)
      .leftJoin(
        mealCompliance,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, relationship.id),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          gte(mealAssignments.localDate, fromDate),
          lte(mealAssignments.localDate, toDate),
        ),
      );

    const recentMealCompliance = {
      confirmed: 0,
      modified: 0,
      skipped: 0,
      overdue: 0,
      pending: 0,
    };
    for (const row of mealRows) {
      const status = deriveMealAssignmentStatus({
        nowIso: now,
        windowEndsAt: row.assignment.windowEndsAt,
        complianceOutcome: row.compliance?.outcome ?? null,
        loggedAt: row.compliance?.loggedAt ?? null,
      });
      if (status === "confirmed" || status === "logged_later") {
        recentMealCompliance.confirmed += 1;
      } else if (status === "modified") recentMealCompliance.modified += 1;
      else if (status === "skipped") recentMealCompliance.skipped += 1;
      else if (status === "overdue") recentMealCompliance.overdue += 1;
      else recentMealCompliance.pending += 1;
    }

    const notes = await db
      .select()
      .from(trainerNotes)
      .where(eq(trainerNotes.coachingRelationshipId, relationship.id))
      .orderBy(desc(trainerNotes.createdAt))
      .limit(20);

    const effectivePlan = await db
      .select({
        plan: plans,
        version: planVersions,
      })
      .from(plans)
      .innerJoin(planVersions, eq(planVersions.planId, plans.id))
      .where(
        and(
          eq(plans.coachingRelationshipId, relationship.id),
          eq(planVersions.status, "effective"),
        ),
      )
      .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
      .limit(1);

    const config = await loadActiveCheckinSchedule(db, relationship.id);

    await detectExceptionsForRelationship(db, relationship.id, now);
    const activeExceptionRows = await listActiveExceptionsForRelationship(
      db,
      relationship.id,
    );

    const answers = mappedCheckin.answers;
    const measurementRows = await db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationship.id))
      .orderBy(desc(measurements.observedAt), desc(measurements.id))
      .limit(10);

    const measurementsForContext =
      measurementRows.length > 0
        ? measurementRows.map((row) => ({
            type: row.type,
            value: String(row.value),
            observedAt: row.observedAt,
          }))
        : answers?.bodyWeightKg != null
          ? [
              {
                type: "body_weight_kg",
                value: String(answers.bodyWeightKg),
                observedAt: mappedCheckin.submittedAt ?? mappedCheckin.updatedAt,
              },
            ]
          : [];

    return ok(
      c,
      checkinReviewContextSchema.parse({
        checkin: mappedCheckin,
        recentWorkoutAdherence,
        recentMealCompliance,
        activeExceptions: activeExceptionRows.map(mapActiveExceptionSummary),
        measurements: measurementsForContext,
        previousNotes: notes.map(mapTrainerNote),
        currentPlan: effectivePlan[0]
          ? {
              planId: effectivePlan[0].plan.id,
              planVersionId: effectivePlan[0].version.id,
              title: effectivePlan[0].plan.title,
              versionNumber: effectivePlan[0].version.versionNumber,
              effectiveFrom: effectivePlan[0].version.effectiveFrom,
            }
          : null,
        currentConfiguration: config
          ? {
              id: config.configuration.id,
              goalShort: config.configuration.goalShort,
              goalDescription: config.configuration.goalDescription,
              checkinCadence: config.schedule.cadence,
              dueWindowHours: config.schedule.dueWindowHours,
            }
          : null,
      }),
    );
  },
);

checkinRoutes.put(
  "/:checkinId/draft",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for PUT /checkins/:checkinId/draft.",
    description: "Checkins operation for PUT /checkins/:checkinId/draft.",
    roles: ["trainee"],
    body: saveCheckinDraftRequestSchema,
    response: checkinSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const parsed = saveCheckinDraftRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid draft request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const loaded = await loadCheckinWithReview(db, c.req.param("checkinId"));
    if (!loaded) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.checkin.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    if (!canSaveCheckinDraft({ recordStatus: loaded.checkin.recordStatus })) {
      return fail(
        c,
        409,
        "CHECKIN_ALREADY_SUBMITTED",
        "Submitted check-ins cannot be edited.",
      );
    }

    if (loaded.checkin.recordVersion !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "CHECKIN_VERSION_CONFLICT",
        "The check-in was changed after this version was loaded.",
      );
    }

    const now = nowIso();
    const nextVersion = loaded.checkin.recordVersion + 1;
    await db
      .update(checkins)
      .set({
        answersJson: serializeAnswers(parsed.data.answers),
        recordVersion: nextVersion,
        updatedAt: now,
      })
      .where(eq(checkins.id, loaded.checkin.id));

    const refreshed = await loadCheckinWithReview(db, loaded.checkin.id);
    return ok(
      c,
      checkinSchema.parse(
        mapCheckin(refreshed!.checkin, refreshed!.review, now),
      ),
    );
  },
);

checkinRoutes.post(
  "/:checkinId/submit",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/:checkinId/submit.",
    description: "Checkins operation for POST /checkins/:checkinId/submit.",
    roles: ["trainee"],
    idempotency: true,
    body: submitCheckinRequestSchema,
    response: checkinSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
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

    const parsed = submitCheckinRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid submit request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        checkinId: c.req.param("checkinId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SUBMIT_OPERATION,
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

    const loaded = await loadCheckinWithReview(db, c.req.param("checkinId"));
    if (!loaded) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.checkin.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const now = nowIso();
    if (
      !canSubmitCheckin({
        recordStatus: loaded.checkin.recordStatus,
        nowIso: now,
        windowStartsAt: loaded.checkin.windowStartsAt,
      })
    ) {
      return fail(
        c,
        422,
        "CHECKIN_NOT_SUBMITTABLE",
        "This check-in is not open for submission yet, or was already submitted.",
      );
    }

    if (loaded.checkin.recordVersion !== parsed.data.expectedVersion) {
      return fail(
        c,
        409,
        "CHECKIN_VERSION_CONFLICT",
        "The check-in was changed after this version was loaded.",
      );
    }

    const missing = missingRequiredCheckinAnswers(parsed.data.answers);
    if (missing.length > 0) {
      return fail(
        c,
        422,
        "CHECKIN_ANSWERS_INCOMPLETE",
        "Required check-in answers are missing.",
        { missing },
      );
    }

    const nextVersion = loaded.checkin.recordVersion + 1;
    await db
      .update(checkins)
      .set({
        answersJson: serializeAnswers(parsed.data.answers),
        recordStatus: "submitted",
        recordVersion: nextVersion,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(checkins.id, loaded.checkin.id));

    if (parsed.data.answers.bodyWeightKg != null) {
      await db.insert(measurements).values({
        id: createId(),
        coachingRelationshipId: relationship.id,
        traineeUserId: actor.userId,
        type: "body_weight_kg",
        value: parsed.data.answers.bodyWeightKg,
        unit: "kg",
        observedAt: now,
        source: "checkin",
        checkinId: loaded.checkin.id,
        mediaAssetId: null,
        recordVersion: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    const refreshed = await loadCheckinWithReview(db, loaded.checkin.id);
    const responseBody = {
      data: checkinSchema.parse(
        mapCheckin(refreshed!.checkin, refreshed!.review, now),
      ),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SUBMIT_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    queueRealtimeHint(c.env, {
      eventType: "checkin_submitted",
      entityType: "checkin",
      entityId: responseBody.data.id,
      coachingRelationshipId: relationship.id,
      serverVersion: responseBody.data.recordVersion,
    });
    return c.json(responseBody, 200);
  },
);

checkinRoutes.post(
  "/:checkinId/review",
  operation({
    tag: "Checkins",
    summary: "Checkins operation for POST /checkins/:checkinId/review.",
    description: "Checkins operation for POST /checkins/:checkinId/review.",
    roles: ["trainer"],
    idempotency: true,
    body: recordCheckinReviewRequestSchema,
    response: checkinSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
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

    const parsed = recordCheckinReviewRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid review request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        checkinId: c.req.param("checkinId"),
        ...parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: REVIEW_OPERATION,
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

    const loaded = await loadCheckinWithReview(db, c.req.param("checkinId"));
    if (!loaded) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.checkin.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.trainerUserId !== actor.userId) {
      return fail(c, 404, "CHECKIN_NOT_FOUND", "Check-in not found.");
    }

    if (
      !canRecordCheckinReview({
        recordStatus: loaded.checkin.recordStatus,
        hasReview: Boolean(loaded.review),
      })
    ) {
      return fail(
        c,
        422,
        "CHECKIN_NOT_REVIEWABLE",
        "Only submitted check-ins without a review can be reviewed.",
      );
    }

    const now = nowIso();
    const reviewRow = {
      id: createId(),
      checkinId: loaded.checkin.id,
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(checkinReviews).values(reviewRow);

    await db.insert(interventions).values({
      id: createId(),
      coachingRelationshipId: relationship.id,
      trainerUserId: actor.userId,
      kind: "note",
      exceptionId: null,
      checkinId: loaded.checkin.id,
      resultingPlanVersionId: null,
      summary: `Check-in review: ${parsed.data.outcome}`,
      createdAt: now,
      updatedAt: now,
    });

    const responseBody = {
      data: checkinSchema.parse(mapCheckin(loaded.checkin, reviewRow, now)),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: REVIEW_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    queueRealtimeHint(c.env, {
      eventType: "checkin_reviewed",
      entityType: "checkin",
      entityId: responseBody.data.id,
      coachingRelationshipId: relationship.id,
      serverVersion: responseBody.data.recordVersion,
    });
    return c.json(responseBody, 200);
  },
);
