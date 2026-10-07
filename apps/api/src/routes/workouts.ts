import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { Hono } from "hono";
import {
  completeSetRequestSchema,
  completeWorkoutRequestSchema,
  generateWorkoutAssignmentsRequestSchema,
  generateWorkoutAssignmentsResponseSchema,
  localDateSchema,
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
  eachLocalDateInclusive,
  isOpenWorkoutExecution,
  isQualifyingWorkoutExecution,
  resolveCompletedWorkoutStatus,
  sessionWeekdaysForFrequency,
  setCompletionIsModified,
  weekdayFromLocalDate,
  workoutWindowForLocalDate,
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
  users,
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
import { addDaysIso, createId, nowIso, sha256Hex } from "../lib/crypto";
import type { AppContext } from "../lib/envelope";
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

async function loadTraineeTimezone(db: Db, traineeUserId: string) {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, traineeUserId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
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
    if (parsed.data.fromDate > parsed.data.toDate) {
      return fail(
        c,
        400,
        "INVALID_DATE_RANGE",
        "fromDate must be on or before toDate.",
      );
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
    const workoutDays = content.workoutDays
      .slice()
      .sort((a, b) => a.order - b.order);
    if (workoutDays.length === 0) {
      return fail(
        c,
        422,
        "NO_WORKOUT_DAYS",
        "The effective plan has no workout days.",
      );
    }

    const timezone = await loadTraineeTimezone(db, relationship.traineeUserId);
    const weekdays = sessionWeekdaysForFrequency(
      config.workout.sessionsPerWeek,
    );
    const now = nowIso();
    let dayCycleIndex = 0;
    const createdRows: (typeof workoutAssignments.$inferSelect)[] = [];

    for (const localDate of eachLocalDateInclusive(
      parsed.data.fromDate,
      parsed.data.toDate,
    )) {
      const weekday = weekdayFromLocalDate(localDate);
      if (!weekdays.includes(weekday)) continue;

      const workoutDay = workoutDays[dayCycleIndex % workoutDays.length]!;
      dayCycleIndex += 1;

      const existingAssignment = await db
        .select()
        .from(workoutAssignments)
        .where(
          and(
            eq(workoutAssignments.coachingRelationshipId, relationship.id),
            eq(workoutAssignments.planVersionId, effective.version.id),
            eq(workoutAssignments.workoutDayId, workoutDay.id),
            eq(workoutAssignments.localDate, localDate),
          ),
        )
        .limit(1);
      if (existingAssignment[0]) continue;

      const window = workoutWindowForLocalDate({
        localDate,
        timeZone: timezone,
        completionWindowHours: config.workout.completionWindowHours,
      });

      const row = {
        id: createId(),
        coachingRelationshipId: relationship.id,
        planId: effective.plan.id,
        planVersionId: effective.version.id,
        workoutDayId: workoutDay.id,
        workoutDayName: workoutDay.name,
        workoutDayJson: JSON.stringify(workoutDay),
        localDate,
        windowStartsAt: window.windowStartsAt,
        windowEndsAt: window.windowEndsAt,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(workoutAssignments).values(row);
      createdRows.push(row);
    }

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

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({ assignmentId: c.req.param("assignmentId") }),
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

    const now = nowIso();
    const assignmentStatus = mapWorkoutAssignment(
      loaded.assignment,
      loaded.execution,
      now,
    ).status;

    if (loaded.execution && isOpenWorkoutExecution(loaded.execution.status)) {
      const bundle = await loadExecutionBundle(db, loaded.execution.id);
      const mapped = mapWorkoutExecution(
        bundle!.execution,
        bundle!.exercises,
        bundle!.sets,
      );
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
      startedAt: now,
      pausedAt: null,
      completedAt: null,
      sessionRpe: null,
      requireSessionRpe,
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
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const bundle = await loadExecutionBundle(db, executionId);
    const mapped = mapWorkoutExecution(
      bundle!.execution,
      bundle!.exercises,
      bundle!.sets,
    );
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
  return { actor, db, bundle, relationship } as const;
}

function isOwnershipFailure(
  loaded: { errorStatus?: "unauthenticated" | "not_found" },
): loaded is { errorStatus: "unauthenticated" | "not_found" } {
  return loaded.errorStatus === "unauthenticated" || loaded.errorStatus === "not_found";
}

function ownershipError(
  c: AppContext,
  loaded: { errorStatus: "unauthenticated" | "not_found" },
) {
  if (loaded.errorStatus === "unauthenticated") {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
  }
  return fail(c, 404, "EXECUTION_NOT_FOUND", "Execution not found.");
}

workoutRoutes.post(
  "/executions/:executionId/pause",
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
      mapWorkoutExecution(
        refreshed!.execution,
        refreshed!.exercises,
        refreshed!.sets,
      ),
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
      mapWorkoutExecution(
        refreshed!.execution,
        refreshed!.exercises,
        refreshed!.sets,
      ),
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

    const actualReps =
      parsed.data.actualReps === undefined
        ? setRow.prescribedReps
        : parsed.data.actualReps;
    const actualLoadLabel =
      parsed.data.actualLoadLabel === undefined
        ? setRow.prescribedLoadLabel
        : parsed.data.actualLoadLabel;

    const modified = setCompletionIsModified({
      prescribedReps: setRow.prescribedReps,
      prescribedLoadLabel: setRow.prescribedLoadLabel,
      actualReps,
      actualLoadLabel,
    });

    const now = nowIso();
    await db
      .update(setExecutions)
      .set({
        status: modified ? "modified" : "completed",
        actualReps,
        actualLoadLabel,
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
        mapWorkoutExecution(
          refreshed!.execution,
          refreshed!.exercises,
          refreshed!.sets,
        ),
      ),
    );
  },
);

workoutRoutes.post(
  "/executions/:executionId/sets/:setExecutionId/skip",
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
        mapWorkoutExecution(
          refreshed!.execution,
          refreshed!.exercises,
          refreshed!.sets,
        ),
      ),
    );
  },
);

workoutRoutes.post(
  "/executions/:executionId/complete",
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
    const mapped = mapWorkoutExecution(
      refreshed!.execution,
      refreshed!.exercises,
      refreshed!.sets,
    );
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

    const db = createDb(c.env.DB);
    const fingerprint = await sha256Hex(
      JSON.stringify({ assignmentId: c.req.param("assignmentId") }),
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

    if (loaded.execution && isOpenWorkoutExecution(loaded.execution.status)) {
      if (!canSkipOpenWorkoutExecution(loaded.execution.status)) {
        return fail(c, 409, "INVALID_TRANSITION", "Cannot skip this workout.");
      }
      const now = nowIso();
      await db
        .update(workoutExecutions)
        .set({
          status: "skipped",
          completedAt: now,
          pausedAt: null,
          recordVersion: loaded.execution.recordVersion + 1,
          updatedAt: now,
        })
        .where(eq(workoutExecutions.id, loaded.execution.id));
      const refreshed = await loadExecutionBundle(db, loaded.execution.id);
      const responseBody = {
        data: workoutExecutionSchema.parse(
          mapWorkoutExecution(
            refreshed!.execution,
            refreshed!.exercises,
            refreshed!.sets,
          ),
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
    const now = nowIso();
    const executionId = createId();
    await db.insert(workoutExecutions).values({
      id: executionId,
      assignmentId: loaded.assignment.id,
      coachingRelationshipId: relationship.id,
      planVersionId: loaded.assignment.planVersionId,
      traineeUserId: actor.userId,
      status: "skipped",
      recordVersion: 0,
      startedAt: now,
      pausedAt: null,
      completedAt: now,
      sessionRpe: null,
      requireSessionRpe: config?.tracking.requireSessionRpe ?? false,
      createdAt: now,
      updatedAt: now,
    });

    const refreshed = await loadExecutionBundle(db, executionId);
    const responseBody = {
      data: workoutExecutionSchema.parse(
        mapWorkoutExecution(
          refreshed!.execution,
          refreshed!.exercises,
          refreshed!.sets,
        ),
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
        mapWorkoutExecution(bundle.execution, bundle.exercises, bundle.sets),
      ),
    );
  },
);
