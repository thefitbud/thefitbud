/**
 * Meal entries as the trainee reads them (Z14-11): the stored entry plus the
 * server's `editableUntil` and `canRemove` (D-W14-22), so the app never applies
 * the 24 h rule itself. Used where a read has only the entry rows in hand (a
 * write's response, sync pull); the list read computes the same with data it
 * has already loaded.
 */
import { eq, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { MealCompliance } from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  exceptions,
  mealAssignments,
  mealCompliance,
  users,
} from "../db/schema.js";
import { mapMealCompliance, parseMealPrescriptionJson } from "./mappers.js";
import { withTraineeEditState, type MealRemoveInputs } from "./meal-edit-window.js";

type ComplianceRow = typeof mealCompliance.$inferSelect;
type AssignmentRow = typeof mealAssignments.$inferSelect;

function inJsonList(column: AnyColumn, ids: readonly string[]): SQL {
  return sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`;
}

export function removeInputsFor(input: {
  assignment: AssignmentRow;
  exceptionStatus: string | null;
  timeZone: string;
  reactivatedAt: string | null;
  at: string;
}): MealRemoveInputs {
  return {
    scheduleStatus: input.assignment.scheduleStatus === "superseded" ? "superseded" : "scheduled",
    localDate: input.assignment.localDate,
    windowEndsAt: input.assignment.windowEndsAt,
    required: parseMealPrescriptionJson(input.assignment.mealPrescriptionJson).required !== false,
    exceptionStatus: input.exceptionStatus,
    timeZone: input.timeZone,
    reactivatedAt: input.reactivatedAt,
    at: input.at,
  };
}

/** The meal entry as its trainee reads it, with `editableUntil`, `canRemove` and `lastEditedAt`. */
export function traineeMealView(
  row: ComplianceRow,
  context: {
    assignment: AssignmentRow;
    exceptionStatus: string | null;
    timeZone: string;
    relationship: { status: string; reactivatedAt: string | null };
    now: string;
  },
): MealCompliance {
  return {
    ...withTraineeEditState(mapMealCompliance(row), {
      relationshipEnded: context.relationship.status === "ended",
      now: context.now,
      remove: removeInputsFor({
        assignment: context.assignment,
        exceptionStatus: context.exceptionStatus,
        timeZone: context.timeZone,
        reactivatedAt: context.relationship.reactivatedAt,
        at: context.now,
      }),
    }),
    lastEditedAt: row.lastEditedAt ?? null,
  };
}

/**
 * Batch version for rows with no other context loaded: one `db.batch` reads the
 * assignments, relationships, exceptions and the trainee zones of all of them.
 */
export async function traineeMealViews(
  db: Db,
  rows: readonly ComplianceRow[],
  now: string,
): Promise<Map<string, MealCompliance>> {
  const out = new Map<string, MealCompliance>();
  if (rows.length === 0) return out;
  const assignmentIds = [...new Set(rows.map((row) => row.assignmentId))];
  const relationshipIds = [...new Set(rows.map((row) => row.coachingRelationshipId))];
  const traineeIds = [...new Set(rows.map((row) => row.traineeUserId))];
  const [assignments, relationships, exceptionRows, zones] = await db.batch([
    db.select().from(mealAssignments).where(inJsonList(mealAssignments.id, assignmentIds)),
    db
      .select({
        id: coachingRelationships.id,
        status: coachingRelationships.status,
        reactivatedAt: coachingRelationships.reactivatedAt,
      })
      .from(coachingRelationships)
      .where(inJsonList(coachingRelationships.id, relationshipIds)),
    db
      .select({ sourceEntityId: exceptions.sourceEntityId, status: exceptions.status })
      .from(exceptions)
      .where(inJsonList(exceptions.sourceEntityId, assignmentIds)),
    db
      .select({ id: users.id, timezone: users.timezone })
      .from(users)
      .where(inJsonList(users.id, traineeIds)),
  ]);
  const assignmentById = new Map(assignments.map((row) => [row.id, row]));
  const relationshipById = new Map(relationships.map((row) => [row.id, row]));
  const exceptionByAssignment = new Map(exceptionRows.map((row) => [row.sourceEntityId, row.status]));
  const zoneByUser = new Map(zones.map((row) => [row.id, row.timezone]));
  for (const row of rows) {
    const assignment = assignmentById.get(row.assignmentId);
    const relationship = relationshipById.get(row.coachingRelationshipId);
    if (!assignment || !relationship) {
      out.set(row.id, mapMealCompliance(row));
      continue;
    }
    out.set(
      row.id,
      traineeMealView(row, {
        assignment,
        exceptionStatus: exceptionByAssignment.get(row.assignmentId) ?? null,
        timeZone: zoneByUser.get(row.traineeUserId) ?? "UTC",
        relationship,
        now,
      }),
    );
  }
  return out;
}

export async function traineeMealViewById(
  db: Db,
  complianceId: string,
  now: string,
): Promise<MealCompliance | null> {
  const [row] = await db
    .select()
    .from(mealCompliance)
    .where(eq(mealCompliance.id, complianceId))
    .limit(1);
  if (!row) return null;
  return (await traineeMealViews(db, [row], now)).get(row.id) ?? null;
}
