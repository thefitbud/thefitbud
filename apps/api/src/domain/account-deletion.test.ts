import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createWebSession } from "../auth/identity.js";
import { createId } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import {
  ACCOUNT_DELETION_PROOF_WINDOW_MS,
  addCalendarMonthsUtc,
  archiveAccount,
  isArchivedAccount,
  isFreshDeletionProof,
  reactivateAccount,
  signedInAfterArchive,
} from "./account-deletion.js";

describe("addCalendarMonthsUtc", () => {
  it.each([
    ["2026-01-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z"],
    ["2026-08-31T10:00:00.000Z", "2027-02-28T10:00:00.000Z"],
    ["2027-08-31T10:00:00.000Z", "2028-02-29T10:00:00.000Z"],
    ["2026-12-31T23:59:59.999Z", "2027-06-30T23:59:59.999Z"],
    ["2026-05-31T00:00:00.000Z", "2026-11-30T00:00:00.000Z"],
    ["2026-11-06T18:00:00.000Z", "2027-05-06T18:00:00.000Z"],
  ])("%s + 6 months = %s (UTC, clamped to month end)", (from, expected) => {
    expect(addCalendarMonthsUtc(from, 6)).toBe(expected);
  });

  it("rejects an invalid instant", () => {
    expect(() => addCalendarMonthsUtc("not-a-date", 6)).toThrow("INVALID_INSTANT");
  });
});

describe("fresh proof and signing in again", () => {
  const now = "2026-11-06T12:00:00.000Z";
  const at = (offsetMs: number) => new Date(Date.parse(now) + offsetMs).toISOString();

  it("accepts a sign-in up to 5 minutes old and nothing older", () => {
    expect(ACCOUNT_DELETION_PROOF_WINDOW_MS).toBe(300_000);
    expect(isFreshDeletionProof(now, now)).toBe(true);
    expect(isFreshDeletionProof(at(-300_000), now)).toBe(true);
    expect(isFreshDeletionProof(at(-300_001), now)).toBe(false);
    expect(isFreshDeletionProof(at(30_000), now)).toBe(true);
    expect(isFreshDeletionProof(at(61_000), now)).toBe(false);
    expect(isFreshDeletionProof(null, now)).toBe(false);
    expect(isFreshDeletionProof(undefined, now)).toBe(false);
    expect(isFreshDeletionProof("garbage", now)).toBe(false);
  });

  it("counts only a sign-in at or after the archive second as signing in again", () => {
    const archivedAt = "2026-11-06T12:00:00.750Z";
    expect(signedInAfterArchive("2026-11-06T12:00:00.000Z", archivedAt)).toBe(true);
    expect(signedInAfterArchive("2026-11-06T12:05:00.000Z", archivedAt)).toBe(true);
    expect(signedInAfterArchive("2026-11-06T11:59:59.000Z", archivedAt)).toBe(false);
    expect(signedInAfterArchive(null, archivedAt)).toBe(false);
  });
});

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function trainerCookie(email: string) {
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: createTestIdToken(`trainer-${email}`, email) }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { userId: string } };
  return { userId: body.data.userId, cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

/** Invites and accepts through the routes; returns the relationship id. */
async function coach(trainerCookieValue: string, traineeUid: string, email: string) {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainerCookieValue,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-${traineeUid}-${email}`,
      },
      body: JSON.stringify({ recipientEmail: email }),
    },
    testEnv(),
  );
  const { data } = (await created.json()) as { data: { token: string } };
  const accepted = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${createTestIdToken(traineeUid, email)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: data.token }),
    },
    testEnv(),
  );
  expect(accepted.status).toBe(200);
  const body = (await accepted.json()) as { data: { relationship: { id: string } } };
  return body.data.relationship.id;
}

async function userIdFor(db: Db, uid: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.firebaseUid, uid));
  return row!.id;
}

async function addDeviceToken(db: Db, userId: string, slug: string) {
  const timestamp = new Date().toISOString();
  await db.insert(schema.deviceTokens).values({
    id: createId(),
    userId,
    platform: "android",
    provider: "expo",
    token: `ExponentPushToken[${slug}]`,
    installationId: `install-${slug}`,
    status: "active",
    lastSeenAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe("archiveAccount and reactivateAccount on persisted data", () => {
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
    vi.restoreAllMocks();
  });

  it("completes on retry after a crash between ending coaching and archiving", async () => {
    const t1 = await trainerCookie("first.coach@example.com");
    const t2 = await trainerCookie("second.coach@example.com");
    const r1 = await coach(t1.cookie, "trainee-retry", "retry.client@example.com");
    const r2 = await coach(t2.cookie, "trainee-retry", "retry.client@example.com");
    const userId = await userIdFor(db, "trainee-retry");
    await addDeviceToken(db, userId, "retry");
    await createWebSession(db, userId);

    // The two relationship ends are batches 1 and 2; the archive batch (3) fails.
    const realBatch = db.batch.bind(db);
    let calls = 0;
    vi.spyOn(db, "batch").mockImplementation(((queries: Parameters<typeof db.batch>[0]) => {
      calls += 1;
      if (calls === 3) return Promise.reject(new Error("D1_ERROR: network lost"));
      return realBatch(queries);
    }) as unknown as typeof db.batch);

    const now = new Date().toISOString();
    await expect(archiveAccount(db, { userId, now })).rejects.toThrow("network lost");
    const relationships = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.traineeUserId, userId));
    expect(relationships.map((row) => row.status)).toEqual(["ended", "ended"]);
    const [midway] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(midway!.accountState).toBe("active");
    const [tokenMidway] = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, userId));
    expect(tokenMidway!.status).toBe("active");

    const retryAt = new Date(Date.parse(now) + 5_000).toISOString();
    const result = await archiveAccount(db, { userId, now: retryAt });
    expect(result).toEqual({
      kind: "archived",
      archivedAt: retryAt,
      purgeAfter: addCalendarMonthsUtc(retryAt, 6),
    });
    const [token] = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, userId));
    expect(token!.status).toBe("revoked");
    const sessions = await db
      .select()
      .from(schema.webSessions)
      .where(eq(schema.webSessions.userId, userId));
    expect(sessions.every((session) => session.revokedAt === retryAt)).toBe(true);
    // The ended relationships kept their first end time.
    const after = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.traineeUserId, userId));
    expect(after.map((row) => row.endedAt)).toEqual(relationships.map((row) => row.endedAt));
    expect([r1, r2].sort()).toEqual(after.map((row) => row.id).sort());

    // A second call changes nothing.
    expect(await archiveAccount(db, { userId, now: new Date().toISOString() })).toEqual({
      kind: "not_active",
    });
    const [final] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(final!.archivedAt).toBe(retryAt);
  });

  it("does not archive or sign out when a client starts between the check and the batch", async () => {
    const trainer = await trainerCookie("race.coach@example.com");
    const userId = trainer.userId;
    const other = await trainerCookie("other.coach@example.com");
    await coach(other.cookie, "trainee-race", "race.client@example.com");
    const traineeId = await userIdFor(db, "trainee-race");
    await addDeviceToken(db, userId, "race");

    const realBatch = db.batch.bind(db);
    vi.spyOn(db, "batch").mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      // An invitation is accepted at this moment: the trainer now has a client.
      const timestamp = new Date().toISOString();
      await db.insert(schema.coachingRelationships).values({
        id: createId(),
        trainerUserId: userId,
        traineeUserId: traineeId,
        status: "active",
        startedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return realBatch(queries);
    }) as unknown as typeof db.batch);

    const result = await archiveAccount(db, { userId, now: new Date().toISOString() });
    expect(result).toEqual({ kind: "active_clients" });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(row!.accountState).toBe("active");
    expect(row!.archivedAt).toBeNull();
    const [token] = await db
      .select()
      .from(schema.deviceTokens)
      .where(eq(schema.deviceTokens.userId, userId));
    expect(token!.status).toBe("active");
    const sessions = await db
      .select()
      .from(schema.webSessions)
      .where(eq(schema.webSessions.userId, userId));
    expect(sessions.every((session) => session.revokedAt === null)).toBe(true);
  });

  it("ends a coaching relationship that starts as trainee during the deletion, then archives", async () => {
    const t1 = await trainerCookie("late.coach@example.com");
    await coach(t1.cookie, "trainee-late", "late.client@example.com");
    const userId = await userIdFor(db, "trainee-late");
    const t2 = await trainerCookie("later.coach@example.com");

    const realBatch = db.batch.bind(db);
    let inserted = false;
    vi.spyOn(db, "batch").mockImplementation((async (queries: Parameters<typeof db.batch>[0]) => {
      // Batch 1 ends the first relationship; just before the archive batch (2), a
      // second one starts.
      if (!inserted && (db.batch as unknown as { mock: { calls: unknown[] } }).mock.calls.length === 2) {
        inserted = true;
        const timestamp = new Date().toISOString();
        await db.insert(schema.coachingRelationships).values({
          id: createId(),
          trainerUserId: t2.userId,
          traineeUserId: userId,
          status: "active",
          startedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      return realBatch(queries);
    }) as unknown as typeof db.batch);

    const result = await archiveAccount(db, { userId, now: new Date().toISOString() });
    expect(inserted).toBe(true);
    expect(result.kind).toBe("archived");
    const relationships = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.traineeUserId, userId));
    expect(relationships).toHaveLength(2);
    expect(relationships.every((row) => row.status === "ended")).toBe(true);
  });

  it("reactivates only an archived account before its purge date", async () => {
    const trainer = await trainerCookie("reactivate.coach@example.com");
    const archivedAt = new Date().toISOString();
    expect((await archiveAccount(db, { userId: trainer.userId, now: archivedAt })).kind).toBe(
      "archived",
    );
    expect(await isArchivedAccount(db, { userId: trainer.userId })).toBe(true);
    expect(
      await isArchivedAccount(db, { firebaseUid: "trainer-reactivate.coach@example.com" }),
    ).toBe(true);

    const pastPurge = addCalendarMonthsUtc(archivedAt, 7);
    expect(await reactivateAccount(db, { userId: trainer.userId, now: pastPurge })).toEqual({
      kind: "purge_due",
    });
    expect(await reactivateAccount(db, { userId: trainer.userId, now: archivedAt })).toEqual({
      kind: "reactivated",
    });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, trainer.userId));
    expect(row).toMatchObject({ accountState: "active", archivedAt: null, purgeAfter: null });
    expect(await isArchivedAccount(db, { userId: trainer.userId })).toBe(false);
    expect(await reactivateAccount(db, { userId: trainer.userId, now: archivedAt })).toEqual({
      kind: "already_active",
    });
  });

  it("finds an archived account by its sign-in email", async () => {
    const trainer = await trainerCookie("email.coach@example.com");
    const timestamp = new Date().toISOString();
    await db.insert(schema.userIdentities).values({
      userId: trainer.userId,
      email: "Email.Coach@example.com",
      emailNorm: "email.coach@example.com",
      mobileE164: null,
      passwordHash: null,
      passwordUpdatedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(await isArchivedAccount(db, { emailNorm: "email.coach@example.com" })).toBe(false);
    await archiveAccount(db, { userId: trainer.userId, now: timestamp });
    expect(await isArchivedAccount(db, { emailNorm: "email.coach@example.com" })).toBe(true);
    expect(await isArchivedAccount(db, { emailNorm: "someone.else@example.com" })).toBe(false);
  });
});
