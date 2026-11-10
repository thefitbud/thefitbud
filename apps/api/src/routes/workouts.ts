import {
  operation,
  dateWindowParameters,
} from "../openapi/document";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  coachEditWorkoutRequestSchema,
  coachLogWorkoutRequestSchema,
  completeSetRequestSchema,
  completeWorkoutRequestSchema,
  generateWorkoutAssignmentsRequestSchema,
  generateWorkoutAssignmentsResponseSchema,
  localDateSchema,
  skipWorkoutRequestSchema,
  startWorkoutRequestSchema,
  workoutAdherenceResponseSchema,
  workoutAssignmentListResponseSchema,
  workoutAssignmentSchema,
  workoutExecutionSchema,
  type WorkoutDay,
} from "@fitbud/contracts";
import {
  canCompleteWorkoutExecution,
  canMutateOpenWorkoutExecution,
  canPauseWorkoutExecution,
  canResumeWorkoutExecution,
  canSkipAssignedWorkout,
  canSkipOpenWorkoutExecution,
  canStartWorkoutAssignment,
  formatLocalDate,
  isOpenWorkoutExecution,
  isQualifyingWorkoutExecution,
  resolveCompletedWorkoutStatus,
  setCompletionIsModified,
} from "@fitbud/core";
import { createDb } from "../db/client";
import {
  coachingConfigurations,
  coachingRelationships,
  exerciseExecutions,
  plans,
  planVersions,
  setExecutions,
  trackingRequirements,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
} from "../db/schema";
import {
  mapWorkoutAssignment,
  mapWorkoutExecution,
  parsePlanContentJson,
  parseWorkoutDayJson,
} from "../domain/mappers";
import { resolveSetLoad } from "../domain/load-parser.js";
import {
  insertWorkoutAssignments,
  loadTraineeTimezone,
  resolveGenerationRange,
} from "../domain/assignment-schedule";
import {
  COACH_LOG_BACKDATE_ERROR,
  LOG_TIME_ERROR_CODES,
  LOG_TIME_ERROR_MESSAGES,
  assertLogTimeWithinBounds,
  isInEndedPeriod,
  isWithinCoachLogWindow,
  resolveLogInstant,
} from "../domain/log-time-bounds.js";
import { recordCoachLogChange, workoutLogSnapshot } from "../domain/coach-log.js";
import { resolvePushProviderMode } from "../lib/push-provider.js";
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import type { AppContext } from "../lib/envelope";
import { fail, ok } from "../lib/envelope";
import {
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "../lib/idempotency";
import { requireWritableRelationship } from "../lib/relationship-write-guard.js";
import {
  RelationshipEndedError,
  assertRelationshipWritable,
} from "../domain/relationship-lifecycle.js";
import {
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole,
} from "../middleware/auth";
import { queueRealtimeHint } from "../realtime/emit";
import { canAccessRelationship } from "./relationships";
import type { ActorContext, Env, Variables } from "../types";

const GENERATE_OPERATION = "workout.assignments.generate";
const START_OPERATION = "workout.execution.start";
const COMPLETE_OPERATION = "workout.execution.complete";
const SKIP_OPERATION = "workout.execution.skip";

export const workoutRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

type Db = ReturnType<typeof createDb>;

function emitWorkoutExecutionChanged(
  env: Env,
  execution: {
    id: string;
    coachingRelationshipId: string;
    recordVersion: number;
  },
): void {
  queueRealtimeHint(env, {
    eventType: "workout_execution_changed",
    entityType: "workout_execution",
    entityId: execution.id,
    coachingRelationshipId: execution.coachingRelationshipId,
    serverVersion: execution.recordVersion,
  });
}

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

/**
 * EC1 rule 1: after a reactivation, a workout dated before the reactivation
 * day, or a session started before the reactivation, belongs to the frozen
 * ended period and cannot be started, skipped or continued.
 */
async function workoutInEndedPeriod(
  db: Db,
  input: {
    relationship: { reactivatedAt: string | null; traineeUserId: string };
    localDate: string;
    loggedAt: string;
  },
): Promise<boolean> {
  if (!input.relationship.reactivatedAt) return false;
  return isInEndedPeriod({
    reactivatedAt: input.relationship.reactivatedAt,
    loggedAt: input.loggedAt,
    localDate: input.localDate,
    timeZone: await loadTraineeTimezone(db, input.relationship.traineeUserId),
  });
}

function endedPeriodError(c: AppContext) {
  return fail(
    c,
    422,
    LOG_TIME_ERROR_CODES.ended_period,
    LOG_TIME_ERROR_MESSAGES.ended_period,
  );
}

async function loadEffectivePlanVersion(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      plan: plans,
      version: planVersions,
    })
    .from(plans)
    .innerJoin(planVersions, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "effective"),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
    .limit(1);
  return rows[0] ?? null;
}

async function loadActiveWorkoutConfig(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      configuration: coachingConfigurations,
      workout: workoutExpectations,
      tracking: trackingRequirements,
    })
    .from(coachingConfigurations)
    .innerJoin(
      workoutExpectations,
      eq(
        workoutExpectations.coachingConfigurationId,
        coachingConfigurations.id,
      ),
    )
    .innerJoin(
      trackingRequirements,
      eq(
        trackingRequirements.coachingConfigurationId,
        coachingConfigurations.id,
      ),
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

async function loadExecutionBundle(db: Db, executionId: string) {
  const executionRows = await db
    .select()
    .from(workoutExecutions)
    .where(eq(workoutExecutions.id, executionId))
    .limit(1);
  const execution = executionRows[0];
  if (!execution) return null;

  const exercises = await db
    .select()
    .from(exerciseExecutions)
    .where(eq(exerciseExecutions.workoutExecutionId, execution.id))
    .orderBy(asc(exerciseExecutions.order));

  const allSets: (typeof setExecutions.$inferSelect)[] = [];
  for (const exercise of exercises) {
    const exerciseSets = await db
      .select()
      .from(setExecutions)
      .where(eq(setExecutions.exerciseExecutionId, exercise.id))
      .orderBy(asc(setExecutions.order));
    allSets.push(...exerciseSets);
  }

  return { execution, exercises, sets: allSets };
}

type ExecutionBundle = NonNullable<Awaited<ReturnType<typeof loadExecutionBundle>>>;

function mapExecution(bundle: ExecutionBundle) {
  return mapWorkoutExecution(bundle.execution, bundle.exercises, bundle.sets);
}

/**
 * The set-complete rule (Z6-15, D-W6-23), shared by the trainee's set
 * complete and the trainer's log and edit: a numeric kg wins over a label and
 * is rounded to hundredths; a kg equal to the prescribed kg is `completed`;
 * otherwise `setCompletionIsModified` decides. Omitted reps or load keep the
 * prescribed values (no re-entry).
 */
function resolveSetCompletion(
  setRow: { prescribedReps: number | null; prescribedLoadLabel: string | null },
  input: {
    actualReps?: number | null;
    actualLoadLabel?: string | null;
    actualLoadKg?: number;
  },
) {
  const actualReps =
    input.actualReps === undefined ? setRow.prescribedReps : input.actualReps;
  // Round to hundredths so the label and column carry no float artefacts.
  const numericKg =
    input.actualLoadKg === undefined
      ? undefined
      : Math.round(input.actualLoadKg * 100) / 100;
  const actualLoadLabel =
    numericKg !== undefined
      ? `${numericKg} kg`
      : input.actualLoadLabel === undefined
        ? setRow.prescribedLoadLabel
        : input.actualLoadLabel;

  // Numeric columns (Z6-15): a numeric kg wins over the label; else parse the label.
  const labelLoad = resolveSetLoad({
    prescribedLoadLabel: setRow.prescribedLoadLabel,
    actualLoadLabel,
  });
  const loadColumns =
    numericKg !== undefined
      ? {
          prescribedLoadKg: labelLoad.prescribedLoadKg,
          actualLoadKg: numericKg,
          loadKind: "kg" as const,
        }
      : labelLoad;

  // A numeric load equal to the prescribed kg load is not a change.
  const sameAsPrescribed =
    numericKg !== undefined &&
    labelLoad.prescribedLoadKg === numericKg &&
    resolveSetLoad({
      prescribedLoadLabel: setRow.prescribedLoadLabel,
      actualLoadLabel: null,
    }).loadKind === "kg";
  const modified = setCompletionIsModified({
    prescribedReps: setRow.prescribedReps,
    prescribedLoadLabel: setRow.prescribedLoadLabel,
    actualReps,
    actualLoadLabel: sameAsPrescribed
      ? setRow.prescribedLoadLabel
      : actualLoadLabel,
  });

  return {
    status: modified ? ("modified" as const) : ("completed" as const),
    actualReps,
    actualLoadLabel,
    loadColumns,
  };
}

function coachLoggedReadOnlyError(c: AppContext) {
  return fail(
    c,
    409,
    "COACH_LOGGED_READ_ONLY",
    "This workout was logged by your coach and cannot be changed.",
  );
}

async function loadAssignmentWithExecution(db: Db, assignmentId: string) {
  const assignmentRows = await db
    .select()
    .from(workoutAssignments)
    .where(eq(workoutAssignments.id, assignmentId))
    .limit(1);
  const assignment = assignmentRows[0];
  if (!assignment) return null;

  const executionRows = await db
    .select()
    .from(workoutExecutions)
    .where(eq(workoutExecutions.assignmentId, assignment.id))
    .limit(1);

  return {
    assignment,
    execution: executionRows[0] ?? null,
  };
}

function requireIdempotencyKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const key = c.req.header("Idempotency-Key")?.trim();
  return key && key.length > 0 ? key : null;
}

workoutRoutes.post(
  "/relationships/:relationshipId/assignments/generate",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/relationships/:relationshipId/assignments/generate.",
    description: "Workouts operation for POST /workouts/relationships/:relationshipId/assignments/generate.",
    roles: ["trainer", "trainee"],
    idempotency: true,
    body: generateWorkoutAssignmentsRequestSchema,
    response: generateWorkoutAssignmentsResponseSchema,
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

    const parsed = generateWorkoutAssignmentsRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid generate request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(JSON.stringify(parsed.data));
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: GENERATE_OPERATION,
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
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
    }

    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }
    const writable = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writable.ok) {
      return writable.response;
    }

    const effective = await loadEffectivePlanVersion(db, relationship.id);
    if (!effective) {
      return fail(
        c,
        422,
        "NO_EFFECTIVE_PLAN",
        "An effective plan is required to generate workout assignments.",
      );
    }

    const config = await loadActiveWorkoutConfig(db, relationship.id);
    if (!config) {
      return fail(
        c,
        422,
        "NO_ACTIVE_CONFIGURATION",
        "An active coaching configuration is required to generate assignments.",
      );
    }

    const content = parsePlanContentJson(effective.version.contentJson);
    if (content.workoutDays.length === 0) {
      return fail(
        c,
        422,
        "NO_WORKOUT_DAYS",
        "The effective plan has no workout days.",
      );
    }

    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const today = formatLocalDate(new Date(), timeZone);
    const resolved = resolveGenerationRange({
      window: parsed.data.window,
      today,
      fromDate: parsed.data.fromDate,
      toDate: parsed.data.toDate,
      version: effective.version,
      timeZone,
    });
    if (!resolved.ok) {
      return fail(c, 400, "INVALID_DATE_RANGE", resolved.message);
    }
    const now = nowIso();
    const createdRows = await insertWorkoutAssignments(db, {
      relationshipId: relationship.id,
      planId: effective.plan.id,
      planVersionId: effective.version.id,
      content,
      timeZone,
      completionWindowHours: config.workout.completionWindowHours,
      dates: resolved.dates,
      now,
    });

    const responseBody = {
      data: generateWorkoutAssignmentsResponseSchema.parse({
        created: createdRows.length,
        assignments: createdRows.map((row) =>
          mapWorkoutAssignment(row, null, now),
        ),
      }),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: GENERATE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    return c.json(responseBody, 200);
  },
);

workoutRoutes.get(
  "/relationships/:relationshipId/assignments",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for GET /workouts/relationships/:relationshipId/assignments.",
    description: "Workouts operation for GET /workouts/relationships/:relationshipId/assignments.",
    roles: ["trainer", "trainee"],
    parameters: [
      ...dateWindowParameters(),
    ],
    response: workoutAssignmentListResponseSchema,
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

    const conditions = [
      eq(workoutAssignments.coachingRelationshipId, relationship.id),
      eq(workoutAssignments.scheduleStatus, "scheduled"),
    ];
    if (fromDate) {
      conditions.push(gte(workoutAssignments.localDate, fromDate));
    }
    if (toDate) {
      conditions.push(lte(workoutAssignments.localDate, toDate));
    }

    const rows = await db
      .select({
        assignment: workoutAssignments,
        execution: workoutExecutions,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(and(...conditions))
      .orderBy(asc(workoutAssignments.localDate), asc(workoutAssignments.id));

    const now = nowIso();
    return ok(
      c,
      workoutAssignmentListResponseSchema.parse({
        items: rows.map((row) =>
          mapWorkoutAssignment(row.assignment, row.execution ?? null, now),
        ),
        nextCursor: null,
      }),
    );
  },
);

workoutRoutes.get(
  "/relationships/:relationshipId/adherence",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for GET /workouts/relationships/:relationshipId/adherence.",
    description: "Workouts operation for GET /workouts/relationships/:relationshipId/adherence.",
    roles: ["trainer", "trainee"],
    parameters: [
      ...dateWindowParameters(),
    ],
    response: workoutAdherenceResponseSchema,
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

    const db = createDb(c.env.DB);
    const relationship = await loadAccessibleRelationship(
      db,
      c.req.param("relationshipId"),
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "RELATIONSHIP_NOT_FOUND", "Relationship not found.");
    }

    const conditions = [
      eq(workoutAssignments.coachingRelationshipId, relationship.id),
      eq(workoutAssignments.scheduleStatus, "scheduled"),
    ];
    if (fromDate) conditions.push(gte(workoutAssignments.localDate, fromDate));
    if (toDate) conditions.push(lte(workoutAssignments.localDate, toDate));

    const rows = await db
      .select({
        assignment: workoutAssignments,
        execution: workoutExecutions,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(and(...conditions))
      .orderBy(desc(workoutAssignments.localDate), desc(workoutAssignments.id));

    const now = nowIso();
    const items = rows.map((row) => {
      const mapped = mapWorkoutAssignment(
        row.assignment,
        row.execution ?? null,
        now,
      );
      return {
        assignmentId: mapped.id,
        localDate: mapped.localDate,
        workoutDayName: mapped.workoutDayName,
        status: mapped.status,
        planVersionId: mapped.planVersionId,
        startedAt: mapped.execution?.startedAt ?? null,
        completedAt: mapped.execution?.completedAt ?? null,
        sessionRpe: mapped.execution?.sessionRpe ?? null,
      };
    });

    const totals = {
      assigned: 0,
      completed: 0,
      modified: 0,
      skipped: 0,
      missed: 0,
      inProgress: 0,
    };
    for (const item of items) {
      if (item.status === "assigned") totals.assigned += 1;
      else if (item.status === "completed") totals.completed += 1;
      else if (item.status === "modified") totals.modified += 1;
      else if (item.status === "skipped") totals.skipped += 1;
      else if (item.status === "missed") totals.missed += 1;
      else if (item.status === "in_progress" || item.status === "paused") {
        totals.inProgress += 1;
      }
    }

    return ok(
      c,
      workoutAdherenceResponseSchema.parse({ items, totals }),
    );
  },
);

workoutRoutes.get(
  "/assignments/:assignmentId",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for GET /workouts/assignments/:assignmentId.",
    description: "Workouts operation for GET /workouts/assignments/:assignmentId.",
    roles: ["trainer", "trainee"],
    response: workoutAssignmentSchema,
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
    const loaded = await loadAssignmentWithExecution(
      db,
      c.req.param("assignmentId"),
    );
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.assignment.coachingRelationshipId,
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    return ok(
      c,
      workoutAssignmentSchema.parse(
        mapWorkoutAssignment(loaded.assignment, loaded.execution, nowIso()),
      ),
    );
  },
);

workoutRoutes.post(
  "/assignments/:assignmentId/start",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/assignments/:assignmentId/start.",
    description: "Workouts operation for POST /workouts/assignments/:assignmentId/start.",
    roles: ["trainee"],
    idempotency: true,
    body: startWorkoutRequestSchema,
    bodyRequired: false,
    response: workoutExecutionSchema,
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

    const parsed = startWorkoutRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid start request.", {
        issues: parsed.error.issues,
      });
    }
    const clientLoggedAt = parsed.data.clientLoggedAt;

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        assignmentId: c.req.param("assignmentId"),
        clientLoggedAt: clientLoggedAt ?? null,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: START_OPERATION,
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
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
    }

    const loaded = await loadAssignmentWithExecution(
      db,
      c.req.param("assignmentId"),
    );
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.assignment.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    const writableStart = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writableStart.ok) return writableStart.response;

    const now = nowIso();
    const logInstant = resolveLogInstant({ clientLoggedAt, now });
    if (
      await workoutInEndedPeriod(db, {
        relationship,
        localDate: loaded.assignment.localDate,
        loggedAt: logInstant,
      })
    ) {
      return endedPeriodError(c);
    }
    if (loaded.execution?.loggedByRole === "coach") {
      return coachLoggedReadOnlyError(c);
    }
    const assignmentStatus = mapWorkoutAssignment(
      loaded.assignment,
      loaded.execution,
      now,
    ).status;

    if (loaded.execution && isOpenWorkoutExecution(loaded.execution.status)) {
      const bundle = await loadExecutionBundle(db, loaded.execution.id);
      const mapped = mapExecution(bundle!);
      const responseBody = { data: workoutExecutionSchema.parse(mapped) };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: START_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      return c.json(responseBody, 200);
    }

    if (
      loaded.execution &&
      isQualifyingWorkoutExecution(loaded.execution.status)
    ) {
      return fail(
        c,
        409,
        "WORKOUT_ALREADY_FINISHED",
        "This assignment already has a finished execution.",
      );
    }

    const startBounds = assertLogTimeWithinBounds({
      clientLoggedAt: logInstant,
      windowStart: loaded.assignment.windowStartsAt,
      now,
    });
    if (!startBounds.ok) {
      return fail(
        c,
        422,
        LOG_TIME_ERROR_CODES[startBounds.reason],
        LOG_TIME_ERROR_MESSAGES[startBounds.reason],
      );
    }

    if (
      !canStartWorkoutAssignment({
        assignmentStatus,
        hasOpenExecution: false,
      })
    ) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Workout cannot be started in the current state.",
      );
    }

    const config = await loadActiveWorkoutConfig(db, relationship.id);
    const requireSessionRpe = config?.tracking.requireSessionRpe ?? false;
    const workoutDay = parseWorkoutDayJson(
      loaded.assignment.workoutDayJson,
    ) as WorkoutDay;

    const executionId = createId();
    await db.insert(workoutExecutions).values({
      id: executionId,
      assignmentId: loaded.assignment.id,
      coachingRelationshipId: relationship.id,
      planVersionId: loaded.assignment.planVersionId,
      traineeUserId: actor.userId,
      status: "started",
      recordVersion: 0,
      startedAt: logInstant,
      pausedAt: null,
      completedAt: null,
      sessionRpe: null,
      requireSessionRpe,
      clientLoggedAt: clientLoggedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    for (const exercise of workoutDay.exercises
      .slice()
      .sort((a, b) => a.order - b.order)) {
      const exerciseId = createId();
      await db.insert(exerciseExecutions).values({
        id: exerciseId,
        workoutExecutionId: executionId,
        exerciseId: exercise.id,
        name: exercise.name,
        order: exercise.order,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
      for (const setTarget of exercise.setTargets
        .slice()
        .sort((a, b) => a.order - b.order)) {
        await db.insert(setExecutions).values({
          id: createId(),
          exerciseExecutionId: exerciseId,
          setTargetId: setTarget.id,
          order: setTarget.order,
          status: "pending",
          prescribedReps: setTarget.reps,
          prescribedLoadLabel: setTarget.loadLabel,
          actualReps: null,
          actualLoadLabel: null,
          ...resolveSetLoad({
            prescribedLoadLabel: setTarget.loadLabel,
            actualLoadLabel: null,
          }),
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const bundle = await loadExecutionBundle(db, executionId);
    const mapped = mapExecution(bundle!);
    const responseBody = { data: workoutExecutionSchema.parse(mapped) };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: START_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    emitWorkoutExecutionChanged(c.env, {
      id: mapped.id,
      coachingRelationshipId: relationship.id,
      recordVersion: mapped.recordVersion,
    });
    return c.json(responseBody, 200);
  },
);

async function requireTraineeOwnedOpenExecution(
  c: {
    get: (key: "actor") => ActorContext | undefined;
    env: Env;
  },
  executionId: string,
) {
  const actor = c.get("actor");
  if (!actor?.selectedRole) {
    return { errorStatus: "unauthenticated" as const };
  }
  const db = createDb(c.env.DB);
  const bundle = await loadExecutionBundle(db, executionId);
  if (!bundle) {
    return { errorStatus: "not_found" as const };
  }
  const relationship = await loadAccessibleRelationship(
    db,
    bundle.execution.coachingRelationshipId,
    actor,
  );
  if (
    !relationship ||
    relationship.traineeUserId !== actor.userId ||
    actor.selectedRole !== "trainee"
  ) {
    return { errorStatus: "not_found" as const };
  }
  try {
    await assertRelationshipWritable(db, relationship.id);
  } catch (error) {
    if (error instanceof RelationshipEndedError) {
      return { errorStatus: "ended" as const };
    }
    throw error;
  }
  if (relationship.reactivatedAt) {
    const [assignment] = await db
      .select({ localDate: workoutAssignments.localDate })
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, bundle.execution.assignmentId))
      .limit(1);
    if (
      assignment &&
      (await workoutInEndedPeriod(db, {
        relationship,
        localDate: assignment.localDate,
        loggedAt: bundle.execution.startedAt,
      }))
    ) {
      return { errorStatus: "ended_period" as const };
    }
  }
  // R1: an entry the coach created is read-only to the trainee.
  if (bundle.execution.loggedByRole === "coach") {
    return { errorStatus: "coach_logged" as const };
  }
  return { actor, db, bundle, relationship } as const;
}

type OwnershipFailure =
  | "unauthenticated"
  | "not_found"
  | "ended"
  | "ended_period"
  | "coach_logged";

function isOwnershipFailure(
  loaded: {
    errorStatus?: OwnershipFailure;
  },
): loaded is {
  errorStatus: OwnershipFailure;
} {
  return (
    loaded.errorStatus === "unauthenticated" ||
    loaded.errorStatus === "not_found" ||
    loaded.errorStatus === "ended" ||
    loaded.errorStatus === "ended_period" ||
    loaded.errorStatus === "coach_logged"
  );
}

function ownershipError(
  c: AppContext,
  loaded: { errorStatus: OwnershipFailure },
) {
  if (loaded.errorStatus === "ended_period") {
    return endedPeriodError(c);
  }
  if (loaded.errorStatus === "coach_logged") {
    return coachLoggedReadOnlyError(c);
  }
  if (loaded.errorStatus === "unauthenticated") {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }
  if (loaded.errorStatus === "ended") {
    return fail(
      c,
      409,
      "RELATIONSHIP_ENDED",
      "Coaching relationship has ended.",
    );
  }
  return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
}

workoutRoutes.post(
  "/executions/:executionId/pause",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/executions/:executionId/pause.",
    description: "Workouts operation for POST /workouts/executions/:executionId/pause.",
    roles: ["trainee"],
    response: workoutExecutionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const loaded = await requireTraineeOwnedOpenExecution(
      c,
      c.req.param("executionId"),
    );
    if (isOwnershipFailure(loaded)) return ownershipError(c, loaded);

    const { db, bundle } = loaded;
    if (!canPauseWorkoutExecution(bundle.execution.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Only a started workout can be paused.",
      );
    }

    const now = nowIso();
    await db
      .update(workoutExecutions)
      .set({
        status: "paused",
        pausedAt: now,
        recordVersion: bundle.execution.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(workoutExecutions.id, bundle.execution.id));

    const refreshed = await loadExecutionBundle(db, bundle.execution.id);
    const mapped = workoutExecutionSchema.parse(
      mapExecution(refreshed!),
    );
    emitWorkoutExecutionChanged(c.env, {
      id: mapped.id,
      coachingRelationshipId: refreshed!.execution.coachingRelationshipId,
      recordVersion: mapped.recordVersion,
    });
    return ok(c, mapped);
  },
);

workoutRoutes.post(
  "/executions/:executionId/resume",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/executions/:executionId/resume.",
    description: "Workouts operation for POST /workouts/executions/:executionId/resume.",
    roles: ["trainee"],
    response: workoutExecutionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const loaded = await requireTraineeOwnedOpenExecution(
      c,
      c.req.param("executionId"),
    );
    if (isOwnershipFailure(loaded)) return ownershipError(c, loaded);

    const { db, bundle } = loaded;
    if (!canResumeWorkoutExecution(bundle.execution.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Only a paused workout can be resumed.",
      );
    }

    const now = nowIso();
    await db
      .update(workoutExecutions)
      .set({
        status: "started",
        pausedAt: null,
        recordVersion: bundle.execution.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(workoutExecutions.id, bundle.execution.id));

    const refreshed = await loadExecutionBundle(db, bundle.execution.id);
    const mapped = workoutExecutionSchema.parse(
      mapExecution(refreshed!),
    );
    emitWorkoutExecutionChanged(c.env, {
      id: mapped.id,
      coachingRelationshipId: refreshed!.execution.coachingRelationshipId,
      recordVersion: mapped.recordVersion,
    });
    return ok(c, mapped);
  },
);

workoutRoutes.post(
  "/executions/:executionId/sets/:setExecutionId/complete",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/executions/:executionId/sets/:setExecutionId/complete.",
    description: "Workouts operation for POST /workouts/executions/:executionId/sets/:setExecutionId/complete.",
    roles: ["trainee"],
    body: completeSetRequestSchema,
    response: workoutExecutionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const loaded = await requireTraineeOwnedOpenExecution(
      c,
      c.req.param("executionId"),
    );
    if (isOwnershipFailure(loaded)) return ownershipError(c, loaded);

    const parsed = completeSetRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid set completion.", {
        issues: parsed.error.issues,
      });
    }

    const { db, bundle } = loaded;
    if (!canMutateOpenWorkoutExecution(bundle.execution.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Sets can only be completed during an open workout.",
      );
    }

    const setRow = bundle.sets.find(
      (set) => set.id === c.req.param("setExecutionId"),
    );
    if (!setRow) {
      return fail(c, 404, "SET_NOT_FOUND", "Set execution not found.");
    }
    if (setRow.status !== "pending") {
      return fail(c, 409, "SET_ALREADY_RECORDED", "Set already recorded.");
    }

    const { status: setStatus, actualReps, actualLoadLabel, loadColumns } =
      resolveSetCompletion(setRow, parsed.data);
    const modified = setStatus === "modified";

    const now = nowIso();
    await db
      .update(setExecutions)
      .set({
        status: modified ? "modified" : "completed",
        actualReps,
        actualLoadLabel,
        ...loadColumns,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(setExecutions.id, setRow.id));

    // Refresh exercise status when all sets are terminal
    const exerciseSets = bundle.sets.filter(
      (set) => set.exerciseExecutionId === setRow.exerciseExecutionId,
    );
    const updatedStatuses = exerciseSets.map((set) =>
      set.id === setRow.id
        ? (modified ? "modified" : "completed")
        : set.status,
    );
    const allDone = updatedStatuses.every((status) => status !== "pending");
    if (allDone) {
      await db
        .update(exerciseExecutions)
        .set({ status: "completed", updatedAt: now })
        .where(eq(exerciseExecutions.id, setRow.exerciseExecutionId));
    }

    const refreshed = await loadExecutionBundle(db, bundle.execution.id);
    emitWorkoutExecutionChanged(c.env, {
      id: refreshed!.execution.id,
      coachingRelationshipId: refreshed!.execution.coachingRelationshipId,
      recordVersion: refreshed!.execution.recordVersion,
    });
    return ok(
      c,
      workoutExecutionSchema.parse(
        mapExecution(refreshed!),
      ),
    );
  },
);

workoutRoutes.post(
  "/executions/:executionId/sets/:setExecutionId/skip",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/executions/:executionId/sets/:setExecutionId/skip.",
    description: "Workouts operation for POST /workouts/executions/:executionId/sets/:setExecutionId/skip.",
    roles: ["trainee"],
    response: workoutExecutionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainee"),
  async (c) => {
    const loaded = await requireTraineeOwnedOpenExecution(
      c,
      c.req.param("executionId"),
    );
    if (isOwnershipFailure(loaded)) return ownershipError(c, loaded);

    const { db, bundle } = loaded;
    if (!canMutateOpenWorkoutExecution(bundle.execution.status)) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Sets can only be skipped during an open workout.",
      );
    }

    const setRow = bundle.sets.find(
      (set) => set.id === c.req.param("setExecutionId"),
    );
    if (!setRow) {
      return fail(c, 404, "SET_NOT_FOUND", "Set execution not found.");
    }
    if (setRow.status !== "pending") {
      return fail(c, 409, "SET_ALREADY_RECORDED", "Set already recorded.");
    }

    const now = nowIso();
    await db
      .update(setExecutions)
      .set({
        // Load columns stay as written at workout start (the row is pending, Z6-15).
        status: "skipped",
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(setExecutions.id, setRow.id));

    const exerciseSets = bundle.sets.filter(
      (set) => set.exerciseExecutionId === setRow.exerciseExecutionId,
    );
    const allDone = exerciseSets.every((set) =>
      set.id === setRow.id ? true : set.status !== "pending",
    );
    if (allDone) {
      await db
        .update(exerciseExecutions)
        .set({ status: "completed", updatedAt: now })
        .where(eq(exerciseExecutions.id, setRow.exerciseExecutionId));
    }

    const refreshed = await loadExecutionBundle(db, bundle.execution.id);
    emitWorkoutExecutionChanged(c.env, {
      id: refreshed!.execution.id,
      coachingRelationshipId: refreshed!.execution.coachingRelationshipId,
      recordVersion: refreshed!.execution.recordVersion,
    });
    return ok(
      c,
      workoutExecutionSchema.parse(
        mapExecution(refreshed!),
      ),
    );
  },
);

workoutRoutes.post(
  "/executions/:executionId/complete",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/executions/:executionId/complete.",
    description: "Workouts operation for POST /workouts/executions/:executionId/complete.",
    roles: ["trainee"],
    idempotency: true,
    body: completeWorkoutRequestSchema,
    response: workoutExecutionSchema,
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

    const parsed = completeWorkoutRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid completion request.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        executionId: c.req.param("executionId"),
        body: parsed.data,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: COMPLETE_OPERATION,
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
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
    }

    const loaded = await requireTraineeOwnedOpenExecution(
      c,
      c.req.param("executionId"),
    );
    if (isOwnershipFailure(loaded)) return ownershipError(c, loaded);

    const { bundle } = loaded;
    const sessionRpe =
      parsed.data.sessionRpe === undefined
        ? bundle.execution.sessionRpe
        : parsed.data.sessionRpe;

    if (
      !canCompleteWorkoutExecution({
        status: bundle.execution.status,
        requireSessionRpe: bundle.execution.requireSessionRpe,
        sessionRpe,
      })
    ) {
      return fail(
        c,
        422,
        "SESSION_RPE_REQUIRED",
        "Session RPE is required to complete this workout.",
      );
    }

    const terminalStatus = resolveCompletedWorkoutStatus(
      bundle.sets.map((set) => set.status),
    );
    const now = nowIso();
    await db
      .update(workoutExecutions)
      .set({
        status: terminalStatus,
        sessionRpe: sessionRpe ?? null,
        completedAt: now,
        pausedAt: null,
        recordVersion: bundle.execution.recordVersion + 1,
        updatedAt: now,
      })
      .where(eq(workoutExecutions.id, bundle.execution.id));

    const refreshed = await loadExecutionBundle(db, bundle.execution.id);
    const mapped = mapExecution(refreshed!);
    const responseBody = { data: workoutExecutionSchema.parse(mapped) };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: COMPLETE_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    emitWorkoutExecutionChanged(c.env, {
      id: mapped.id,
      coachingRelationshipId: refreshed!.execution.coachingRelationshipId,
      recordVersion: mapped.recordVersion,
    });
    return c.json(responseBody, 200);
  },
);

workoutRoutes.post(
  "/assignments/:assignmentId/skip",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for POST /workouts/assignments/:assignmentId/skip.",
    description: "Workouts operation for POST /workouts/assignments/:assignmentId/skip.",
    roles: ["trainee"],
    idempotency: true,
    body: skipWorkoutRequestSchema,
    bodyRequired: false,
    response: workoutExecutionSchema,
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

    const parsed = skipWorkoutRequestSchema.safeParse(
      await c.req.json().catch(() => ({})),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid skip request.", {
        issues: parsed.error.issues,
      });
    }
    const clientLoggedAt = parsed.data.clientLoggedAt;

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({
        assignmentId: c.req.param("assignmentId"),
        clientLoggedAt: clientLoggedAt ?? null,
      }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SKIP_OPERATION,
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
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 200);
    }

    const loaded = await loadAssignmentWithExecution(
      db,
      c.req.param("assignmentId"),
    );
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      loaded.assignment.coachingRelationshipId,
      actor,
    );
    if (!relationship || relationship.traineeUserId !== actor.userId) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    const writableSkip = await requireWritableRelationship(
      c,
      db,
      relationship.id,
    );
    if (!writableSkip.ok) return writableSkip.response;

    const now = nowIso();
    const logInstant = resolveLogInstant({ clientLoggedAt, now });
    if (
      await workoutInEndedPeriod(db, {
        relationship,
        localDate: loaded.assignment.localDate,
        loggedAt: clientLoggedAt
          ? logInstant
          : (loaded.execution?.startedAt ?? now),
      })
    ) {
      return endedPeriodError(c);
    }
    if (loaded.execution?.loggedByRole === "coach") {
      return coachLoggedReadOnlyError(c);
    }
    // Absent client time keeps today's skip, which does not apply the
    // window bounds. A supplied time is judged with the same bounds as start.
    if (clientLoggedAt) {
      const skipBounds = assertLogTimeWithinBounds({
        clientLoggedAt: logInstant,
        windowStart: loaded.assignment.windowStartsAt,
        now,
      });
      if (!skipBounds.ok) {
        return fail(
          c,
          422,
          LOG_TIME_ERROR_CODES[skipBounds.reason],
          LOG_TIME_ERROR_MESSAGES[skipBounds.reason],
        );
      }
    }

    if (loaded.execution && isOpenWorkoutExecution(loaded.execution.status)) {
      if (!canSkipOpenWorkoutExecution(loaded.execution.status)) {
        return fail(c, 409, "INVALID_TRANSITION", "Cannot skip this workout.");
      }
      await db
        .update(workoutExecutions)
        .set({
          status: "skipped",
          completedAt: logInstant,
          pausedAt: null,
          recordVersion: loaded.execution.recordVersion + 1,
          updatedAt: now,
        })
        .where(eq(workoutExecutions.id, loaded.execution.id));
      const refreshed = await loadExecutionBundle(db, loaded.execution.id);
      const responseBody = {
        data: workoutExecutionSchema.parse(
          mapExecution(refreshed!),
        ),
      };
      await saveIdempotencyRecord(db, {
        actorUserId: actor.userId,
        operation: SKIP_OPERATION,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: 200,
        responseBody,
        expiresAt: addDaysIso(7),
      });
      emitWorkoutExecutionChanged(c.env, {
        id: responseBody.data.id,
        coachingRelationshipId: relationship.id,
        recordVersion: responseBody.data.recordVersion,
      });
      return c.json(responseBody, 200);
    }

    if (
      !canSkipAssignedWorkout({
        hasQualifyingExecution: Boolean(
          loaded.execution &&
            isQualifyingWorkoutExecution(loaded.execution.status),
        ),
        hasOpenExecution: false,
      })
    ) {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Workout already finished and cannot be skipped.",
      );
    }

    const config = await loadActiveWorkoutConfig(db, relationship.id);
    const executionId = createId();
    await db.insert(workoutExecutions).values({
      id: executionId,
      assignmentId: loaded.assignment.id,
      coachingRelationshipId: relationship.id,
      planVersionId: loaded.assignment.planVersionId,
      traineeUserId: actor.userId,
      status: "skipped",
      recordVersion: 0,
      startedAt: logInstant,
      pausedAt: null,
      completedAt: logInstant,
      sessionRpe: null,
      requireSessionRpe: config?.tracking.requireSessionRpe ?? false,
      clientLoggedAt: clientLoggedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const refreshed = await loadExecutionBundle(db, executionId);
    const responseBody = {
      data: workoutExecutionSchema.parse(
        mapExecution(refreshed!),
      ),
    };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: SKIP_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 200,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    emitWorkoutExecutionChanged(c.env, {
      id: responseBody.data.id,
      coachingRelationshipId: relationship.id,
      recordVersion: responseBody.data.recordVersion,
    });
    return c.json(responseBody, 200);
  },
);

workoutRoutes.get(
  "/executions/:executionId",
  operation({
    tag: "Workouts",
    summary: "Workouts operation for GET /workouts/executions/:executionId.",
    description: "Workouts operation for GET /workouts/executions/:executionId.",
    roles: ["trainer", "trainee"],
    response: workoutExecutionSchema,
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
    const bundle = await loadExecutionBundle(db, c.req.param("executionId"));
    if (!bundle) {
      return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
    }

    const relationship = await loadAccessibleRelationship(
      db,
      bundle.execution.coachingRelationshipId,
      actor,
    );
    if (!relationship) {
      return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
    }

    return ok(
      c,
      workoutExecutionSchema.parse(
        mapExecution(bundle),
      ),
    );
  },
);

// ---------------------------------------------------------------------------
// Trainer log and edit (Z6-19, PLAN-v2 D-P2-21, D-W6-IP R1–R5)
// ---------------------------------------------------------------------------

const COACH_LOG_OPERATION = "workout.coach.log";

type TrainerAccess =
  | { ok: true; relationship: typeof coachingRelationships.$inferSelect }
  | { ok: false; response: Response };

/** The signed-in trainer must own the relationship (403), and it must be active (409). */
async function requireTrainerWritableRelationship(
  c: AppContext,
  db: Db,
  relationshipId: string,
  actor: ActorContext,
): Promise<TrainerAccess> {
  const [relationship] = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  if (
    !relationship ||
    actor.selectedRole !== "trainer" ||
    relationship.trainerUserId !== actor.userId
  ) {
    return {
      ok: false,
      response: fail(c, 403, "FORBIDDEN", "You cannot log workouts for this client."),
    };
  }
  const writable = await requireWritableRelationship(c, db, relationship.id);
  if (!writable.ok) return writable;
  return { ok: true, relationship };
}

function backdateLimitError(c: AppContext) {
  return fail(c, 422, COACH_LOG_BACKDATE_ERROR.code, COACH_LOG_BACKDATE_ERROR.message);
}

function setsMismatchError(c: AppContext) {
  return fail(
    c,
    422,
    "COACH_LOG_SETS_MISMATCH",
    "List every set of this workout once, as done or skipped.",
  );
}

function versionConflictError(c: AppContext) {
  return fail(
    c,
    409,
    "VERSION_CONFLICT",
    "This workout changed since it was opened. Reload and try again.",
  );
}

function coachPushConfig(env: Env) {
  return {
    pushProviderMode: resolvePushProviderMode(env.PUSH_PROVIDER_MODE),
    expoAccessToken: env.EXPO_ACCESS_TOKEN,
  };
}

/** The label stored for a set the trainer marks as bodyweight. */
const BODYWEIGHT_LABEL = "Bodyweight";

workoutRoutes.post(
  "/assignments/:assignmentId/log",
  operation({
    tag: "Workouts",
    summary: "Trainer logs a client's finished workout",
    description:
      "Creates one completed execution logged by the coach (logged_by_role coach). Every set of the workout day is listed once, done or skipped. performedAt must be within the last 7 days and not in the future (422 BACKDATE_LIMIT). The entry is read-only to the trainee, is audited, appears in the activity feed and notifies the trainee when their coach-updates setting is on.",
    roles: ["trainer"],
    idempotency: true,
    body: coachLogWorkoutRequestSchema,
    response: workoutExecutionSchema,
    successStatus: [201],
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
    const parsed = coachLogWorkoutRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid workout log.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const assignmentId = c.req.param("assignmentId");
    const fingerprint = await sha256Hex(
      JSON.stringify({ assignmentId, body: parsed.data }),
    );
    const existing = await findIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: COACH_LOG_OPERATION,
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
      return c.json(JSON.parse(existing.responseBody), existing.responseStatus as 201);
    }

    const loaded = await loadAssignmentWithExecution(db, assignmentId);
    if (!loaded) {
      return fail(c, 404, "ASSIGNMENT_NOT_FOUND", "Assignment not found.");
    }
    const access = await requireTrainerWritableRelationship(
      c,
      db,
      loaded.assignment.coachingRelationshipId,
      actor,
    );
    if (!access.ok) return access.response;
    const { relationship } = access;

    if (loaded.assignment.scheduleStatus !== "scheduled") {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "This workout is no longer scheduled.",
      );
    }
    if (loaded.execution) {
      // R3: one execution per assignment; a finished one is edited, never logged twice.
      return isOpenWorkoutExecution(loaded.execution.status)
        ? fail(c, 409, "WORKOUT_IN_PROGRESS", "The client is doing this workout now.")
        : fail(
            c,
            409,
            "WORKOUT_ALREADY_FINISHED",
            "This assignment already has a finished execution.",
          );
    }

    const now = nowIso();
    const performedAt = new Date(parsed.data.performedAt).toISOString();
    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    if (
      !isWithinCoachLogWindow({
        localDates: [loaded.assignment.localDate],
        instants: [performedAt],
        now,
        timeZone,
      })
    ) {
      return backdateLimitError(c);
    }
    if (
      await workoutInEndedPeriod(db, {
        relationship,
        localDate: loaded.assignment.localDate,
        loggedAt: performedAt,
      })
    ) {
      return endedPeriodError(c);
    }

    // Every set target of the day exactly once (never auto-skipped).
    const workoutDay = parseWorkoutDayJson(
      loaded.assignment.workoutDayJson,
    ) as WorkoutDay;
    const bodyExercises = new Map(
      parsed.data.exercises.map((exercise) => [exercise.exerciseId, exercise]),
    );
    if (
      bodyExercises.size !== parsed.data.exercises.length ||
      bodyExercises.size !== workoutDay.exercises.length
    ) {
      return setsMismatchError(c);
    }
    for (const exercise of workoutDay.exercises) {
      const sent = bodyExercises.get(exercise.id);
      if (!sent) return setsMismatchError(c);
      const targetIds = new Set(exercise.setTargets.map((target) => target.id));
      const sentIds = new Set(sent.sets.map((set) => set.setTargetId));
      if (
        sentIds.size !== sent.sets.length ||
        sentIds.size !== targetIds.size ||
        [...sentIds].some((id) => !targetIds.has(id))
      ) {
        return setsMismatchError(c);
      }
    }

    const config = await loadActiveWorkoutConfig(db, relationship.id);
    const plannedExercises = workoutDay.exercises
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((exercise) => {
        const sent = bodyExercises.get(exercise.id)!;
        return {
          exercise,
          sets: exercise.setTargets
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((target) => {
              const input = sent.sets.find((set) => set.setTargetId === target.id)!;
              if (input.status === "skipped") {
                return {
                  target,
                  status: "skipped" as const,
                  actualReps: null,
                  actualLoadLabel: null,
                  loadColumns: resolveSetLoad({
                    prescribedLoadLabel: target.loadLabel,
                    actualLoadLabel: null,
                  }),
                };
              }
              return {
                target,
                ...resolveSetCompletion(
                  { prescribedReps: target.reps, prescribedLoadLabel: target.loadLabel },
                  {
                    actualReps: input.actualReps,
                    actualLoadKg: input.actualLoadKg,
                    actualLoadLabel: input.bodyweight ? BODYWEIGHT_LABEL : undefined,
                  },
                ),
              };
            }),
        };
      });
    const executionStatus = resolveCompletedWorkoutStatus(
      plannedExercises.flatMap((planned) => planned.sets.map((set) => set.status)),
    );

    // The execution row claims the assignment first (unique per assignment).
    const executionId = createId();
    await db.insert(workoutExecutions).values({
      id: executionId,
      assignmentId: loaded.assignment.id,
      coachingRelationshipId: relationship.id,
      planVersionId: loaded.assignment.planVersionId,
      traineeUserId: relationship.traineeUserId,
      status: executionStatus,
      recordVersion: 0,
      startedAt: performedAt,
      pausedAt: null,
      completedAt: performedAt,
      sessionRpe: parsed.data.sessionRpe ?? null,
      requireSessionRpe: config?.tracking.requireSessionRpe ?? false,
      loggedByRole: "coach",
      loggedByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });
    for (const planned of plannedExercises) {
      const exerciseExecutionId = createId();
      await db.insert(exerciseExecutions).values({
        id: exerciseExecutionId,
        workoutExecutionId: executionId,
        exerciseId: planned.exercise.id,
        name: planned.exercise.name,
        order: planned.exercise.order,
        status: "completed",
        createdAt: now,
        updatedAt: now,
      });
      for (const set of planned.sets) {
        await db.insert(setExecutions).values({
          id: createId(),
          exerciseExecutionId,
          setTargetId: set.target.id,
          order: set.target.order,
          status: set.status,
          prescribedReps: set.target.reps,
          prescribedLoadLabel: set.target.loadLabel,
          actualReps: set.actualReps,
          actualLoadLabel: set.actualLoadLabel,
          ...set.loadColumns,
          completedAt: performedAt,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const bundle = (await loadExecutionBundle(db, executionId))!;
    await recordCoachLogChange(db, {
      entity: {
        type: "workout_execution",
        id: executionId,
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
        serverVersion: bundle.execution.recordVersion,
        routing: {
          domainEntityType: "workout_assignment",
          domainEntityId: loaded.assignment.id,
        },
      },
      action: "create",
      actorUserId: actor.userId,
      before: null,
      after: workoutLogSnapshot({ assignment: loaded.assignment, ...bundle }),
      now,
      push: coachPushConfig(c.env),
    });

    const responseBody = { data: workoutExecutionSchema.parse(mapExecution(bundle)) };
    await saveIdempotencyRecord(db, {
      actorUserId: actor.userId,
      operation: COACH_LOG_OPERATION,
      idempotencyKey,
      requestFingerprint: fingerprint,
      responseStatus: 201,
      responseBody,
      expiresAt: addDaysIso(7),
    });
    emitWorkoutExecutionChanged(c.env, {
      id: executionId,
      coachingRelationshipId: relationship.id,
      recordVersion: bundle.execution.recordVersion,
    });
    return c.json(responseBody, 201);
  },
);

workoutRoutes.patch(
  "/executions/:executionId",
  operation({
    tag: "Workouts",
    summary: "Trainer edits a client's finished workout",
    description:
      "Changes sets (reps, kg or bodyweight, done or skipped), performedAt or the session RPE of a finished execution dated within the last 7 days (422 BACKDATE_LIMIT). recordVersion must match (409 VERSION_CONFLICT). Sets last_edited_* to the coach; a trainee-logged entry stays the trainee's. Audited, shown in the activity feed, and notifies the trainee when their coach-updates setting is on.",
    roles: ["trainer"],
    body: coachEditWorkoutRequestSchema,
    response: workoutExecutionSchema,
  }),
  optionalAuthMiddleware,
  requireAuthMiddleware,
  requireRole("trainer"),
  async (c) => {
    const actor = c.get("actor");
    if (!actor?.selectedRole) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }
    const parsed = coachEditWorkoutRequestSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!parsed.success) {
      return fail(c, 400, "INVALID_REQUEST", "Invalid workout edit.", {
        issues: parsed.error.issues,
      });
    }

    const db = createDb(c.env.DB);
    const bundle = await loadExecutionBundle(db, c.req.param("executionId"));
    if (!bundle) {
      return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
    }
    const access = await requireTrainerWritableRelationship(
      c,
      db,
      bundle.execution.coachingRelationshipId,
      actor,
    );
    if (!access.ok) return access.response;
    const { relationship } = access;
    const { execution } = bundle;

    if (execution.status !== "completed" && execution.status !== "modified") {
      return fail(
        c,
        409,
        "INVALID_TRANSITION",
        "Only a finished workout can be edited.",
      );
    }
    if (execution.recordVersion !== parsed.data.recordVersion) {
      return versionConflictError(c);
    }

    const [assignment] = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.id, execution.assignmentId))
      .limit(1);
    if (!assignment) {
      return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
    }

    const now = nowIso();
    const performedAt =
      parsed.data.performedAt === undefined
        ? null
        : new Date(parsed.data.performedAt).toISOString();
    const currentPerformedAt = execution.completedAt ?? execution.startedAt;
    const timeZone = await loadTraineeTimezone(db, relationship.traineeUserId);
    if (
      !isWithinCoachLogWindow({
        localDates: [assignment.localDate],
        instants: performedAt ? [currentPerformedAt, performedAt] : [currentPerformedAt],
        now,
        timeZone,
      })
    ) {
      return backdateLimitError(c);
    }
    const nextCompletedAt = performedAt ?? execution.completedAt;
    const nextStartedAt =
      nextCompletedAt && nextCompletedAt < execution.startedAt
        ? nextCompletedAt
        : execution.startedAt;
    if (
      await workoutInEndedPeriod(db, {
        relationship,
        localDate: assignment.localDate,
        loggedAt: nextStartedAt,
      })
    ) {
      return endedPeriodError(c);
    }

    // Resolve each listed set; unknown or repeated ids are rejected.
    const setsById = new Map(bundle.sets.map((set) => [set.id, set]));
    const edits = parsed.data.sets ?? [];
    if (new Set(edits.map((set) => set.setExecutionId)).size !== edits.length) {
      return setsMismatchError(c);
    }
    const setUpdates = new Map<
      string,
      Pick<
        typeof setExecutions.$inferInsert,
        "status" | "actualReps" | "actualLoadLabel" | "prescribedLoadKg" | "actualLoadKg" | "loadKind"
      >
    >();
    for (const edit of edits) {
      const row = setsById.get(edit.setExecutionId);
      if (!row) return setsMismatchError(c);
      const wasDone = row.status === "completed" || row.status === "modified";
      const next =
        edit.status === "skipped"
          ? {
              status: "skipped" as const,
              actualReps: null,
              actualLoadLabel: null,
              loadColumns: resolveSetLoad({
                prescribedLoadLabel: row.prescribedLoadLabel,
                actualLoadLabel: null,
              }),
            }
          : resolveSetCompletion(row, {
              // Omitted values keep what was logged, not the prescription.
              actualReps:
                edit.actualReps !== undefined
                  ? edit.actualReps
                  : wasDone
                    ? row.actualReps
                    : undefined,
              actualLoadKg: edit.actualLoadKg,
              actualLoadLabel: edit.bodyweight
                ? BODYWEIGHT_LABEL
                : edit.actualLoadKg !== undefined || !wasDone
                  ? undefined
                  : row.actualLoadLabel,
            });
      const values = {
        status: next.status,
        actualReps: next.actualReps,
        actualLoadLabel: next.actualLoadLabel,
        ...next.loadColumns,
      };
      const changed =
        values.status !== row.status ||
        values.actualReps !== row.actualReps ||
        values.actualLoadLabel !== row.actualLoadLabel ||
        values.actualLoadKg !== row.actualLoadKg ||
        values.loadKind !== row.loadKind;
      if (changed) setUpdates.set(row.id, values);
    }

    const nextSessionRpe =
      parsed.data.sessionRpe === undefined ? execution.sessionRpe : parsed.data.sessionRpe;
    if (
      setUpdates.size === 0 &&
      nextSessionRpe === execution.sessionRpe &&
      nextCompletedAt === execution.completedAt
    ) {
      // Nothing changed: no audit row, no notification.
      return ok(c, workoutExecutionSchema.parse(mapExecution(bundle)));
    }

    const nextStatuses = bundle.sets.map(
      (set) => setUpdates.get(set.id)?.status ?? set.status,
    );
    // Claim the version first, so a concurrent edit with the same version writes nothing.
    const claimed = await db
      .update(workoutExecutions)
      .set({
        status: resolveCompletedWorkoutStatus(nextStatuses),
        sessionRpe: nextSessionRpe,
        completedAt: nextCompletedAt,
        startedAt: nextStartedAt,
        recordVersion: execution.recordVersion + 1,
        lastEditedByRole: "coach",
        lastEditedByUserId: actor.userId,
        lastEditedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(workoutExecutions.id, execution.id),
          eq(workoutExecutions.recordVersion, execution.recordVersion),
        ),
      )
      .returning({ id: workoutExecutions.id });
    if (claimed.length === 0) {
      return versionConflictError(c);
    }
    for (const [id, values] of setUpdates) {
      await db
        .update(setExecutions)
        .set({ ...values, updatedAt: now })
        .where(eq(setExecutions.id, id));
    }
    // An exercise whose sets are now all recorded is complete (as on set complete).
    const touchedExercises = new Set(
      bundle.sets.filter((set) => setUpdates.has(set.id)).map((set) => set.exerciseExecutionId),
    );
    for (const exerciseExecutionId of touchedExercises) {
      const allRecorded = bundle.sets
        .filter((set) => set.exerciseExecutionId === exerciseExecutionId)
        .every((set) => (setUpdates.get(set.id)?.status ?? set.status) !== "pending");
      const exercise = bundle.exercises.find((row) => row.id === exerciseExecutionId);
      if (allRecorded && exercise?.status === "pending") {
        await db
          .update(exerciseExecutions)
          .set({ status: "completed", updatedAt: now })
          .where(eq(exerciseExecutions.id, exerciseExecutionId));
      }
    }

    const refreshed = (await loadExecutionBundle(db, execution.id))!;
    await recordCoachLogChange(db, {
      entity: {
        type: "workout_execution",
        id: execution.id,
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
        serverVersion: refreshed.execution.recordVersion,
        routing: {
          domainEntityType: "workout_assignment",
          domainEntityId: assignment.id,
        },
      },
      action: "edit",
      actorUserId: actor.userId,
      before: workoutLogSnapshot({ assignment, ...bundle }),
      after: workoutLogSnapshot({ assignment, ...refreshed }),
      now,
      push: coachPushConfig(c.env),
    });
    emitWorkoutExecutionChanged(c.env, {
      id: execution.id,
      coachingRelationshipId: relationship.id,
      recordVersion: refreshed.execution.recordVersion,
    });
    return ok(c, workoutExecutionSchema.parse(mapExecution(refreshed)));
  },
);
