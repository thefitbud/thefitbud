import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate } from "@fitbud/core";
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

describe("read models", () => {
  let db: Db;
  let close: () => void;
  let queryCounter: { count: number; reset: () => void };

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    queryCounter = handle.queryCounter;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
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
    expect(queryCounter.count).toBeLessThanOrEqual(10);
    const body = (await response.json()) as { data: { days: unknown[] } };
    expect(body.data.days).toHaveLength(7);
  });
});
