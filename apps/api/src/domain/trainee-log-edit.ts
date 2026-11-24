/**
 * The trainee's own change to a log entry after it was written (Z14-11:
 * rating a finished workout, editing, removing or adding a photo to a meal).
 *
 * `recordTraineeLogChange` commits, in one D1 batch (one transaction):
 * 1. the entry write (a versioned UPDATE or DELETE, the claim);
 * 2. a guard that rolls the whole batch back unless the claim changed exactly
 *    one row (a stale `recordVersion`, or a racing writer that got there first);
 * 3. one `log_edit_events` row (before and after), which is the activity item
 *    the coach's feed reads;
 * 4. change-log rows so the trainee's other devices pull the new state: an
 *    upsert (or tombstone) of the entry and an upsert of the meal assignment
 *    that carries it.
 *
 * Shape mirrors the coach's `recordCoachLogChange` (same guard, same sequence
 * allocation and retry) with the trainee as the actor. No notification rows are
 * written here: the coach's notification is `client-log-edit-notify.ts`, sent
 * after the commit.
 */
import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { CoachLogEntityType } from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import { changeLog, coachingRelationships, logEditEvents } from "../db/schema.js";
import { createId } from "../lib/crypto.js";
import { CoachLogConflict, classifyCoachLogWriteFailure } from "./coach-log.js";

type Write = BatchItem<"sqlite">;

const WRITE_ATTEMPTS = 3;

/** Another sequence allocation collided after the batch rolled back; try again. */
let tail: Promise<void> = Promise.resolve();

/** One trainee-log batch at a time in this isolate (the change-log sequence is global). */
function withTurn<T>(run: () => Promise<T>): Promise<T> {
  const turn = tail.then(run, run);
  tail = turn.then(
    () => undefined,
    () => undefined,
  );
  return turn;
}

/**
 * Aborts the batch unless the statement immediately before changed exactly one
 * row: it writes NULL into a NOT NULL column only when `changes()` is not 1.
 */
function claimGuard(db: Db, relationshipId: string): Write {
  return db
    .update(coachingRelationships)
    .set({ trainerUserId: sql`null` })
    .where(and(eq(coachingRelationships.id, relationshipId), sql`changes() != 1`));
}

function changeLogRow(
  db: Db,
  input: {
    entityType: "meal_compliance" | "meal_assignment" | "workout_execution";
    recordId: string;
    changeKind: "upsert" | "tombstone";
    serverVersion: number | null;
    relationshipId: string;
    traineeUserId: string;
    now: string;
  },
): Write {
  return db.insert(changeLog).values({
    id: createId(),
    sequence: sql<number>`(select coalesce(max(${changeLog.sequence}), 0) + 1 from ${changeLog})`,
    entityType: input.entityType,
    recordId: input.recordId,
    changeKind: input.changeKind,
    serverVersion: input.serverVersion,
    coachingRelationshipId: input.relationshipId,
    traineeUserId: input.traineeUserId,
    changedAt: input.now,
  });
}

export type TraineeLogChange = {
  entity: {
    type: CoachLogEntityType;
    id: string;
    coachingRelationshipId: string;
    traineeUserId: string;
    /** The record version after the change; null for a removal. */
    serverVersion: number | null;
    /** The meal assignment carrying the entry, whose payload also changed. */
    mealAssignmentId?: string;
  };
  /** The versioned UPDATE or DELETE of the entry (the claim). */
  claim: () => Write;
  /** "remove" writes a tombstone for the entry. */
  kind: "edit" | "remove";
  actorUserId: string;
  before: unknown;
  after: unknown;
  now: string;
  /** Further statements of the same batch (for example linking a photo asset). */
  extraWrites?: () => readonly Write[];
  /** Runs after the batch commits (read the response, store the idempotent answer). */
  afterCommit?: () => Promise<void>;
};

export async function recordTraineeLogChange(db: Db, input: TraineeLogChange): Promise<void> {
  const { entity, now } = input;
  await withTurn(async () => {
    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
      const writes: Write[] = [
        input.claim(),
        claimGuard(db, entity.coachingRelationshipId),
        db.insert(logEditEvents).values({
          id: createId(),
          coachingRelationshipId: entity.coachingRelationshipId,
          traineeUserId: entity.traineeUserId,
          actorUserId: input.actorUserId,
          actorRole: "trainee",
          entityType: entity.type,
          entityId: entity.id,
          action: "edit",
          beforeJson: JSON.stringify(input.before),
          afterJson: JSON.stringify(input.after),
          createdAt: now,
        }),
        changeLogRow(db, {
          entityType: entity.type === "meal_compliance" ? "meal_compliance" : "workout_execution",
          recordId: entity.id,
          changeKind: input.kind === "remove" ? "tombstone" : "upsert",
          serverVersion: entity.serverVersion,
          relationshipId: entity.coachingRelationshipId,
          traineeUserId: entity.traineeUserId,
          now,
        }),
      ];
      if (input.extraWrites) writes.push(...input.extraWrites());
      if (entity.mealAssignmentId) {
        writes.push(
          changeLogRow(db, {
            entityType: "meal_assignment",
            recordId: entity.mealAssignmentId,
            changeKind: "upsert",
            serverVersion: 0,
            relationshipId: entity.coachingRelationshipId,
            traineeUserId: entity.traineeUserId,
            now,
          }),
        );
      }
      try {
        await db.batch(writes as [Write, ...Write[]]);
      } catch (error) {
        const kind = classifyCoachLogWriteFailure(error);
        if (kind === "sequence" && attempt < WRITE_ATTEMPTS - 1) continue;
        if (kind) throw new CoachLogConflict(kind);
        throw error;
      }
      if (input.afterCommit) await input.afterCommit();
      return;
    }
    throw new CoachLogConflict("sequence");
  });
}

export { CoachLogConflict };
