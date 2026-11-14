import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { drizzle } from "drizzle-orm/d1";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";


/** Minimal 1×1 PNG. */
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);


import {
  createMemoryDb as createSharedMemoryDb,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";


/**
 * Concurrent-edit ordering for this file's tests only (Z7-22). Returns a copy
 * of `db` whose first `parties` reads of `table` each run, then hold their
 * result until all `parties` have read. Every handler has its recordVersion
 * snapshot before any of them writes, so a 409 can only come from the
 * versioned update missing the row. Later reads pass straight through.
 */
function holdFirstReadsOf(db: Db, table: string, parties: number): Db {
  // drizzle() keeps the D1 binding on `$client`; the `Db` type omits it.
  const d1 = (db as Db & { $client: D1Database }).$client;
  const reads = new RegExp(`^select\\b[\\s\\S]*\\bfrom "${table}"`, "i");
  let arrived = 0;
  let open: () => void = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  async function hold<T>(result: T): Promise<T> {
    if (arrived >= parties) return result;
    arrived += 1;
    if (arrived >= parties) open();
    await opened;
    return result;
  }
  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      all: async () => hold(await statement.all()),
      raw: async () => hold(await statement.raw()),
      first: async (column?: string) => hold(await statement.first(column as string)),
      run: () => statement.run(),
    } as unknown as D1PreparedStatement;
  }
  const gated = {
    prepare: (query: string) => {
      const statement = d1.prepare(query);
      return reads.test(query) ? wrap(statement) : statement;
    },
    batch: (statements: D1PreparedStatement[]) => d1.batch(statements),
    exec: (query: string) => d1.exec(query),
    dump: () => d1.dump(),
  } as unknown as D1Database;
  return drizzle(gated, { schema });
}

async function createMemoryDb(): Promise<{
  db: Db;
  close: () => void;
  sqlite: SqlJsCompatDatabase;
}> {
  const handle = await createSharedMemoryDb();
  return { db: handle.db, close: handle.close, sqlite: handle.sqlite };
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
    ENVIRONMENT: "local",
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
  let db: Db;
  let sqlite: SqlJsCompatDatabase;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    db = memory.db;
    sqlite = memory.sqlite;
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

  describe("coach log is one transaction (Z7-22)", () => {
    async function postMeasurement(
      relationshipId: string,
      cookie: string,
      key: string,
      value: number,
    ) {
      const response = await app.request(
        `/progress/relationships/${relationshipId}/measurements`,
        {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({ type: "body_weight_kg", value, unit: "kg" }),
        },
        testEnv(),
      );
      const text = await response.text();
      return {
        status: response.status,
        body: (text ? JSON.parse(text) : null) as {
          data?: { id: string; recordVersion: number };
          error?: { code: string };
        },
      };
    }

    it("concurrent creates on one relationship both store an audit and distinct sequences", async () => {
      const { trainerCookie, relationshipId } = await reachCoachingReady("z722-race");
      const [first, second] = await Promise.all([
        postMeasurement(relationshipId, trainerCookie, "z722-m-a", 72.5),
        postMeasurement(relationshipId, trainerCookie, "z722-m-b", 73.1),
      ]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const rows = await db
        .select()
        .from(schema.measurements)
        .where(eq(schema.measurements.coachingRelationshipId, relationshipId));
      expect(rows).toHaveLength(2);
      const audits = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.coachingRelationshipId, relationshipId));
      expect(audits).toHaveLength(2);
      expect(audits.every((audit) => audit.action === "create")).toBe(true);
      const changes = await db
        .select()
        .from(schema.changeLog)
        .where(eq(schema.changeLog.coachingRelationshipId, relationshipId));
      const sequences = changes
        .filter((change) => change.entityType === "measurement")
        .map((change) => change.sequence);
      expect(sequences).toHaveLength(2);
      expect(new Set(sequences).size).toBe(2);

      const feed = await app.request(
        "/activity/feed?limit=50",
        { headers: { Cookie: trainerCookie } },
        testEnv(),
      );
      expect(feed.status).toBe(200);
      const events = (
        (await feed.json()) as { data: { events: Array<{ id: string; type: string }> } }
      ).data.events;
      for (const audit of audits) {
        expect(events.some((event) => event.id === `log_edit:${audit.id}` && event.type === "coach_logged")).toBe(
          true,
        );
      }
    });

    it("rolls the measurement back when the audit write fails", async () => {
      const { trainerCookie, relationshipId } = await reachCoachingReady("z722-rollback");
      sqlite.exec(
        "CREATE TRIGGER z722_fail_measurement_audit BEFORE INSERT ON log_edit_events BEGIN SELECT RAISE(ABORT, 'z722 injected failure'); END",
      );
      // The injected failure is logged as an unhandled error; the Z12-35 console gate
      // (D-W12-28) needs the test to expect that log line.
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const failed = await postMeasurement(relationshipId, trainerCookie, "z722-m-fail", 70);
      sqlite.exec("DROP TRIGGER z722_fail_measurement_audit");
      expect(failed.status).toBe(500);
      expect(errors).toHaveBeenCalledWith(expect.stringContaining('"message":"Unhandled API error"'));
      errors.mockRestore();
      const rows = await db
        .select()
        .from(schema.measurements)
        .where(eq(schema.measurements.coachingRelationshipId, relationshipId));
      expect(rows).toHaveLength(0);
      const audits = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.coachingRelationshipId, relationshipId));
      expect(audits).toHaveLength(0);

      const retried = await postMeasurement(relationshipId, trainerCookie, "z722-m-retry", 70);
      expect(retried.status).toBe(200);
      const stored = await db
        .select()
        .from(schema.measurements)
        .where(eq(schema.measurements.coachingRelationshipId, relationshipId));
      expect(stored).toHaveLength(1);
      const audit = await db
        .select()
        .from(schema.logEditEvents)
        .where(eq(schema.logEditEvents.entityId, stored[0]!.id));
      expect(audit).toHaveLength(1);
    });

    it("concurrent edits return VERSION_CONFLICT and a single new version", async () => {
      const { trainerCookie, relationshipId } = await reachCoachingReady("z722-edit");
      const created = await postMeasurement(relationshipId, trainerCookie, "z722-m-create", 70);
      expect(created.status).toBe(200);
      const measurementId = created.body.data!.id;

      async function patch(value: number, recordVersion: number) {
        const response = await app.request(
          `/progress/measurements/${measurementId}`,
          {
            method: "PATCH",
            headers: {
              Cookie: trainerCookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ recordVersion, value }),
          },
          testEnv(),
        );
        const text = await response.text();
        return {
          status: response.status,
          body: (text ? JSON.parse(text) : null) as {
            data?: { value: number; recordVersion: number };
            error?: { code: string };
          },
        };
      }

      const [before] = await db
        .select()
        .from(schema.measurements)
        .where(eq(schema.measurements.id, measurementId));
      const recordVersion = before!.recordVersion;
      // Both handlers read this version before either write. The 409 comes
      // from the versioned update missing the row, not from a later read.
      setTestDbOverride(holdFirstReadsOf(db, "measurements", 2));
      try {
        const [first, second] = await Promise.all([
          patch(71, recordVersion),
          patch(72, recordVersion),
        ]);
        const statuses = [first.status, second.status].sort((a, b) => a - b);
        expect(statuses).toEqual([200, 409]);
        const conflict = first.status === 409 ? first : second;
        const winner = first.status === 200 ? first : second;
        expect(conflict.body.error?.code).toBe("VERSION_CONFLICT");
        const [row] = await db
          .select()
          .from(schema.measurements)
          .where(eq(schema.measurements.id, measurementId));
        expect(row!.recordVersion).toBe(recordVersion + 1);
        expect(row!.value).toBe(winner.body.data!.value);
        expect([71, 72]).toContain(row!.value);
        const audits = await db
          .select()
          .from(schema.logEditEvents)
          .where(eq(schema.logEditEvents.entityId, measurementId));
        expect(audits.map((audit) => audit.action).sort()).toEqual(["create", "edit"]);
        const changes = await db
          .select()
          .from(schema.changeLog)
          .where(eq(schema.changeLog.recordId, measurementId));
        expect(changes).toHaveLength(2);
      } finally {
        setTestDbOverride(db);
      }
    });
  });
});
