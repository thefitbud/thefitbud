import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";
import { createTestIdToken } from "./firebase.js";
import {
  createIdentityRequestCache,
  ensureRoleAndProfile,
  findOrCreateUserFromFirebase,
  loadActorByUserId,
} from "./identity.js";

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
  };
}

describe("user_roles request memo (I1b)", () => {
  let handle: MemoryDbHandle;
  let db: Db;
  let statements: string[];

  const roleReads = () => statements.filter((sql) => /^select .* from "user_roles"/i.test(sql)).length;
  const asActor = (userId: string) => ({
    userId,
    surface: "mobile" as const,
    authMethod: "bearer" as const,
    requestedRole: null,
  });

  beforeEach(async () => {
    handle = await createMemoryDb();
    statements = [];
    const d1 = (handle.db as unknown as { $client: D1Database }).$client;
    db = drizzle(d1, { schema, logger: { logQuery: (sql) => statements.push(sql) } }) as Db;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
  });

  async function coach(): Promise<string> {
    const { userId } = await findOrCreateUserFromFirebase(db, {
      uid: "memo-coach",
      email: "memo.coach@example.com",
    });
    await ensureRoleAndProfile(db, { userId, role: "trainer", displayName: "Memo Coach" });
    return userId;
  }

  it("reads a user's roles once per cache", async () => {
    const userId = await coach();
    const cache = createIdentityRequestCache();
    statements.length = 0;

    const first = await loadActorByUserId(db, asActor(userId), cache);
    const second = await loadActorByUserId(db, asActor(userId), cache);

    expect(first?.permittedRoles).toEqual(["trainer"]);
    expect(second?.permittedRoles).toEqual(["trainer"]);
    expect(roleReads()).toBe(1);
  });

  it("does not share roles between caches (requests)", async () => {
    const userId = await coach();
    statements.length = 0;

    await loadActorByUserId(db, asActor(userId), createIdentityRequestCache());
    await loadActorByUserId(db, asActor(userId), createIdentityRequestCache());

    expect(roleReads()).toBe(2);
  });

  it("sees a role added in the same request without reading again", async () => {
    const userId = await coach();
    const cache = createIdentityRequestCache();
    await loadActorByUserId(db, asActor(userId), cache);
    statements.length = 0;

    await ensureRoleAndProfile(db, { userId, role: "trainee", displayName: "Memo Coach" }, cache);
    const actor = await loadActorByUserId(db, asActor(userId), cache);

    expect(actor?.permittedRoles.sort()).toEqual(["trainee", "trainer"]);
    expect(roleReads()).toBe(0);
  });

  it("keeps the memo safe from callers that change the actor", async () => {
    const userId = await coach();
    const cache = createIdentityRequestCache();
    const actor = await loadActorByUserId(db, asActor(userId), cache);
    actor?.permittedRoles.push("trainee");

    const again = await loadActorByUserId(db, asActor(userId), cache);
    expect(again?.permittedRoles).toEqual(["trainer"]);
  });

  it("POST /auth/session reads user_roles once per request, again on the next request", async () => {
    const token = createTestIdToken("memo-session-coach", "memo.session@example.com");
    const signIn = () =>
      app.request(
        "/auth/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
        },
        testEnv(),
      );

    statements.length = 0;
    expect((await signIn()).status).toBe(200);
    expect(roleReads()).toBe(1);

    statements.length = 0;
    expect((await signIn()).status).toBe(200);
    expect(roleReads()).toBe(1);
  });
});
