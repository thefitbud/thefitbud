import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { hashPassword } from "../auth/password.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { mediaKey } from "../lib/media-key.js";
import {
  createMemoryDb,
  type MemoryDbHandle,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { Env } from "../types.js";
import {
  ACCOUNT_PURGE_BATCH_LIMIT,
  DELETED_USER_EMAIL,
  DELETED_USER_NAME,
  REMOVED_TEXT,
  runAccountPurge,
} from "./account-purge.js";

/**
 * Z6-17: the account purge, on accounts and history created through the
 * production routes and archived through Z6-14's `POST /account/deletion`.
 */

const PASSWORD = "Strong-pass-2026";
const MEDIA_PREFIX = "staging/";

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

let media: R2Bucket;

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: dummyD1(),
    MEDIA: media,
    MEDIA_PREFIX,
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    EMAIL_PROVIDER: "dev_sink",
    ...overrides,
  } as Env;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

type Json = Record<string, unknown> & {
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Json }> {
  const response = await app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    testEnv(),
  );
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Json) : {} };
}

let keySeq = 0;
const key = (label: string) => `${label}-${(keySeq += 1)}`;

async function trainerSession(email: string) {
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: createTestIdToken(`fb-${email}`, email, nowSeconds()),
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { userId: string } };
  return {
    userId: body.data.userId,
    uid: `fb-${email}`,
    email,
    headers: { Cookie: response.headers.get("set-cookie")!.split(";")[0]! },
  };
}

function bearer(uid: string, email: string) {
  return {
    Authorization: `Bearer ${createTestIdToken(uid, email, nowSeconds())}`,
    "x-fitbud-role": "trainee",
  };
}

type Person = {
  userId: string;
  uid: string;
  email: string;
  emailNorm: string;
  mobile: string;
  name: string;
  relationshipId: string;
};

/**
 * A trainee coached by `trainer`, with the history a real client builds up:
 * invitation (name, email, WhatsApp), accepted invite, intake answers that
 * mention their phone and email, trainer review, password identity with a
 * phone, device token, a sign-in code request, measurement, progress photo in
 * R2, a note the coach shared with them (a notification), a subscription and a
 * payment, and an edit in the log history made by the trainee.
 */
async function coachedTrainee(
  db: Db,
  trainer: { userId: string; headers: Record<string, string> },
  slug: string,
): Promise<Person> {
  const name = `Priya ${slug[0]!.toUpperCase()}${slug.slice(1)}wala`;
  const email = `Priya.${slug}@Example.com`;
  const emailNorm = email.toLowerCase();
  const suffix = Array.from(slug).reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100_000, 7);
  const mobile = `+9198123${String(suffix).padStart(5, "0")}`;
  const uid = `fb-trainee-${slug}`;

  const invited = await call("/invitations", {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": key("inv") },
    body: { recipientEmail: email, recipientDisplayName: name, recipientWhatsapp: mobile },
  });
  expect(invited.status).toBe(200);
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: bearer(uid, emailNorm),
    body: { token: invited.body.data!.token as string, timezone: "Asia/Kolkata" },
  });
  expect(accepted.status).toBe(200);
  const relationshipId = (accepted.body.data!.relationship as { id: string }).id;
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.firebaseUid, uid))
    .limit(1);
  const userId = user!.id;
  const trainee = bearer(uid, emailNorm);

  // The accept path names the profile after the invitation.
  await db
    .update(schema.traineeProfiles)
    .set({ displayName: name, dateOfBirth: "1994-03-12", gender: "female" })
    .where(eq(schema.traineeProfiles.userId, userId));

  const draft = await call(`/onboarding/relationships/${relationshipId}/draft`, {
    method: "PUT",
    headers: trainee,
    body: {
      expectedVersion: 0,
      answers: {
        goals: "Lose 6 kg before my sister's wedding",
        relevant_history: "Knee pain after long runs",
        preferences: "Home workouts",
        schedule: `Mornings. WhatsApp me on ${mobile} or mail ${email}`,
        limitations: "None",
      },
    },
  });
  expect([200, 201]).toContain(draft.status);
  const submitted = await call(`/onboarding/relationships/${relationshipId}/submit`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": key("submit") },
    body: { expectedVersion: 1 },
  });
  expect(submitted.status).toBe(200);
  const reviewed = await call(`/onboarding/relationships/${relationshipId}/review`, {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": key("review") },
    body: { outcome: "coaching_ready" },
  });
  expect(reviewed.status).toBe(200);

  const timestamp = new Date().toISOString();
  await db.insert(schema.userIdentities).values({
    userId,
    email,
    emailNorm,
    mobileE164: mobile,
    passwordHash: await hashPassword(PASSWORD),
    passwordUpdatedAt: timestamp,
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const device = await call("/notifications/device-tokens", {
    method: "POST",
    headers: trainee,
    body: {
      token: `ExponentPushToken[${slug}-device]`,
      platform: "ios",
      provider: "expo",
      installationId: `install-${slug}`,
    },
  });
  expect(device.status).toBe(200);

  const otp = await call("/auth/otp/start", {
    method: "POST",
    body: { identifier: email, purpose: "reset" },
  });
  expect(otp.status).toBe(202);

  const measured = await call(`/progress/relationships/${relationshipId}/measurements`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": key("meas") },
    body: { type: "body_weight_kg", value: 71.4, unit: "kg" },
  });
  expect(measured.status).toBe(200);
  const measurementId = (measured.body.data as { id: string }).id;

  const target = await call("/files/upload-targets", {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": key("upload") },
    body: {
      coachingRelationshipId: relationshipId,
      mediaType: "progress_photo",
      contentType: "image/png",
      originalFilename: "front.png",
    },
  });
  expect(target.status).toBe(200);
  const targetData = target.body.data as {
    mediaAsset: { id: string };
    uploadUrl: string;
  };
  const put = await app.request(
    targetData.uploadUrl,
    { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG_BYTES },
    testEnv(),
  );
  expect(put.status).toBe(200);
  const entry = await call(`/progress/relationships/${relationshipId}/entries`, {
    method: "POST",
    headers: { ...trainee, "Idempotency-Key": key("entry") },
    body: {
      entryType: "progress_photo",
      title: "Week 4 front",
      mediaAssetId: targetData.mediaAsset.id,
    },
  });
  expect(entry.status).toBe(200);

  const note = await call(`/checkins/relationships/${relationshipId}/notes`, {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": key("note") },
    body: { body: "Great consistency this week, keep the mornings.", visibility: "client" },
  });
  expect(note.status).toBe(200);

  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const today = day(0);
  const subscription = await call(
    `/client-settings/relationships/${relationshipId}/subscription`,
    {
      method: "PUT",
      headers: { ...trainer.headers, "Idempotency-Key": key("sub") },
      body: {
        expectedVersion: 0,
        planName: "Fat loss 12-week",
        paymentFrequency: "monthly",
        startsOn: day(-20),
        renewsOn: day(10),
        amountPaise: 1_200_000,
        subscriptionType: "monthly",
        coachingMode: "online",
      },
    },
  );
  expect(subscription.status).toBe(200);
  const payment = await call(`/client-settings/relationships/${relationshipId}/payments`, {
    method: "POST",
    headers: { ...trainer.headers, "Idempotency-Key": key("pay") },
    body: { amountPaise: 1_200_000, dueOn: today, status: "paid", paidOn: today, method: "upi" },
  });
  expect(payment.status).toBe(201);

  // Log history written by the trainee (Z6-18's table; its writer lands with Z6-19).
  await db.insert(schema.logEditEvents).values({
    id: crypto.randomUUID(),
    coachingRelationshipId: relationshipId,
    traineeUserId: userId,
    actorUserId: userId,
    actorRole: "trainee",
    entityType: "measurement",
    entityId: measurementId,
    action: "edit",
    beforeJson: JSON.stringify({ value: 71.9 }),
    afterJson: JSON.stringify({ value: 71.4 }),
    createdAt: new Date().toISOString(),
  });

  return { userId, uid, email, emailNorm, mobile, name, relationshipId };
}

async function signIn(email: string) {
  const login = await call("/auth/login", {
    method: "POST",
    body: { identifier: email, password: PASSWORD },
  });
  expect(login.status).toBe(200);
  return {
    Authorization: `Bearer ${login.body.data!.token as string}`,
    "x-fitbud-role": "trainee",
  };
}

/** Archives the account through Z6-14's route and returns its purge instant. */
async function deleteAccount(headers: Record<string, string>): Promise<string> {
  const deleted = await call("/account/deletion", { method: "POST", headers });
  expect(deleted.status).toBe(200);
  return (deleted.body.data as { purgeAfter: string }).purgeAfter;
}

async function userRow(db: Db, userId: string) {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  return row!;
}

function count(sqlite: SqlJsCompatDatabase, query: string): number {
  return Number(sqlite.exec(query)[0]?.values[0]?.[0] ?? 0);
}

/** Every (table, column, value) where any text column contains one of `needles`. */
function scanAllText(sqlite: SqlJsCompatDatabase, needles: string[]): string[] {
  const hits: string[] = [];
  const tables = (
    sqlite.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%'",
    )[0]?.values ?? []
  ).map((row) => String(row[0]));
  for (const table of tables) {
    const columns = (sqlite.exec(`SELECT name FROM pragma_table_info('${table}')`)[0]?.values ?? []).map(
      (row) => String(row[0]),
    );
    for (const column of columns) {
      for (const needle of needles) {
        const found = count(
          sqlite,
          `SELECT count(*) FROM "${table}" WHERE instr(lower(CAST("${column}" AS TEXT)), lower('${needle.replace(/'/g, "''")}')) > 0`,
        );
        if (found > 0) hits.push(`${table}.${column} has ${needle}`);
      }
    }
  }
  return hits;
}

function captureLogs() {
  const lines: string[] = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    }),
  );
  return {
    lines,
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}

function plusMs(iso: string, ms: number): Date {
  return new Date(Date.parse(iso) + ms);
}

describe("account purge (Z6-17)", () => {
  let handle: MemoryDbHandle;
  let db: Db;

  beforeEach(async () => {
    media = createMemoryR2Bucket();
    handle = await createMemoryDb();
    db = handle.db;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("purges a due trainee: own data deleted, shared rows anonymised, the coach's history still reads", async () => {
    const trainer = await trainerSession("arjun.coach@example.com");
    const person = await coachedTrainee(db, trainer, "kapoor");
    const [asset] = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.uploaderUserId, person.userId));
    const objectKey = mediaKey(testEnv(), asset!.objectKey);
    expect(await media.head(objectKey)).not.toBeNull();

    const purgeAfter = await deleteAccount(await signIn(person.email));

    // Not due yet: nothing happens.
    const early = await runAccountPurge(testEnv(), plusMs(purgeAfter, -1));
    expect(early).toEqual({ selected: 0, purged: 0, failed: 0 });
    expect((await userRow(db, person.userId)).accountState).toBe("archived");

    const logs = captureLogs();
    let result;
    try {
      result = await runAccountPurge(testEnv(), plusMs(purgeAfter, 0));
    } finally {
      logs.restore();
    }
    expect(result).toEqual({ selected: 1, purged: 1, failed: 0 });

    // The users row stays (relationships and log history reference it, D-W6-28)
    // as an anonymous disabled row with both dates NULL (D-W6-27).
    const user = await userRow(db, person.userId);
    expect(user).toMatchObject({
      accountState: "disabled",
      archivedAt: null,
      purgeAfter: null,
      firebaseUid: `purged:${person.userId}`,
      timezone: "Asia/Kolkata",
    });

    const s = handle.sqlite;
    const u = person.userId;
    // Deleted: the person's own rows.
    expect(count(s, `SELECT count(*) FROM user_identities WHERE user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM user_roles WHERE user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM web_sessions WHERE user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM device_tokens WHERE user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM notifications WHERE recipient_user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM notification_preferences WHERE user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM idempotency_records WHERE actor_user_id = '${u}'`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM auth_otps`)).toBe(0);
    expect(count(s, `SELECT count(*) FROM media_assets WHERE uploader_user_id = '${u}'`)).toBe(0);
    expect(await media.head(objectKey)).toBeNull();
    // D-W6-22: payments in the person's relationships go; the subscription stays.
    expect(
      count(s, `SELECT count(*) FROM payment_records WHERE coaching_relationship_id = '${person.relationshipId}'`),
    ).toBe(0);
    expect(
      count(s, `SELECT count(*) FROM subscription_versions WHERE coaching_relationship_id = '${person.relationshipId}'`),
    ).toBe(1);

    // Kept and anonymised: what the coach's records need.
    const [profile] = await db
      .select()
      .from(schema.traineeProfiles)
      .where(eq(schema.traineeProfiles.userId, u));
    expect(profile).toMatchObject({ displayName: DELETED_USER_NAME, dateOfBirth: null, gender: null });
    const [invitation] = await db
      .select()
      .from(schema.clientInvitations)
      .where(eq(schema.clientInvitations.acceptedUserId, u));
    expect(invitation).toMatchObject({
      recipientEmail: DELETED_USER_EMAIL,
      recipientDisplayName: DELETED_USER_NAME,
      recipientWhatsappE164: null,
      status: "accepted",
    });
    const [intake] = await db
      .select()
      .from(schema.onboardingFormResponses)
      .where(eq(schema.onboardingFormResponses.coachingRelationshipId, person.relationshipId));
    expect(intake!.answersJson).toContain(`WhatsApp me on ${REMOVED_TEXT} or mail ${REMOVED_TEXT}`);
    expect(intake!.answersJson).toContain("Knee pain after long runs");
    expect(count(s, `SELECT count(*) FROM log_edit_events WHERE actor_user_id = '${u}'`)).toBe(1);
    const [entry] = await db
      .select()
      .from(schema.progressEntries)
      .where(eq(schema.progressEntries.traineeUserId, u));
    expect(entry).toMatchObject({ title: "Week 4 front", mediaAssetId: null });

    // The coach still reads the client's history, under "Deleted user".
    const ended = await call("/clients?status=ended", { headers: trainer.headers });
    expect(ended.status).toBe(200);
    const rows = (ended.body.data as { items: Array<{ relationshipId: string; traineeDisplayName: string }> })
      .items;
    expect(rows.find((row) => row.relationshipId === person.relationshipId)?.traineeDisplayName).toBe(
      DELETED_USER_NAME,
    );
    const measurements = await call(
      `/progress/relationships/${person.relationshipId}/measurements`,
      { headers: trainer.headers },
    );
    expect(measurements.status).toBe(200);
    expect((measurements.body.data as { items: Array<{ value: number }> }).items.map((m) => m.value)).toEqual([
      71.4,
    ]);
    const intakeRead = await call(`/onboarding/relationships/${person.relationshipId}`, {
      headers: trainer.headers,
    });
    expect(intakeRead.status).toBe(200);

    // Sign-in for that identity fails: password, and a token for the old Firebase uid.
    const login = await call("/auth/login", {
      method: "POST",
      body: { identifier: person.email, password: PASSWORD },
    });
    expect(login.status).toBe(401);
    expect(login.body.error?.code).toBe("INVALID_CREDENTIALS");
    const status = await call("/account/status", { headers: bearer(person.uid, person.emailNorm) });
    expect(status.status).toBe(401);

    // No row anywhere keeps their email, phone or name.
    const digits = person.mobile.slice(1);
    expect(
      scanAllText(s, [person.email, person.emailNorm, person.mobile, digits, person.name, person.uid]),
    ).toEqual([]);
    assertNoForeignKeyViolations(s);

    // Logs: the user id and codes only.
    expect(logs.lines.some((line) => line.includes("account.purged") && line.includes(u))).toBe(true);
    for (const line of logs.lines) {
      for (const secret of [person.emailNorm, person.mobile, digits, person.name, person.uid, asset!.objectKey]) {
        expect(line.toLowerCase()).not.toContain(secret.toLowerCase());
      }
    }

    // A second run finds nothing to do.
    expect(await runAccountPurge(testEnv(), plusMs(purgeAfter, 60_000))).toEqual({
      selected: 0,
      purged: 0,
      failed: 0,
    });
  });

  it("purges a trainer after they end their clients; the client keeps their coaching and sees \"Deleted user\"", async () => {
    const trainer = await trainerSession("meera.coach@example.com");
    const client = await coachedTrainee(db, trainer, "iyer");
    const pending = await call("/invitations", {
      method: "POST",
      headers: { ...trainer.headers, "Idempotency-Key": key("inv") },
      body: { recipientEmail: "rohan.next@example.com", recipientDisplayName: "Rohan Next" },
    });
    expect(pending.status).toBe(200);
    await db
      .update(schema.trainerProfiles)
      .set({ displayName: "Meera Krishnan", whatsappE164: "+919900011122" })
      .where(eq(schema.trainerProfiles.userId, trainer.userId));

    const endedRelationship = await call(`/relationships/${client.relationshipId}/end`, {
      method: "POST",
      headers: trainer.headers,
      body: {},
    });
    expect(endedRelationship.status).toBe(200);
    const purgeAfter = await deleteAccount(trainer.headers);

    const result = await runAccountPurge(testEnv(), plusMs(purgeAfter, 1));
    expect(result).toEqual({ selected: 1, purged: 1, failed: 0 });

    const s = handle.sqlite;
    expect((await userRow(db, trainer.userId)).accountState).toBe("disabled");
    const [profile] = await db
      .select()
      .from(schema.trainerProfiles)
      .where(eq(schema.trainerProfiles.userId, trainer.userId));
    expect(profile).toMatchObject({ displayName: DELETED_USER_NAME, whatsappE164: null });
    // The pending invitation they sent is revoked (the recipient's details are not theirs).
    const [invite] = await db
      .select()
      .from(schema.clientInvitations)
      .where(eq(schema.clientInvitations.recipientEmail, "rohan.next@example.com"));
    expect(invite!.status).toBe("revoked");

    // The client is untouched: still signs in and reads the ended coaching.
    expect((await userRow(db, client.userId)).accountState).toBe("active");
    const clientHeaders = await signIn(client.email);
    const relationship = await call(`/relationships/${client.relationshipId}`, {
      headers: clientHeaders,
    });
    expect(relationship.status).toBe(200);
    expect((relationship.body.data as { trainerDisplayName: string }).trainerDisplayName).toBe(
      DELETED_USER_NAME,
    );
    // The client's own photo (they uploaded it) stays.
    expect(
      count(s, `SELECT count(*) FROM media_assets WHERE uploader_user_id = '${client.userId}'`),
    ).toBe(1);
    // The trainer-authored note stays; the payment goes (D-W6-22).
    expect(
      count(s, `SELECT count(*) FROM trainer_notes WHERE trainer_user_id = '${trainer.userId}'`),
    ).toBe(1);
    expect(
      count(s, `SELECT count(*) FROM payment_records WHERE coaching_relationship_id = '${client.relationshipId}'`),
    ).toBe(0);

    expect(scanAllText(s, [trainer.email, "Meera Krishnan", "919900011122", trainer.uid])).toEqual([]);
    assertNoForeignKeyViolations(s);
  });

  it("selects only archived accounts past purge_after, oldest first, a batch at a time", async () => {
    const active = await trainerSession("active.coach@example.com");
    const notDue = await trainerSession("later.coach@example.com");
    const due: Array<{ userId: string; purgeAfter: string }> = [];
    for (let index = 0; index < ACCOUNT_PURGE_BATCH_LIMIT + 2; index += 1) {
      const trainer = await trainerSession(`due${index}.coach@example.com`);
      due.push({ userId: trainer.userId, purgeAfter: await deleteAccount(trainer.headers) });
    }
    const notDuePurgeAfter = await deleteAccount(notDue.headers);
    // Support's "delete now" (runbook) on the most recent due account: purge_after = now.
    const cutoff = plusMs(due[due.length - 1]!.purgeAfter, 0);
    await db
      .update(schema.users)
      .set({ purgeAfter: new Date(Date.parse(notDuePurgeAfter) + 86_400_000).toISOString() })
      .where(eq(schema.users.id, notDue.userId));

    const first = await runAccountPurge(testEnv(), cutoff);
    expect(first).toEqual({ selected: ACCOUNT_PURGE_BATCH_LIMIT, purged: ACCOUNT_PURGE_BATCH_LIMIT, failed: 0 });
    const states = async () =>
      Promise.all(due.map(async (entry) => (await userRow(db, entry.userId)).accountState));
    expect(await states()).toEqual([
      ...Array.from({ length: ACCOUNT_PURGE_BATCH_LIMIT }, () => "disabled"),
      "archived",
      "archived",
    ]);

    const second = await runAccountPurge(testEnv(), cutoff);
    expect(second).toEqual({ selected: 2, purged: 2, failed: 0 });
    expect(new Set(await states())).toEqual(new Set(["disabled"]));

    expect((await userRow(db, active.userId)).accountState).toBe("active");
    const later = await userRow(db, notDue.userId);
    expect(later.accountState).toBe("archived");
    expect(count(handle.sqlite, `SELECT count(*) FROM user_roles WHERE user_id = '${notDue.userId}'`)).toBe(1);
    expect(count(handle.sqlite, `SELECT count(*) FROM user_roles WHERE user_id = '${active.userId}'`)).toBe(1);
  });

  it("an archived account set to purge now by the runbook statement is purged by the next run", async () => {
    const trainer = await trainerSession("now.coach@example.com");
    await deleteAccount(trainer.headers);
    expect(await runAccountPurge(testEnv(), new Date())).toEqual({ selected: 0, purged: 0, failed: 0 });

    // The runbook's single statement, by user id, with SQLite's clock.
    handle.sqlite.run(
      "UPDATE users SET purge_after = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND account_state = 'archived'",
      [trainer.userId],
    );
    const result = await runAccountPurge(testEnv(), new Date(Date.now() + 1000));
    expect(result).toEqual({ selected: 1, purged: 1, failed: 0 });
    expect((await userRow(db, trainer.userId)).accountState).toBe("disabled");
  });

  describe("resumes after a failure at each step", () => {
    async function archivedTrainee(slug: string) {
      const trainer = await trainerSession(`${slug}.coach@example.com`);
      const person = await coachedTrainee(db, trainer, slug);
      const purgeAfter = await deleteAccount(await signIn(person.email));
      return { trainer, person, at: plusMs(purgeAfter, 1) };
    }

    function expectUntouched(person: Person) {
      const s = handle.sqlite;
      expect(count(s, `SELECT count(*) FROM user_identities WHERE user_id = '${person.userId}'`)).toBe(1);
      expect(count(s, `SELECT count(*) FROM device_tokens WHERE user_id = '${person.userId}'`)).toBe(1);
      expect(count(s, `SELECT count(*) FROM media_assets WHERE uploader_user_id = '${person.userId}'`)).toBe(1);
      expect(
        count(s, `SELECT count(*) FROM trainee_profiles WHERE user_id = '${person.userId}' AND display_name = '${person.name}'`),
      ).toBe(1);
      expect(
        count(s, `SELECT count(*) FROM users WHERE id = '${person.userId}' AND account_state = 'archived'`),
      ).toBe(1);
    }

    it("R2 delete fails: nothing in D1 changes, the next run finishes", async () => {
      const { person, at } = await archivedTrainee("rtwo");
      const realDelete = media.delete.bind(media);
      const spy = vi.spyOn(media, "delete").mockRejectedValueOnce(new Error("r2 down"));
      const logs = captureLogs();
      try {
        await expect(runAccountPurge(testEnv(), at)).rejects.toThrow("ACCOUNT_PURGE_FAILED");
      } finally {
        logs.restore();
      }
      expect(logs.lines.some((line) => line.includes("ACCOUNT_PURGE_MEDIA_FAILED"))).toBe(true);
      for (const line of logs.lines) {
        expect(line).not.toContain(person.emailNorm);
        expect(line).not.toContain("r2 down");
      }
      expectUntouched(person);
      spy.mockImplementation(realDelete);

      expect(await runAccountPurge(testEnv(), at)).toEqual({ selected: 1, purged: 1, failed: 0 });
      expect((await userRow(db, person.userId)).accountState).toBe("disabled");
    });

    it("the D1 batch fails part way: it rolls back whole, the next run finishes without double work", async () => {
      const { person, at } = await archivedTrainee("dbatch");
      // Fail inside the batch: once mid-way (identity), once on the very last statement.
      for (const trigger of [
        "CREATE TRIGGER purge_fail BEFORE DELETE ON user_identities BEGIN SELECT RAISE(ABORT, 'injected'); END",
        "CREATE TRIGGER purge_fail BEFORE UPDATE OF account_state ON users BEGIN SELECT RAISE(ABORT, 'injected'); END",
      ]) {
        handle.sqlite.exec(trigger);
        const logs = captureLogs();
        try {
          await expect(runAccountPurge(testEnv(), at)).rejects.toThrow("ACCOUNT_PURGE_FAILED");
        } finally {
          logs.restore();
        }
        for (const line of logs.lines) expect(line).not.toContain("injected");
        handle.sqlite.exec("DROP TRIGGER purge_fail");
        // Media objects are gone (step 1 ran) but every D1 row is as it was.
        expectUntouched(person);
        expect(
          count(handle.sqlite, `SELECT count(*) FROM payment_records WHERE coaching_relationship_id = '${person.relationshipId}'`),
        ).toBe(1);
      }

      expect(await runAccountPurge(testEnv(), at)).toEqual({ selected: 1, purged: 1, failed: 0 });
      expect((await userRow(db, person.userId)).accountState).toBe("disabled");
      expect(scanAllText(handle.sqlite, [person.emailNorm, person.mobile, person.name])).toEqual([]);
      assertNoForeignKeyViolations(handle.sqlite);
    });

    it("Firebase delete fails: D1 is untouched; the retry deletes the Firebase user; a missing Firebase user counts as deleted", async () => {
      const { person, at } = await archivedTrainee("fbase");
      const second = await archivedTrainee("fbtwo");
      const serviceAccount = await testServiceAccount();
      const firebaseEnv = testEnv({
        AUTH_MODE: "firebase",
        FIREBASE_PROJECT_ID: "fitbud-staging-test",
        FIREBASE_SERVICE_ACCOUNT_JSON: serviceAccount,
      });
      const calls: Array<{ url: string; auth: string | null; body: string }> = [];
      let deleteAnswers: Array<() => Response> = [
        () => new Response(JSON.stringify({ error: { message: "INTERNAL" } }), { status: 500 }),
        () => new Response(JSON.stringify({ error: { message: "INTERNAL" } }), { status: 500 }),
      ];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const headers = new Headers(init?.headers);
          calls.push({ url, auth: headers.get("authorization"), body: String(init?.body ?? "") });
          if (url === "https://oauth2.googleapis.com/token") {
            return new Response(JSON.stringify({ access_token: "ya29.test-access", expires_in: 3600 }), {
              status: 200,
            });
          }
          return deleteAnswers.shift()!();
        }),
      );

      const logs = captureLogs();
      try {
        await expect(runAccountPurge(firebaseEnv, plusMs(second.at.toISOString(), 0))).rejects.toThrow(
          "ACCOUNT_PURGE_FAILED",
        );
      } finally {
        logs.restore();
      }
      expect(logs.lines.filter((line) => line.includes("FIREBASE_DELETE_FAILED"))).toHaveLength(2);
      for (const line of logs.lines) {
        expect(line).not.toContain(person.uid);
        expect(line).not.toContain("ya29");
      }
      expectUntouched(person);
      expectUntouched(second.person);

      // One access token per run, then one delete per user with the uid as localId.
      expect(calls[0]!.url).toBe("https://oauth2.googleapis.com/token");
      expect(calls[0]!.body).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      const deletes = calls.filter((entry) => entry.url.endsWith("/accounts:delete"));
      expect(deletes.map((entry) => entry.url)).toEqual([
        "https://identitytoolkit.googleapis.com/v1/projects/fitbud-staging-test/accounts:delete",
        "https://identitytoolkit.googleapis.com/v1/projects/fitbud-staging-test/accounts:delete",
      ]);
      expect(deletes.map((entry) => JSON.parse(entry.body).localId)).toEqual([person.uid, second.person.uid]);
      expect(deletes.every((entry) => entry.auth === "Bearer ya29.test-access")).toBe(true);
      expect(calls.filter((entry) => entry.url.includes("oauth2"))).toHaveLength(1);

      // Retry: one deleted now, the other already gone at Firebase (404 / USER_NOT_FOUND).
      calls.length = 0;
      deleteAnswers = [
        () => new Response("{}", { status: 200 }),
        () => new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), { status: 400 }),
      ];
      expect(await runAccountPurge(firebaseEnv, second.at)).toEqual({ selected: 2, purged: 2, failed: 0 });
      expect((await userRow(db, person.userId)).accountState).toBe("disabled");
      expect((await userRow(db, second.person.userId)).accountState).toBe("disabled");
      expect(at.getTime()).toBeLessThanOrEqual(second.at.getTime());
    });

    it("a Firebase 404 counts as already deleted, and a missing service account leaves the account due", async () => {
      const { person, at } = await archivedTrainee("fbmiss");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) =>
          String(input).includes("oauth2")
            ? new Response(JSON.stringify({ access_token: "ya29.other" }), { status: 200 })
            : new Response("", { status: 404 }),
        ),
      );
      await expect(
        runAccountPurge(testEnv({ AUTH_MODE: "firebase", FIREBASE_SERVICE_ACCOUNT_JSON: undefined }), at),
      ).rejects.toThrow("ACCOUNT_PURGE_FAILED");
      expectUntouched(person);

      const result = await runAccountPurge(
        testEnv({ AUTH_MODE: "firebase", FIREBASE_SERVICE_ACCOUNT_JSON: await testServiceAccount() }),
        at,
      );
      expect(result).toEqual({ selected: 1, purged: 1, failed: 0 });
    });

    it("changes nothing in D1 when the account stops being due between selection and the batch", async () => {
      const { person, at } = await archivedTrainee("guard");
      // Between selection and step 3 the account is no longer due (as if another
      // run, or support, changed it): every statement of the batch is guarded.
      vi.spyOn(media, "delete").mockImplementationOnce(async () => {
        handle.sqlite.run("UPDATE users SET purge_after = ? WHERE id = ?", [
          new Date(at.getTime() + 86_400_000).toISOString(),
          person.userId,
        ]);
      });
      const logs = captureLogs();
      let result;
      try {
        result = await runAccountPurge(testEnv(), at);
      } finally {
        logs.restore();
      }
      expect(result).toEqual({ selected: 1, purged: 0, failed: 0 });
      expect(logs.lines.some((line) => line.includes("account.purge_skipped"))).toBe(true);
      expectUntouched(person);
      expect(
        count(handle.sqlite, `SELECT count(*) FROM payment_records WHERE coaching_relationship_id = '${person.relationshipId}'`),
      ).toBe(1);
      expect(
        count(handle.sqlite, `SELECT count(*) FROM notifications WHERE recipient_user_id = '${person.userId}'`),
      ).toBeGreaterThan(0);
    });
  });
});

describe("account purge on the full demo seed (Z6-17)", () => {
  const referenceInstant = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  let handle: MemoryDbHandle;

  beforeAll(async () => {
    await prepareDemoSeededDb(referenceInstant);
  }, 120_000);

  beforeEach(async () => {
    media = createMemoryR2Bucket();
    handle = await createDemoSeededDb(referenceInstant);
    setTestDbOverride(handle.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
    vi.restoreAllMocks();
  });

  it("purges a demo client with months of history: no email, phone or name left, no broken references", async () => {
    const db = handle.db;
    const email = "aarav.ontrack@demo.fitbud.test";
    const [identity] = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.emailNorm, email));
    const userId = identity!.userId;
    const [profile] = await db
      .select()
      .from(schema.traineeProfiles)
      .where(eq(schema.traineeProfiles.userId, userId));
    const { firebaseUid } = await userRow(db, userId);
    const needles = [email, profile!.displayName, firebaseUid];
    if (identity!.mobileE164) needles.push(identity!.mobileE164, identity!.mobileE164.slice(1));
    // The seed really holds the person's details in several places before the purge.
    expect(scanAllText(handle.sqlite, [email, profile!.displayName]).length).toBeGreaterThan(1);
    const relationships = (
      handle.sqlite.exec(`SELECT id, trainer_user_id FROM coaching_relationships WHERE trainee_user_id = '${userId}'`)[0]
        ?.values ?? []
    ).map((row) => ({ id: String(row[0]), trainerUserId: String(row[1]) }));
    expect(relationships.length).toBeGreaterThan(0);
    const historyBefore = count(
      handle.sqlite,
      `SELECT count(*) FROM workout_executions WHERE trainee_user_id = '${userId}'`,
    );
    expect(historyBefore).toBeGreaterThan(0);

    const login = await call("/auth/login", {
      method: "POST",
      body: { identifier: email, password: DEMO_PASSWORD_PLAINTEXT },
    });
    expect(login.status).toBe(200);
    const purgeAfter = await deleteAccount({
      Authorization: `Bearer ${login.body.data!.token as string}`,
      "x-fitbud-role": "trainee",
    });

    expect(await runAccountPurge(testEnv(), plusMs(purgeAfter, 0))).toEqual({
      selected: 1,
      purged: 1,
      failed: 0,
    });

    expect(scanAllText(handle.sqlite, needles)).toEqual([]);
    assertNoForeignKeyViolations(handle.sqlite);
    // The coach's record of the client's work is still there.
    expect(
      count(handle.sqlite, `SELECT count(*) FROM workout_executions WHERE trainee_user_id = '${userId}'`),
    ).toBe(historyBefore);

    // The coach reads the ended client as "Deleted user".
    const trainer = relationships[0]!;
    const trainerUser = await userRow(db, trainer.trainerUserId);
    const [trainerIdentity] = await db
      .select()
      .from(schema.userIdentities)
      .where(eq(schema.userIdentities.userId, trainer.trainerUserId));
    const session = await app.request(
      "/auth/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: createTestIdToken(trainerUser.firebaseUid, trainerIdentity!.emailNorm ?? undefined, nowSeconds()),
        }),
      },
      testEnv(),
    );
    expect(session.status).toBe(200);
    const cookie = session.headers.get("set-cookie")!.split(";")[0]!;
    const ended = await call("/clients?status=ended", { headers: { Cookie: cookie } });
    expect(ended.status).toBe(200);
    const row = (
      ended.body.data as { items: Array<{ relationshipId: string; traineeDisplayName: string }> }
    ).items.find((item) => item.relationshipId === trainer.id);
    expect(row?.traineeDisplayName).toBe(DELETED_USER_NAME);
  }, 120_000);
});

/** A service account JSON with a freshly generated RSA key (never a real credential). */
async function testServiceAccount(): Promise<string> {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = new Uint8Array((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer);
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(binary).replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
  return JSON.stringify({
    type: "service_account",
    client_email: "purge-test@fitbud-staging-test.iam.gserviceaccount.com",
    private_key: pem,
  });
}
