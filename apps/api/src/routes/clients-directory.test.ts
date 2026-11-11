/**
 * Z9-15: GET /clients exposes each relationship's coaching start (`startedAt`).
 * Uses the persisted demo seed (real relationships, invitations and trainers).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { ClientDirectoryItem } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { coachingRelationships } from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import { demoUuid } from "../seed/demo/ids.js";

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
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: "local",
    EMAIL_PROVIDER: "dev_sink",
  };
}

async function login(email: string): Promise<string> {
  const response = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: email, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return (JSON.parse(text) as { data: { token: string } }).data.token;
}

async function listClients(token: string): Promise<ClientDirectoryItem[]> {
  const response = await app.request(
    "/clients?limit=100",
    { headers: { Authorization: `Bearer ${token}`, "x-fitbud-role": "trainer" } },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  return (JSON.parse(text) as { data: { items: ClientDirectoryItem[] } }).data.items;
}

const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";

describe("GET /clients startedAt (Z9-15)", () => {
  let db: Db;
  let close: () => void = () => {};

  beforeAll(async () => {
    await prepareDemoSeededDb(FROZEN_REFERENCE_INSTANT);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN_REFERENCE_INSTANT));
    const handle = await createDemoSeededDb(FROZEN_REFERENCE_INSTANT);
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  async function persistedRelationship(trainer: string, trainee: string) {
    const id = demoUuid("relationship", trainer, trainee);
    const [row] = await db
      .select()
      .from(coachingRelationships)
      .where(eq(coachingRelationships.id, id));
    expect(row, `${trainee} relationship exists in the seed`).toBeDefined();
    return row!;
  }

  it("returns the persisted relationship start for an active client", async () => {
    const token = await login("rahul.coach@demo.fitbud.test");
    const items = await listClients(token);
    const row = await persistedRelationship("rahul.coach", "aarav.ontrack");
    expect(row.status).toBe("active");
    const item = items.find((i) => i.relationshipId === row.id);
    expect(item).toBeDefined();
    expect(item!.startedAt).toBe(row.startedAt);
    expect(item!.endedAt ?? null).toBeNull();
    expect(item!.week).toBeGreaterThan(0);
  });

  it("returns both startedAt and endedAt for an ended client", async () => {
    const token = await login("rahul.coach@demo.fitbud.test");
    const items = await listClients(token);
    const row = await persistedRelationship("rahul.coach", "kavya.ended");
    expect(row.status).toBe("ended");
    expect(row.endedAt).toBeTruthy();
    const item = items.find((i) => i.relationshipId === row.id);
    expect(item).toBeDefined();
    expect(item!.startedAt).toBe(row.startedAt);
    expect(item!.endedAt).toBe(row.endedAt);
  });

  it("returns null startedAt for an invited client with no relationship", async () => {
    const token = await login("rahul.coach@demo.fitbud.test");
    const items = await listClients(token);
    const invited = items.filter((i) => i.status === "invited");
    expect(invited.length).toBeGreaterThan(0);
    for (const item of invited) {
      expect(item.relationshipId).toBeNull();
      expect(item.startedAt).toBeNull();
    }
    expect(invited.some((i) => i.traineeDisplayName.includes("Anita"))).toBe(true);
  });

  it("does not list another trainer's clients", async () => {
    const priya = await login("priya.coach@demo.fitbud.test");
    const items = await listClients(priya);
    // Guard against a vacuous pass: Priya has her own clients in the seed.
    expect(items.some((i) => i.relationshipId && i.startedAt)).toBe(true);
    const rahulIds = new Set([
      (await persistedRelationship("rahul.coach", "aarav.ontrack")).id,
      (await persistedRelationship("rahul.coach", "kavya.ended")).id,
    ]);
    for (const item of items) {
      expect(rahulIds.has(item.relationshipId ?? "")).toBe(false);
    }
    const rahul = await listClients(await login("rahul.coach@demo.fitbud.test"));
    const priyaIds = new Set(items.map((i) => i.relationshipId).filter(Boolean));
    for (const item of rahul) {
      expect(priyaIds.has(item.relationshipId)).toBe(false);
    }
  });
});
