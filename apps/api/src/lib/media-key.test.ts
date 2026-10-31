import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { mediaAssets } from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "./memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { mediaKey } from "./media-key.js";
import type { Env } from "../types.js";

const STORED_KEY =
  "relationships/7d1c0f7e-0b3a-4c39-9b8e-2f4f3c1a9d10/progress_photo/0f8a6a3e-5b0e-4c2b-8f43-9d7b1e2c4a55";

describe("mediaKey", () => {
  it("applies the environment prefix", () => {
    expect(mediaKey({ MEDIA_PREFIX: "staging/" }, STORED_KEY)).toBe(
      `staging/${STORED_KEY}`,
    );
  });

  it("returns the stored key unchanged without a prefix", () => {
    expect(mediaKey({}, STORED_KEY)).toBe(STORED_KEY);
    expect(mediaKey({ MEDIA_PREFIX: "" }, STORED_KEY)).toBe(STORED_KEY);
  });

  it("rejects a key containing '..'", () => {
    expect(() => mediaKey({}, "relationships/../other")).toThrow();
    expect(() =>
      mediaKey({ MEDIA_PREFIX: "staging/" }, "../production/key"),
    ).toThrow();
  });

  it("rejects a key that already has the prefix", () => {
    expect(() =>
      mediaKey({ MEDIA_PREFIX: "staging/" }, `staging/${STORED_KEY}`),
    ).toThrow();
  });
});

/** Minimal 1×1 PNG. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

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

function stagingEnv(media: R2Bucket): Env {
  const env: Env & { MEDIA_PREFIX: string } = {
    DB: dummyD1(),
    MEDIA: media,
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    MEDIA_PREFIX: "staging/",
  };
  return env;
}

describe("files routes with MEDIA_PREFIX", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("stores the D1 key without the prefix and reads and writes R2 under it", async () => {
    const media = createMemoryR2Bucket();
    const env = stagingEnv(media);

    const trainerToken = createTestIdToken("media-prefix-coach", "media-prefix-coach@example.com");
    const session = await app.request(
      "/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: trainerToken, timezone: "Asia/Kolkata" }),
      },
      env,
    );
    expect(session.status).toBe(200);
    const trainerCookie = session.headers.get("set-cookie")!.split(";")[0]!;

    const invitation = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-media-prefix",
        },
        body: JSON.stringify({ recipientEmail: "media-prefix-trainee@example.com" }),
      },
      env,
    );
    const invitationBody = (await invitation.json()) as { data: { token: string } };
    const traineeToken = createTestIdToken(
      "media-prefix-trainee",
      "media-prefix-trainee@example.com",
    );
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: invitationBody.data.token, timezone: "Asia/Kolkata" }),
      },
      env,
    );
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    const traineeHeaders = {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    };

    const target = await app.request(
      "/files/upload-targets",
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "upload-media-prefix" },
        body: JSON.stringify({
          coachingRelationshipId: acceptBody.data.relationship.id,
          mediaType: "progress_photo",
          contentType: "image/png",
          originalFilename: "progress.png",
        }),
      },
      env,
    );
    expect(target.status).toBe(200);
    const targetBody = (await target.json()) as {
      data: { mediaAsset: { id: string }; uploadUrl: string };
    };
    const mediaAssetId = targetBody.data.mediaAsset.id;

    const put = await app.request(
      targetBody.data.uploadUrl,
      { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG_BYTES },
      env,
    );
    expect(put.status).toBe(200);

    const [asset] = await db
      .select({ objectKey: mediaAssets.objectKey })
      .from(mediaAssets)
      .where(eq(mediaAssets.id, mediaAssetId));
    expect(asset!.objectKey).toMatch(/^relationships\//);
    expect(await media.head(asset!.objectKey)).toBeNull();
    expect(await media.head(`staging/${asset!.objectKey}`)).not.toBeNull();

    const confirm = await app.request(
      `/files/${mediaAssetId}/confirm`,
      {
        method: "POST",
        headers: { ...traineeHeaders, "Idempotency-Key": "confirm-media-prefix" },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(confirm.status).toBe(200);

    const download = await app.request(
      `/files/${mediaAssetId}/download-target`,
      { headers: { Cookie: trainerCookie } },
      env,
    );
    expect(download.status).toBe(200);
    const downloadBody = (await download.json()) as { data: { downloadUrl: string } };
    const content = await app.request(downloadBody.data.downloadUrl, {}, env);
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(PNG_BYTES);
  });
});
