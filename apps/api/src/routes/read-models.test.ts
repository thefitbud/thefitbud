import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { formatLocalDate, istDate } from "@fitbud/core";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`read-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-read-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `read-trainee-${suffix}@example.com`,
        recipientDisplayName: `Read Trainee ${suffix}`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `read-trainee-${suffix}`,
    `read-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: createdBody.data.token }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  return {
    trainerCookie: trainer.cookie,
    relationshipId: acceptBody.data.relationship.id,
    traineeUserId: acceptBody.data.relationship.traineeUserId,
  };
}

function collectPercentKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPercentKeys(entry, keys);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (/percent/i.test(key)) {
        keys.add(key);
      }
      collectPercentKeys(nested, keys);
    }
  }
}

const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";

describe("read models", () => {
  let db: Db;
  let close: () => void;
  let queryCounter: { count: number; reset: () => void };

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN_REFERENCE_INSTANT));
    const handle = await createMemoryDb();
    db = handle.db;
    queryCounter = handle.queryCounter;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  it("returns attention groups without percent keys when groupBy=relationship", async () => {
    const ctx = await reachCoachingReady("attention");
    const now = nowIso();
    await db.insert(schema.exceptions).values({
      id: createId(),
      coachingRelationshipId: ctx.relationshipId,
      type: "skipped_meal",
      severity: "attention",
      status: "active",
      ruleVersion: "test",
      sourceEntityType: "meal_assignment",
      sourceEntityId: createId(),
      summary: "Skipped breakfast",
      detectedAt: now,
      resolvedAt: null,
      resolutionOutcome: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=20",
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const percentKeys = new Set<string>();
    collectPercentKeys(JSON.parse(text), percentKeys);
    expect(percentKeys.size).toBe(0);
    expect(text.toLowerCase()).not.toContain("percent");
  });

  it("serves trainer week read model within ten SQL prepares", async () => {
    const ctx = await reachCoachingReady("week");
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    queryCounter.reset();
    const response = await app.request(
      `/workspaces/relationships/${ctx.relationshipId}/week?start=${today}`,
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    // Workouts + meals + trainee timezone + effective plan for todayNutrition.
    expect(queryCounter.count).toBeLessThanOrEqual(12);
    const body = (await response.json()) as {
      data: {
        days: unknown[];
        todayNutrition: {
          date: string;
          logged: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
            hasUnknown?: boolean;
          };
          assigned: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
          } | null;
        };
      };
    };
    expect(body.data.days).toHaveLength(7);
    expect(body.data.todayNutrition.date).toBe(today);
    expect(body.data.todayNutrition.logged).toEqual({
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
    expect(body.data.todayNutrition.assigned).toBeNull();
  });

  it("includes todayNutrition logged and assigned macros without percent", async () => {
    const ctx = await reachCoachingReady("week-nutrition");
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const now = nowIso();
    const planId = createId();
    const versionId = createId();
    const assignmentId = createId();
    const mealId = createId();
    const foodId = createId();

    const mealPrescription = {
      id: mealId,
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "13:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          snapshotKind: "legacy" as const,
          name: "Dal",
          classification: null,
          basis: null,
          canonical: null,
          serving: { label: "1 katori", unit: "serving", conversionScaled: null },
          quantityScaled: NUTRIENT_SCALE,
          calculated: {
            energyKcalScaled: 520 * NUTRIENT_SCALE,
            proteinScaled: 24 * NUTRIENT_SCALE,
            carbsScaled: 60 * NUTRIENT_SCALE,
            fatScaled: 12 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    };

    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: ctx.relationshipId,
      title: "Nutrition week plan",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "effective",
      contentJson: JSON.stringify({
        workoutDays: [],
        mealPrescriptions: [mealPrescription],
      }),
      creationSource: "blank",
      publishedAt: now,
      effectiveFrom: now,
      effectiveTo: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: ctx.relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: mealId,
      mealName: "Lunch",
      mealPrescriptionJson: JSON.stringify(mealPrescription),
      localDate: today,
      windowStartsAt: now,
      windowEndsAt: now,
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.mealCompliance).values({
      id: createId(),
      assignmentId,
      coachingRelationshipId: ctx.relationshipId,
      planVersionId: versionId,
      traineeUserId: ctx.traineeUserId,
      outcome: "modified",
      recordVersion: 0,
      loggedAt: now,
      localDate: today,
      deviationKind: "logged_foods",
      notes: null,
      photoRequired: false,
      photoIntentJson: null,
      mediaAssetId: null,
      itemsJson: JSON.stringify([{ foodId, quantity: 1 }]),
      kcalScaled: 480 * NUTRIENT_SCALE,
      proteinScaled: 22 * NUTRIENT_SCALE,
      carbsScaled: 55 * NUTRIENT_SCALE,
      fatScaled: 11 * NUTRIENT_SCALE,
      loggedLate: false,
      loggedAfterResolve: false,
      clientLoggedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await app.request(
      `/workspaces/relationships/${ctx.relationshipId}/week?start=${today}`,
      { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    const percentKeys = new Set<string>();
    collectPercentKeys(JSON.parse(text), percentKeys);
    expect(percentKeys.size).toBe(0);

    const body = JSON.parse(text) as {
      data: {
        todayNutrition: {
          date: string;
          logged: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
            hasUnknown?: boolean;
          };
          assigned: {
            kcal: number;
            proteinG: number;
            carbsG: number;
            fatG: number;
          } | null;
        };
      };
    };
    expect(body.data.todayNutrition).toEqual({
      date: today,
      logged: { kcal: 480, proteinG: 22, carbsG: 55, fatG: 11 },
      assigned: { kcal: 520, proteinG: 24, carbsG: 60, fatG: 12 },
    });
  });

  it("computes todayNutrition.date in the trainee timezone across the UTC date line", async () => {
    const ctx = await reachCoachingReady("week-ist");
    await db
      .update(schema.users)
      .set({ timezone: "Asia/Kolkata" })
      .where(eq(schema.users.id, ctx.traineeUserId));

    for (const instant of [
      "2026-10-17T23:30:00.000Z",
      "2026-10-17T19:00:00.000Z",
    ]) {
      vi.setSystemTime(new Date(instant));
      const expected = istDate(new Date(instant));
      const response = await app.request(
        `/workspaces/relationships/${ctx.relationshipId}/week?start=${expected}`,
        { headers: { Cookie: ctx.trainerCookie, "x-fitbud-role": "trainer" } },
        testEnv(),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { todayNutrition: { date: string } };
      };
      expect(body.data.todayNutrition.date).toBe("2026-10-18");
      expect(body.data.todayNutrition.date).toBe(expected);
    }
  });
});
