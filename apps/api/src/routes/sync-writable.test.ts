import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { nowIso } from "../lib/crypto.js";
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
  const trainer = await createTrainerSession(`syncw-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-syncw-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `syncw-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `syncw-trainee-${suffix}`,
    `syncw-trainee-${suffix}@example.com`,
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
    data: { relationship: { id: string } };
  };
  return {
    traineeToken,
    relationshipId: acceptBody.data.relationship.id,
  };
}

describe("sync writable guard", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("returns conflicted when pushing mutations for an ended relationship", async () => {
    const { traineeToken, relationshipId } = await reachCoachingReady("ended");
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, relationshipId));

    const measurementId = "00000000-0000-4000-8000-00000000a101";
    const mutationId = "00000000-0000-4000-8000-00000000a102";
    const push = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [
            {
              mutationId,
              idempotencyKey: mutationId,
              entityType: "measurement",
              recordId: measurementId,
              operation: "measurement.create",
              expectedServerVersion: null,
              clientOccurredAt: "2026-09-26T12:00:00.000Z",
              payload: {
                coachingRelationshipId: relationshipId,
                id: measurementId,
                body: {
                  id: measurementId,
                  type: "body_weight_kg",
                  value: 70,
                  unit: "kg",
                },
              },
            },
          ],
        }),
      },
      testEnv(),
    );
    expect(push.status).toBe(200);
    const body = (await push.json()) as {
      data: {
        results: Array<{ status: string; error?: { code: string } }>;
      };
    };
    expect(body.data.results[0]?.status).toBe("conflicted");
    expect(body.data.results[0]?.error?.code).toBe("RELATIONSHIP_ENDED");
  });
});
