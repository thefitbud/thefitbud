import { describe, expect, it } from "vitest";
import { planContentSchema } from "@fitbud/contracts";
import { createMemoryDb } from "../test-support/memory-db.js";
import { insertMealAssignments, insertWorkoutAssignments } from "./assignment-schedule.js";
import { coachingRelationships, plans, planVersions, users } from "../db/schema.js";
import { createId, nowIso } from "../lib/crypto.js";
describe("assignment generation batching", () => {
  it("uses bounded D1 round trips for a 28-day window", async () => {
    const handle = await createMemoryDb();
    const db = handle.db;
    let statements = 0;
    const rawPrepare = handle.sqlite.run.bind(handle.sqlite);
    handle.sqlite.run = (sql: string, params?: unknown[]) => {
      statements += 1;
      return rawPrepare(sql, params);
    };

    const now = nowIso();
    const trainerId = createId();
    const traineeId = createId();
    const relId = createId();
    await db.insert(users).values([
      {
        id: trainerId,
        firebaseUid: "t1",
        accountState: "active",
        timezone: "Asia/Kolkata",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: traineeId,
        firebaseUid: "tr1",
        accountState: "active",
        timezone: "Asia/Kolkata",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(coachingRelationships).values({
      id: relId,
      trainerUserId: trainerId,
      traineeUserId: traineeId,
      status: "active",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const planId = createId();
    const versionId = createId();
    await db.insert(plans).values({
      id: planId,
      coachingRelationshipId: relId,
      title: "Demo",
      createdAt: now,
      updatedAt: now,
    });
    const content = planContentSchema.parse({
      workoutDays: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          order: 1,
          name: "Day A",
          weekday: 1,
          exercises: [],
        },
      ],
      mealPrescriptions: Array.from({ length: 5 }, (_, index) => ({
        id: `22222222-2222-4222-8222-22222222222${index}`,
        order: index + 1,
        name: `Meal ${index + 1}`,
        scheduleHint: "08:00",
        instructions: null,
        photoRequired: false,
      })),
    });
    await db.insert(planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      status: "effective",
      recordVersion: 1,
      contentJson: JSON.stringify(content),
      creationSource: "blank",
      publishedAt: now,
      effectiveFrom: now,
      createdAt: now,
      updatedAt: now,
    });

    const dates = Array.from({ length: 28 }, (_, index) => {
      const day = index + 1;
      return `2026-01-${String(day).padStart(2, "0")}`;
    });

    statements = 0;
    await insertWorkoutAssignments(db, {
      relationshipId: relId,
      planId,
      planVersionId: versionId,
      content,
      timeZone: "Asia/Kolkata",
      completionWindowHours: 24,
      dates,
      now,
    });
    const workoutStatements = statements;

    statements = 0;
    await insertMealAssignments(db, {
      relationshipId: relId,
      planId,
      planVersionId: versionId,
      content,
      timeZone: "Asia/Kolkata",
      confirmationWindowHours: 12,
      photoRequirement: "none",
      dates,
      now,
    });
    const mealStatements = statements;

    expect(workoutStatements).toBeLessThanOrEqual(10);
    expect(mealStatements).toBeLessThanOrEqual(10);
    handle.close();
  });
});
