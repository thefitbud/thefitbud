import { adherenceWindowStart, addDaysToLocalDate } from "@fitbud/core";
import { describe, expect, it } from "vitest";
import type { Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { deriveAdherenceForRelationships } from "./adherence.js";

const NOW = "2026-10-28T08:00:00.000Z";
const TODAY = "2026-10-28";

async function seedRelationship(db: Db, relationshipId: string): Promise<void> {
  const trainerId = `trainer-${relationshipId}`;
  const traineeId = `trainee-${relationshipId}`;
  await db.insert(schema.users).values([
    {
      id: trainerId,
      firebaseUid: `fb-${trainerId}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: traineeId,
      firebaseUid: `fb-${traineeId}`,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ]);
  await db.insert(schema.coachingRelationships).values({
    id: relationshipId,
    trainerUserId: trainerId,
    traineeUserId: traineeId,
    startedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(schema.plans).values({
    id: `plan-${relationshipId}`,
    coachingRelationshipId: relationshipId,
    title: "Plan",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(schema.planVersions).values({
    id: `version-${relationshipId}`,
    planId: `plan-${relationshipId}`,
    versionNumber: 1,
    contentJson: "{}",
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function logMeal(
  db: Db,
  relationshipId: string,
  localDate: string,
  slot: string,
  localDateOnCompliance: string | null = localDate,
): Promise<void> {
  const assignmentId = `assignment-${relationshipId}-${localDate}-${slot}`;
  await db.insert(schema.mealAssignments).values({
    id: assignmentId,
    coachingRelationshipId: relationshipId,
    planId: `plan-${relationshipId}`,
    planVersionId: `version-${relationshipId}`,
    mealPrescriptionId: slot,
    mealName: slot,
    mealPrescriptionJson: "{}",
    localDate,
    windowStartsAt: NOW,
    windowEndsAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(schema.mealCompliance).values({
    id: `compliance-${relationshipId}-${localDate}-${slot}`,
    assignmentId,
    coachingRelationshipId: relationshipId,
    planVersionId: `version-${relationshipId}`,
    traineeUserId: `trainee-${relationshipId}`,
    outcome: "skipped",
    loggedAt: NOW,
    localDate: localDateOnCompliance,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe("client directory meal compliance window", () => {
  it("aggregates only meal logs inside the adherence window", async () => {
    const handle = await createMemoryDb();
    try {
      const db = handle.db;
      const windowStart = adherenceWindowStart(TODAY);
      const beforeWindow = addDaysToLocalDate(windowStart, -1);
      const recentId = "rel-recent";
      const staleId = "rel-stale";
      const boundaryId = "rel-boundary";
      const missingDateId = "rel-missing-date";

      await seedRelationship(db, recentId);
      await seedRelationship(db, staleId);
      await seedRelationship(db, boundaryId);
      await seedRelationship(db, missingDateId);

      for (let offset = 1; offset <= 40; offset += 1) {
        await logMeal(
          db,
          recentId,
          addDaysToLocalDate(beforeWindow, -offset),
          `old-${offset}`,
        );
        await logMeal(
          db,
          staleId,
          addDaysToLocalDate(beforeWindow, -offset),
          `old-${offset}`,
        );
      }
      await logMeal(db, recentId, TODAY, "today");
      await logMeal(db, boundaryId, windowStart, "edge");
      await logMeal(db, missingDateId, TODAY, "today", null);

      const queries: string[] = [];
      const client = (db as unknown as { $client: D1Database }).$client;
      const prepare = client.prepare.bind(client);
      client.prepare = (query: string) => {
        queries.push(query);
        return prepare(query);
      };

      const states = await deriveAdherenceForRelationships(db, {
        today: TODAY,
        relationships: [
          { id: recentId, onboardingStatus: "active" },
          { id: staleId, onboardingStatus: "active" },
          { id: boundaryId, onboardingStatus: "active" },
          { id: missingDateId, onboardingStatus: "active" },
        ],
      });

      expect(states.get(recentId)).toBe("on_track");
      expect(states.get(staleId)).toBe("no_recent_data");
      expect(states.get(boundaryId)).toBe("on_track");
      expect(states.get(missingDateId)).toBe("no_recent_data");

      const mealQuery = queries.find(
        (query) => query.includes("meal_compliance") && query.includes("count("),
      );
      expect(mealQuery).toBeTruthy();
      const normalized = mealQuery!.toLowerCase();
      expect(normalized).toContain("group by");
      expect(normalized).toContain("local_date");
      expect(normalized).toContain("local_date\" >= ?");
      expect(normalized).toContain("local_date\" <= ?");
      expect(normalized).not.toContain("meal_assignments");

      const plan = await client
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT coaching_relationship_id, count(*)
           FROM meal_compliance
           WHERE coaching_relationship_id = ?
             AND local_date >= ?
             AND local_date <= ?
           GROUP BY coaching_relationship_id`,
        )
        .bind(recentId, windowStart, TODAY)
        .all<{ detail: string }>();
      const detail = (plan.results ?? [])
        .map((row: { detail: string }) => row.detail)
        .join("\n");
      expect(detail).toContain("meal_compliance_relationship_local_date_idx");
    } finally {
      handle.close();
    }
  });
});
