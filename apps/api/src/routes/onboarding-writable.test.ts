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
    ENVIRONMENT: "local",
  };
}

async function inviteAndAccept(suffix: string) {
  const trainerToken = createTestIdToken(`obw-coach-${suffix}`, `obw-coach-${suffix}@example.com`);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: trainerToken, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  const cookie = sessionResponse.headers.get("set-cookie")!.split(";")[0]!;
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-obw-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `obw-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `obw-trainee-${suffix}`,
    `obw-trainee-${suffix}@example.com`,
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
  return { traineeToken, relationshipId: acceptBody.data.relationship.id };
}

describe("onboarding writable guard", () => {
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

  it("blocks submit when the coaching relationship has ended", async () => {
    const { traineeToken, relationshipId } = await inviteAndAccept("ended");
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, relationshipId));

    const response = await app.request(
      `/onboarding/relationships/${relationshipId}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "obw-submit-ended",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RELATIONSHIP_ENDED");
  });
});
