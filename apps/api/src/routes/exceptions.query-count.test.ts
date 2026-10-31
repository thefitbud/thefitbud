import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createId } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";

/**
 * I1b: the trainer attention feed must not read whole tables. Its query count
 * may grow with the trainer's own clients, never with unrelated users.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const TRAINER = "rahul.coach@demo.fitbud.test";
const OTHER_TRAINER = "priya.coach@demo.fitbud.test";
const ATTENTION = "/exceptions/attention?groupBy=relationship&limit=50";

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
    } as unknown as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

type Statement = { sql: string; params: unknown[] };

/** The same seeded connection, with every statement recorded. */
function recordingDb(handle: MemoryDbHandle, statements: Statement[]): Db {
  const d1 = (handle.db as unknown as { $client: D1Database }).$client;
  return drizzle(d1, {
    schema,
    logger: { logQuery: (sql, params) => statements.push({ sql, params }) },
  }) as Db;
}

/** 200 trainees coached by another trainer: realistic rows Rahul's feed must never read. */
async function addUnrelatedTrainees(db: Db, count: number): Promise<void> {
  const [other] = await db
    .select({ userId: schema.userIdentities.userId })
    .from(schema.userIdentities)
    .where(eq(schema.userIdentities.email, OTHER_TRAINER));
  if (!other) throw new Error("demo seed has no second trainer");
  const at = SEED;
  for (let i = 0; i < count; i += 1) {
    const userId = createId();
    await db.insert(schema.users).values({
      id: userId,
      firebaseUid: `unrelated-${i}`,
      accountState: "active",
      timezone: "Asia/Kolkata",
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(schema.userIdentities).values({
      userId,
      email: `unrelated.${i}@example.test`,
      emailNorm: `unrelated.${i}@example.test`,
      mobileE164: `+447700${String(900000 + i)}`,
      passwordHash: null,
      passwordUpdatedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(schema.userRoles).values({ id: createId(), userId, role: "trainee", createdAt: at });
    await db.insert(schema.traineeProfiles).values({
      id: createId(),
      userId,
      displayName: `Unrelated Trainee ${i}`,
      dateOfBirth: null,
      gender: null,
      createdAt: at,
      updatedAt: at,
    });
    await db.insert(schema.coachingRelationships).values({
      id: createId(),
      trainerUserId: other.userId,
      traineeUserId: userId,
      status: "ended",
      startedAt: at,
      createdAt: at,
      updatedAt: at,
    });
  }
}

/** Exception ids are minted during detection; replace them so bodies compare by content. */
function normalizeIds(body: unknown): unknown {
  let next = 0;
  const seen = new Map<string, string>();
  return JSON.parse(JSON.stringify(body), (key, value) => {
    if (key === "id" && typeof value === "string") {
      if (!seen.has(value)) seen.set(value, `exception-${(next += 1)}`);
      return seen.get(value);
    }
    return value;
  });
}

describe("GET /exceptions/attention query count (I1b)", () => {
  let handle: MemoryDbHandle;
  let statements: Statement[];

  async function trainerHeaders() {
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: TRAINER, password: DEMO_PASSWORD_PLAINTEXT }),
      },
      testEnv(),
    );
    expect(login.status).toBe(200);
    const { data } = (await login.json()) as { data: { token: string } };
    return { Authorization: `Bearer ${data.token}`, "x-fitbud-role": "trainer" };
  }

  /** Statements for one attention request, after a warm-up request that runs detection. */
  async function measure(): Promise<{ statements: Statement[]; body: unknown }> {
    const headers = await trainerHeaders();
    expect((await app.request(ATTENTION, { headers }, testEnv())).status).toBe(200);
    statements.length = 0;
    const response = await app.request(ATTENTION, { headers }, testEnv());
    expect(response.status).toBe(200);
    return { statements: [...statements], body: await response.json() };
  }

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    statements = [];
    setTestDbOverride(recordingDb(handle, statements));
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  it("reads trainee profiles and identities only for the returned clients", async () => {
    const { statements: run, body } = await measure();
    const groups = (body as { data: { needsYou: unknown[]; reviewed: unknown[] } }).data;
    expect(groups.needsYou.length + groups.reviewed.length).toBeGreaterThan(0);

    for (const table of ["trainee_profiles", "user_identities"]) {
      const reads = run.filter((s) => new RegExp(`^select .* from "${table}"`, "i").test(s.sql));
      expect(reads.length, `${table} is read`).toBeGreaterThan(0);
      for (const read of reads) {
        expect(read.sql, `${table} read is filtered by user`).toMatch(
          / where .*"user_id" (in \(|= \?)/i,
        );
        expect(read.params.length).toBeLessThanOrEqual(90);
      }
    }
  });

  it("issues the same number of queries with 200 unrelated trainees", async () => {
    const baseline = await measure();

    handle.close();
    handle = await createDemoSeededDb(SEED);
    statements = [];
    setTestDbOverride(recordingDb(handle, statements));
    await addUnrelatedTrainees(handle.db, 200);
    const crowded = await measure();

    expect(crowded.statements.length).toBe(baseline.statements.length);
    expect(normalizeIds(crowded.body)).toEqual(normalizeIds(baseline.body));
  });

  it("returns the same attention groups as before the change (snapshot)", async () => {
    const { body } = await measure();
    expect(normalizeIds(body)).toMatchSnapshot();
  });
});
