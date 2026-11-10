/**
 * Trainer log and edit of a client's log entries (Z6-19, Z6-20, Z7-22,
 * PLAN-v2 D-P2-21, D-W6-IP R1–R5, D-W6-32, D-W6-33). Shared by workouts,
 * meals and measurements.
 *
 * `recordCoachLogChange` is the one place a trainer create or edit is
 * recorded. The caller's domain writes and the rows below commit in one D1
 * batch (one transaction). A failure rolls every one of them back:
 * 1. the entry itself (passed in as `domainWrites`);
 * 2. one `log_edit_events` row (who, what, when, before and after; R4), which
 *    is the activity-feed event the trainer feed reads;
 * 3. one change-log upsert, so the trainee's next sync pull carries the entry;
 * 4. one `coach_log_updated` inbox notification for the trainee, with
 *    `merge_group` = the entry id: a second change to the same entry within
 *    10 minutes merges into the first (no new row, no second push). It is
 *    skipped when the trainee turned "Coach updates to my logs" off.
 *
 * The push itself runs only after that batch commits. It is gated in
 * `pushTraineeCoachLogEvent` (push on/off, the same setting, quiet hours),
 * carries routing only (R5), and never throws, so a push failure cannot
 * orphan or roll back the entry.
 *
 * Nothing here logs entry content or personal data.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import {
  coachLogDedupeKey,
  type CoachLogAction,
  type CoachLogEntityType,
} from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  changeLog,
  coachingRelationships,
  logEditEvents,
  mealCompliance,
  measurements,
  notificationPreferences,
  notifications,
  workoutExecutions,
} from "../db/schema.js";
import { createId } from "../lib/crypto.js";
import {
  pushTraineeCoachLogEvent,
  type TrainerPushConfig,
} from "./inbox-notify.js";

/** R5: changes to one entry within this window share one notification. */
export const COACH_LOG_MERGE_WINDOW_MS = 10 * 60 * 1000;

/**
 * A change-log sequence collision (or any other write collision that is not
 * the entry's own unique key or the version claim) after the batch has rolled
 * back. The entry is not stored. The client retries.
 */
export const LOG_WRITE_CONFLICT = {
  code: "LOG_WRITE_CONFLICT",
  message: "Another log was saved at the same time. Try again.",
} as const;

/** How many times a rolled-back sequence collision is tried again in this call. */
const COACH_LOG_WRITE_ATTEMPTS = 3;

/** One statement inside the coach-log batch. */
export type CoachLogWrite = BatchItem<"sqlite">;

/**
 * Set on an edit. The batch aborts unless the domain update left the row at
 * this version, so a concurrent edit with the same version writes nothing.
 */
export type CoachLogClaim = {
  entity: "workout_execution" | "meal_compliance" | "measurement";
  id: string;
  recordVersion: number;
};

export type CoachLogConflictKind = "entry" | "version" | "sequence";

/** The batch rolled back. `kind` tells the route which stable code to return. */
export class CoachLogConflict extends Error {
  readonly name = "CoachLogConflict";
  readonly kind: CoachLogConflictKind;

  constructor(kind: CoachLogConflictKind) {
    super(
      kind === "version"
        ? "The log changed since it was opened."
        : kind === "entry"
          ? "This log was already saved."
          : LOG_WRITE_CONFLICT.message,
    );
    this.kind = kind;
  }
}

/**
 * One coach-log batch at a time in this isolate. The change-log sequence is
 * global, and the local test database runs every batch on one connection
 * whose savepoints are not re-entrant. The unique constraints still decide
 * a race between isolates: the loser rolls back and returns a conflict.
 */
let coachLogTail: Promise<void> = Promise.resolve();

function withCoachLogTurn<T>(run: () => Promise<T>): Promise<T> {
  const turn = coachLogTail.then(run, run);
  coachLogTail = turn.then(
    () => undefined,
    () => undefined,
  );
  return turn;
}

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join("\n");
}

/** Maps a failed batch to a conflict, or null when the failure is not one. */
export function classifyCoachLogWriteFailure(error: unknown): CoachLogConflictKind | null {
  const text = errorText(error);
  if (/UNIQUE constraint failed: change_log\.sequence\b/.test(text)) return "sequence";
  if (
    /UNIQUE constraint failed: (?:workout_executions\.assignment_id|meal_compliance\.assignment_id|measurements\.id)\b/.test(
      text,
    )
  ) {
    return "entry";
  }
  if (/NOT NULL constraint failed: coaching_relationships\.trainer_user_id\b/.test(text)) {
    return "version";
  }
  return null;
}

/**
 * Aborts the batch unless the edit's version update landed. Writes NULL into
 * the relationship's NOT NULL trainer id only when the claim is false, which
 * fails the statement; a true claim matches no row. The batch rolls back
 * either way when the statement fails, so the trainer id never stays NULL.
 */
function versionClaimGuard(db: Db, relationshipId: string, claim: CoachLogClaim) {
  const versionMatches =
    claim.entity === "workout_execution"
      ? sql`exists (select 1 from ${workoutExecutions} where ${workoutExecutions.id} = ${claim.id} and ${workoutExecutions.recordVersion} = ${claim.recordVersion})`
      : claim.entity === "meal_compliance"
        ? sql`exists (select 1 from ${mealCompliance} where ${mealCompliance.id} = ${claim.id} and ${mealCompliance.recordVersion} = ${claim.recordVersion})`
        : sql`exists (select 1 from ${measurements} where ${measurements.id} = ${claim.id} and ${measurements.recordVersion} = ${claim.recordVersion})`;
  return db
    .update(coachingRelationships)
    .set({ trainerUserId: sql`null` })
    .where(and(eq(coachingRelationships.id, relationshipId), sql`not (${versionMatches})`));
}

export type CoachLogEntity = {
  type: CoachLogEntityType;
  id: string;
  coachingRelationshipId: string;
  traineeUserId: string;
  /** The entry's record version after the change (sync change log). */
  serverVersion: number;
  /** Where the trainee's notification opens. */
  routing: {
    domainEntityType: "workout_assignment" | "meal_assignment" | "coaching_relationship";
    domainEntityId: string;
  };
};

export type CoachLogNotificationOutcome =
  | "stored"
  | "merged"
  | "setting_off";

export async function recordCoachLogChange(
  db: Db,
  input: {
    entity: CoachLogEntity;
    action: CoachLogAction;
    actorUserId: string;
    /** Snapshot before the change; null exactly for a create. */
    before: unknown;
    after: unknown;
    now: string;
    push: TrainerPushConfig;
    /**
     * The entry writes. Called again on a sequence retry, so it must only
     * build statements (ids and values are fixed by the caller).
     */
    domainWrites: () => readonly CoachLogWrite[];
    /** Present on an edit; absent on a create (the unique key is the claim). */
    claim?: CoachLogClaim;
  },
): Promise<{ eventId: string; notification: CoachLogNotificationOutcome }> {
  const { entity, action, now } = input;
  const eventId = createId();
  const committed = await withCoachLogTurn(async () => {
    const [prefs] = await db
      .select({ coachLogUpdates: notificationPreferences.coachLogUpdates })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, entity.traineeUserId))
      .limit(1);
    const settingOff = Boolean(prefs && !prefs.coachLogUpdates);

    const mergeSince = new Date(Date.parse(now) - COACH_LOG_MERGE_WINDOW_MS).toISOString();
    const [recent] = settingOff
      ? []
      : await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.recipientUserId, entity.traineeUserId),
              eq(notifications.notificationType, "coach_log_updated"),
              eq(notifications.mergeGroup, entity.id),
              gte(notifications.createdAt, mergeSince),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);
    const notification: CoachLogNotificationOutcome = settingOff
      ? "setting_off"
      : recent
        ? "merged"
        : "stored";
    const notificationId = notification === "stored" ? createId() : null;

    let lastSequence: unknown;
    for (let attempt = 0; attempt < COACH_LOG_WRITE_ATTEMPTS; attempt += 1) {
      const domain = input.domainWrites();
      if (domain.length === 0) {
        throw new Error("Coach log transaction needs the entry write.");
      }
      const writes: CoachLogWrite[] = [...domain];
      if (input.claim) {
        writes.push(versionClaimGuard(db, entity.coachingRelationshipId, input.claim));
      }
      // The audit row is the activity-feed event (the feed reads this table).
      writes.push(
        db.insert(logEditEvents).values({
          id: eventId,
          coachingRelationshipId: entity.coachingRelationshipId,
          traineeUserId: entity.traineeUserId,
          actorUserId: input.actorUserId,
          actorRole: "coach",
          entityType: entity.type,
          entityId: entity.id,
          action,
          beforeJson: action === "create" ? null : JSON.stringify(input.before),
          afterJson: JSON.stringify(input.after),
          createdAt: now,
        }),
      );
      // Allocated in the statement, so a batch that runs after another commit
      // sees that commit's sequence. A leftover collision retries the batch.
      writes.push(
        db.insert(changeLog).values({
          id: createId(),
          sequence: sql<number>`(select coalesce(max(${changeLog.sequence}), 0) + 1 from ${changeLog})`,
          entityType: entity.type,
          recordId: entity.id,
          changeKind: "upsert",
          serverVersion: entity.serverVersion,
          coachingRelationshipId: entity.coachingRelationshipId,
          traineeUserId: entity.traineeUserId,
          changedAt: now,
        }),
      );
      if (notificationId) {
        writes.push(
          db.insert(notifications).values({
            id: notificationId,
            recipientUserId: entity.traineeUserId,
            coachingRelationshipId: entity.coachingRelationshipId,
            notificationType: "coach_log_updated",
            domainEntityType: entity.routing.domainEntityType,
            domainEntityId: entity.routing.domainEntityId,
            state: "delivered",
            dedupeKey: coachLogDedupeKey({ action, entityType: entity.type, eventId }),
            createdAt: now,
            readAt: null,
            openedAt: null,
            priority: 10,
            mergeGroup: entity.id,
            payloadJson: null,
            expiresAt: null,
          }),
        );
      }
      try {
        await db.batch(writes as [CoachLogWrite, ...CoachLogWrite[]]);
        return { eventId, notification, notificationId };
      } catch (error) {
        const kind = classifyCoachLogWriteFailure(error);
        if (kind === "sequence" && attempt < COACH_LOG_WRITE_ATTEMPTS - 1) {
          lastSequence = error;
          continue;
        }
        if (kind) throw new CoachLogConflict(kind);
        throw error;
      }
    }
    throw lastSequence instanceof Error
      ? lastSequence
      : new CoachLogConflict("sequence");
  });

  if (committed.notificationId) {
    await pushTraineeCoachLogEvent(db, committed.notificationId, input.push, now);
  }
  return { eventId: committed.eventId, notification: committed.notification };
}

/** What `log_edit_events` keeps for a workout entry (before and after). */
export type WorkoutLogSnapshot = {
  localDate: string;
  workoutDayName: string;
  status: string;
  performedAt: string | null;
  sessionRpe: number | null;
  sets: Array<{
    id: string;
    exercise: string;
    order: number;
    status: string;
    reps: number | null;
    load: string | null;
  }>;
};

export function workoutLogSnapshot(input: {
  assignment: { localDate: string; workoutDayName: string };
  execution: { status: string; completedAt: string | null; sessionRpe: number | null };
  exercises: Array<{ id: string; name: string; order: number }>;
  sets: Array<{
    id: string;
    exerciseExecutionId: string;
    order: number;
    status: string;
    actualReps: number | null;
    actualLoadLabel: string | null;
  }>;
}): WorkoutLogSnapshot {
  const exercises = [...input.exercises].sort((a, b) => a.order - b.order);
  return {
    localDate: input.assignment.localDate,
    workoutDayName: input.assignment.workoutDayName,
    status: input.execution.status,
    performedAt: input.execution.completedAt,
    sessionRpe: input.execution.sessionRpe,
    sets: exercises.flatMap((exercise) =>
      input.sets
        .filter((set) => set.exerciseExecutionId === exercise.id)
        .sort((a, b) => a.order - b.order)
        .map((set) => ({
          id: set.id,
          exercise: exercise.name,
          order: set.order,
          status: set.status,
          reps: set.status === "skipped" ? null : set.actualReps,
          load: set.status === "skipped" ? null : set.actualLoadLabel,
        })),
    ),
  };
}

function setText(set: WorkoutLogSnapshot["sets"][number]): string {
  if (set.status === "skipped") return "skipped";
  if (set.status === "pending") return "not done";
  const reps = set.reps == null ? null : `${set.reps} reps`;
  return [reps, set.load].filter(Boolean).join(" at ") || "done";
}

/** Short "before → after" lines for one edit, in set order. */
export function workoutChangeLines(
  before: WorkoutLogSnapshot,
  after: WorkoutLogSnapshot,
): string[] {
  const lines: string[] = [];
  for (const next of after.sets) {
    const prev = before.sets.find((set) => set.id === next.id);
    if (!prev) continue;
    const from = setText(prev);
    const to = setText(next);
    if (from !== to) lines.push(`${next.exercise} set ${next.order}: ${from} → ${to}`);
  }
  if (before.sessionRpe !== after.sessionRpe) {
    lines.push(`Session RPE: ${before.sessionRpe ?? "none"} → ${after.sessionRpe ?? "none"}`);
  }
  if (before.performedAt !== after.performedAt) lines.push("Time changed");
  return lines;
}

function isWorkoutSnapshot(value: unknown): value is WorkoutLogSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkoutLogSnapshot>;
  return (
    typeof candidate.localDate === "string" &&
    typeof candidate.workoutDayName === "string" &&
    Array.isArray(candidate.sets)
  );
}

function parseJson(text: string | null): unknown {
  if (text == null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // An unreadable snapshot only shortens the feed line; it is never shown raw.
    return null;
  }
}

/** What `log_edit_events` keeps for a meal entry (before and after; Z6-20). */
export type MealLogSnapshot = {
  localDate: string;
  mealName: string;
  outcome: string;
  deviationKind: string | null;
  notes: string | null;
  /** The client's logged food list (parsed), so a before/after pair is complete. */
  items: unknown[] | null;
  /** Scaled macro totals as stored (null when unknown). */
  macros: {
    kcalScaled: number | null;
    proteinScaled: number | null;
    carbsScaled: number | null;
    fatScaled: number | null;
  };
};

function parseItems(itemsJson: string | null): unknown[] | null {
  if (!itemsJson) return null;
  try {
    const parsed = JSON.parse(itemsJson) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    // An unreadable list is recorded as absent; the row itself is untouched.
    return null;
  }
}

export function mealLogSnapshot(input: {
  assignment: { localDate: string; mealName: string };
  compliance: {
    outcome: string;
    deviationKind: string | null;
    notes: string | null;
    itemsJson: string | null;
    kcalScaled: number | null;
    proteinScaled: number | null;
    carbsScaled: number | null;
    fatScaled: number | null;
  };
}): MealLogSnapshot {
  return {
    localDate: input.assignment.localDate,
    mealName: input.assignment.mealName,
    outcome: input.compliance.outcome,
    deviationKind: input.compliance.deviationKind,
    notes: input.compliance.notes,
    items: parseItems(input.compliance.itemsJson),
    macros: {
      kcalScaled: input.compliance.kcalScaled,
      proteinScaled: input.compliance.proteinScaled,
      carbsScaled: input.compliance.carbsScaled,
      fatScaled: input.compliance.fatScaled,
    },
  };
}

function isMealSnapshot(value: unknown): value is MealLogSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MealLogSnapshot>;
  return (
    typeof candidate.localDate === "string" &&
    typeof candidate.mealName === "string" &&
    typeof candidate.outcome === "string"
  );
}

/** Short "before → after" lines for one meal edit. */
export function mealChangeLines(before: MealLogSnapshot, after: MealLogSnapshot): string[] {
  const lines: string[] = [];
  if (before.outcome !== after.outcome) {
    lines.push(
      `${labelFor("meal_compliance_outcome", before.outcome)} → ${labelFor("meal_compliance_outcome", after.outcome)}`,
    );
  }
  if (before.deviationKind !== after.deviationKind) {
    lines.push(
      `Change: ${labelFor("meal_deviation_kind", before.deviationKind) || "none"} → ${labelFor("meal_deviation_kind", after.deviationKind) || "none"}`,
    );
  }
  if (before.notes !== after.notes) lines.push("Note changed");
  return lines;
}

/** What `log_edit_events` keeps for a measurement (before and after; Z6-20). */
export type MeasurementLogSnapshot = {
  /** The trainee's civil day of `observedAt`, for the feed line. */
  localDate: string;
  type: string;
  value: number;
  unit: string;
  observedAt: string;
};

export function measurementLogSnapshot(input: {
  localDate: string;
  measurement: { type: string; value: number; unit: string; observedAt: string };
}): MeasurementLogSnapshot {
  return {
    localDate: input.localDate,
    type: input.measurement.type,
    value: input.measurement.value,
    unit: input.measurement.unit,
    observedAt: input.measurement.observedAt,
  };
}

function isMeasurementSnapshot(value: unknown): value is MeasurementLogSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<MeasurementLogSnapshot>;
  return (
    typeof candidate.localDate === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.value === "number" &&
    typeof candidate.unit === "string"
  );
}

/** Short "before → after" lines for one measurement edit. */
export function measurementChangeLines(
  before: MeasurementLogSnapshot,
  after: MeasurementLogSnapshot,
): string[] {
  const lines: string[] = [];
  if (before.value !== after.value || before.unit !== after.unit) {
    lines.push(`${before.value} ${before.unit} → ${after.value} ${after.unit}`);
  }
  if (before.localDate !== after.localDate) {
    lines.push(`Date: ${formatCivilDate(before.localDate)} → ${formatCivilDate(after.localDate)}`);
  } else if (before.observedAt !== after.observedAt) {
    lines.push("Time changed");
  }
  return lines;
}

/**
 * Activity-feed line for one `log_edit_events` row (R4): actor, entity, date
 * and a short before → after summary, for workouts, meals and measurements.
 */
export function describeCoachLogEvent(
  row: { action: string; entityType: string; beforeJson: string | null; afterJson: string },
  actorName: string,
): { type: "coach_logged" | "coach_edited"; subtype: string; summary: string } {
  const type: "coach_logged" | "coach_edited" =
    row.action === "create" ? "coach_logged" : "coach_edited";
  const verb = row.action === "create" ? "logged" : "edited";
  const after = parseJson(row.afterJson);
  const before = row.action === "create" ? null : parseJson(row.beforeJson);
  const withLines = (head: string, subtype: string, lines: string[]) => {
    if (lines.length === 0) return { type, subtype, summary: head };
    const more = lines.length > 1 ? ` (+${lines.length - 1} more)` : "";
    return { type, subtype, summary: `${head}: ${lines[0]}${more}` };
  };
  if (row.entityType === "meal_compliance" && isMealSnapshot(after)) {
    const head = `${actorName} ${verb} ${after.mealName} for ${formatCivilDate(after.localDate)}`;
    if (row.action === "create") {
      return withLines(head, "Meal", [labelFor("meal_compliance_outcome", after.outcome)]);
    }
    return withLines(head, "Meal", isMealSnapshot(before) ? mealChangeLines(before, after) : []);
  }
  if (row.entityType === "measurement" && isMeasurementSnapshot(after)) {
    const head = `${actorName} ${verb} ${labelFor("measurement_type", after.type).toLowerCase()} for ${formatCivilDate(after.localDate)}`;
    if (row.action === "create") {
      return withLines(head, "Measurement", [`${after.value} ${after.unit}`]);
    }
    return withLines(
      head,
      "Measurement",
      isMeasurementSnapshot(before) ? measurementChangeLines(before, after) : [],
    );
  }
  if (row.entityType !== "workout_execution" || !isWorkoutSnapshot(after)) {
    return { type, subtype: "Log", summary: `${actorName} ${verb} a log` };
  }
  const head = `${actorName} ${verb} ${after.workoutDayName} for ${formatCivilDate(after.localDate)}`;
  if (row.action === "create") return { type, subtype: "Workout", summary: head };
  const lines = isWorkoutSnapshot(before) ? workoutChangeLines(before, after) : [];
  if (lines.length === 0) return { type, subtype: "Workout", summary: head };
  const more = lines.length > 1 ? ` (+${lines.length - 1} more)` : "";
  return { type, subtype: "Workout", summary: `${head}: ${lines[0]}${more}` };
}
