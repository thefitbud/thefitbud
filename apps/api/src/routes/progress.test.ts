import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Minimal 1×1 PNG. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of [
    "0000_identity.sql",
    "0001_relationship_onboarding.sql",
    "0012_invitation_whatsapp.sql",
    "0002_coaching_configuration.sql",
    "0003_plans.sql",
    "0004_workouts.sql",
    "0005_meals.sql",
    "0006_checkins.sql",
    "0007_exceptions.sql",
    "0008_progress_media.sql",
    "0009_sync.sql",
    "0010_notifications.sql",
    "0013_domain_contracts.sql",
  "0014_onboarding_form_templates.sql",
    "0011_templates_libraries.sql",
    "0015_iteration_a.sql",
    "0016_food_exercise_libraries.sql",
    "0017_plan_template_ownership.sql",

    "0018_assignment_schedule_status.sql",
    "0019_checkin_form_templates.sql",
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return {
    db,
    close: () => sqlite.close(),
  };
}

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

function testEnv(media = createMemoryR2Bucket()): Env {
  return {
    DB: dummyD1(),
    MEDIA: media,
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
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`prog-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-prog-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `prog-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `prog-trainee-${suffix}`,
    `prog-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: createdBody.data.token,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Consistency",
          relevant_history: "None",
          preferences: "Home",
          schedule: "Mornings",
          limitations: "None",
        },
      }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-prog-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-prog-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
  };
}

describe("progress and R2 media", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated progress summary", async () => {
    const response = await app.request(
      "/progress/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects another trainer reading progress with 403/404", async () => {
    const owned = await reachCoachingReady("iso");
    const other = await createTrainerSession("other-prog@example.com");

    const response = await app.request(
      `/progress/relationships/${owned.relationshipId}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect([403, 404]).toContain(response.status);
  });

  it("persists trainee measurements with ownership", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("measure");

    const created = await app.request(
      `/progress/relationships/${relationshipId}/measurements`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "meas-1",
        },
        body: JSON.stringify({
          type: "body_weight_kg",
          value: 72.5,
          unit: "kg",
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as {
      data: { type: string; value: number; source: string };
    };
    expect(createdBody.data).toMatchObject({
      type: "body_weight_kg",
      value: 72.5,
      source: "trainee_entry",
    });

    const listed = await app.request(
      `/progress/relationships/${relationshipId}/measurements`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      data: { items: Array<{ value: number }> };
    };
    expect(listedBody.data.items[0]?.value).toBe(72.5);
  });

  it("uploads via time-limited URL and refuses object-key-as-auth downloads", async () => {
    const media = createMemoryR2Bucket();
    const env = testEnv(media);
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("upload");

    const target = await app.request(
      "/files/upload-targets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "upload-1",
        },
        body: JSON.stringify({
          coachingRelationshipId: relationshipId,
          mediaType: "progress_photo",
          contentType: "image/png",
          originalFilename: "progress.png",
        }),
      },
      env,
    );
    expect(target.status).toBe(200);
    const targetBody = (await target.json()) as {
      data: {
        mediaAsset: { id: string; status: string };
        uploadUrl: string;
        expiresAt: string;
      };
    };
    expect(targetBody.data.mediaAsset.status).toBe("pending_upload");
    expect(targetBody.data.uploadUrl).toContain("exp=");
    expect(targetBody.data.uploadUrl).toContain("sig=");
    expect(targetBody.data.uploadUrl).not.toContain("object_key");
    expect(JSON.stringify(targetBody)).not.toMatch(/relationships\//);

    const put = await app.request(
      targetBody.data.uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: PNG_BYTES,
      },
      env,
    );
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as {
      data: { status: string; id: string };
    };
    expect(putBody.data.status).toBe("ready");

    const download = await app.request(
      `/files/${targetBody.data.mediaAsset.id}/download-target`,
      { headers: { Cookie: trainerCookie } },
      env,
    );
    expect(download.status).toBe(200);
    const downloadBody = (await download.json()) as {
      data: { downloadUrl: string };
    };
    expect(downloadBody.data.downloadUrl).toContain("exp=");
    expect(downloadBody.data.downloadUrl).toContain("sig=");

    const content = await app.request(downloadBody.data.downloadUrl, {}, env);
    expect(content.status).toBe(200);
    expect(content.headers.get("content-type")).toMatch(/image\/png/i);

    const wrongOwner = await createTrainerSession("wrong-media@example.com");
    const denied = await app.request(
      `/files/${targetBody.data.mediaAsset.id}/download-target`,
      { headers: { Cookie: wrongOwner.cookie } },
      env,
    );
    expect([403, 404]).toContain(denied.status);

    // Knowing a plausible object key must not authorize download.
    const keyGuess = await app.request(
      `/files/relationships/${relationshipId}/progress_photo/${targetBody.data.mediaAsset.id}`,
      {},
      env,
    );
    expect(keyGuess.status).toBe(404);
  });

  it("creates progress entries linked to ready media", async () => {
    const media = createMemoryR2Bucket();
    const env = testEnv(media);
    const { traineeToken, relationshipId } = await reachCoachingReady("entry");

    const target = await app.request(
      "/files/upload-targets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "entry-upload",
        },
        body: JSON.stringify({
          coachingRelationshipId: relationshipId,
          mediaType: "progress_photo",
          contentType: "image/png",
        }),
      },
      env,
    );
    const targetBody = (await target.json()) as {
      data: { mediaAsset: { id: string }; uploadUrl: string };
    };
    await app.request(
      targetBody.data.uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: PNG_BYTES,
      },
      env,
    );

    const entry = await app.request(
      `/progress/relationships/${relationshipId}/entries`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "entry-1",
        },
        body: JSON.stringify({
          entryType: "progress_photo",
          title: "Week 1",
          mediaAssetId: targetBody.data.mediaAsset.id,
        }),
      },
      env,
    );
    expect(entry.status).toBe(200);

    const summary = await app.request(
      `/progress/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      env,
    );
    expect(summary.status).toBe(200);
    const summaryBody = (await summary.json()) as {
      data: {
        entries: Array<{ title: string | null }>;
        media: Array<{ id: string }>;
      };
    };
    expect(summaryBody.data.entries[0]?.title).toBe("Week 1");
    expect(summaryBody.data.media.some((m) => m.id === targetBody.data.mediaAsset.id)).toBe(
      true,
    );
  });
});
