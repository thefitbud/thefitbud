import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../auth/password.js";
import { app } from "../../index.js";
import { setTestDbOverride, type Db } from "../../db/client.js";
import { createMemoryR2Bucket } from "../../lib/memory-r2.js";
import type { Env } from "../../types.js";
import { buildDemoSeedSql } from "./build.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "./spec.js";
import { createMemoryDb } from "../../test-support/memory-db.js";
import { loadDemoLibraryIndex, personaByEmail } from "./personas.js";

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
      body: JSON.stringify({
        identifier: email,
        password: DEMO_PASSWORD_PLAINTEXT,
      }),
    },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const body = JSON.parse(text) as { data: { token: string } };
  return body.data.token;
}

describe("demo seed", () => {
  let db: Db;
  let close: () => void = () => {};
  let refDate: string;
  let sqliteExec: (sql: string) => ReturnType<
    Awaited<ReturnType<typeof createMemoryDb>>["sqlite"]["exec"]
  >;

  beforeEach(async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    sqliteExec = handle.sqlite.exec.bind(handle.sqlite);
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    const referenceInstant = new Date().toISOString();
    refDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(referenceInstant));
    const sql = buildDemoSeedSql({
      referenceInstant,
      passwordHash,
      libraryIndex,
    });
    handle.sqlite.exec(sql);
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it(
    "applies twice with stable counts and valid foreign keys",
    async () => {
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
        const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
        const sql = buildDemoSeedSql({
          referenceInstant: new Date().toISOString(),
          passwordHash,
          libraryIndex,
        });
        handle.sqlite.exec(sql);
        const fk = handle.sqlite.exec("PRAGMA foreign_key_check");
        expect(fk[0]?.values ?? []).toEqual([]);
        const users1 =
          handle.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        handle.sqlite.exec(sql);
        const users2 =
          handle.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        expect(users2).toBe(users1);
      } finally {
        handle.close();
      }
    },
    180_000,
  );

  it("logs in every demo account with the dev password", async () => {
    for (const account of DEMO_ACCOUNTS) {
      if (account.role === "invite") continue;
      const token = await login(account.email);
      expect(token.length).toBeGreaterThan(10);
    }
  });

  it("covers persona states via API queries", async () => {
    const rahulToken = await login("rahul.coach@demo.fitbud.test");
    const rahulHeaders = {
      Authorization: `Bearer ${rahulToken}`,
      "x-fitbud-role": "trainer",
    };

    const attention = await app.request(
      "/exceptions/attention?groupBy=relationship",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: { groups?: Array<{ relationshipId: string }> };
    };
    expect((attentionBody.data.groups ?? []).length).toBeGreaterThan(0);

    const clients = await app.request("/clients", { headers: rahulHeaders }, testEnv());
    const clientsText = await clients.text();
    expect(clients.status, clientsText).toBe(200);
    const clientsBody = JSON.parse(clientsText) as {
      data: { facets: { status: Record<string, number> }; items: unknown[] };
    };
    expect(clientsBody.data.facets.status.ended ?? 0).toBeGreaterThanOrEqual(1);

    const coachAsks = await app.request(
      "/coach-asks?status=open",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(coachAsks.status).toBe(200);

    const feed = await app.request("/activity/feed", { headers: rahulHeaders }, testEnv());
    expect(feed.status).toBe(200);

    const aaravToken = await login("aarav.ontrack@demo.fitbud.test");
    const traineeHeaders = {
      Authorization: `Bearer ${aaravToken}`,
      "x-fitbud-role": "trainee",
    };
    const day = await app.request(
      `/me/day/${refDate}`,
      { headers: traineeHeaders },
      testEnv(),
    );
    expect(day.status).toBe(200);
    const week = await app.request("/me/week", { headers: traineeHeaders }, testEnv());
    expect(week.status).toBe(200);
    const notes = await app.request("/me/coach-notes", { headers: traineeHeaders }, testEnv());
    expect(notes.status).toBe(200);
    const mealTimes = await app.request("/me/meal-times", { headers: traineeHeaders }, testEnv());
    expect(mealTimes.status).toBe(200);

    const slipping = await app.request(
      "/clients?adherenceState=needs_attention",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(slipping.status).toBe(200);
    const slipBody = (await slipping.json()) as {
      data: { items: Array<{ traineeDisplayName: string; adherenceState: string }> };
    };
    expect(
      slipBody.data.items.some((i) =>
        i.traineeDisplayName.toLowerCase().includes("rohan"),
      ),
    ).toBe(true);

    expect(
      sqliteExec(`SELECT COUNT(*) FROM reminder_states WHERE mode='paused'`)[0]
        ?.values[0]?.[0],
    ).toBe(1);

    const onboarding = await app.request(
      "/clients?adherenceState=not_available",
      { headers: rahulHeaders },
      testEnv(),
    );
    const onboardingBody = (await onboarding.json()) as {
      data: { items: Array<{ traineeDisplayName: string }> };
    };
    expect(
      onboardingBody.data.items.some((i) =>
        i.traineeDisplayName.toLowerCase().includes("vikram"),
      ),
    ).toBe(true);

    const reengagement = await app.request(
      "/notifications/reengagement-candidates",
      { headers: rahulHeaders },
      testEnv(),
    );
    expect(reengagement.status).toBe(200);

    for (const account of DEMO_ACCOUNTS) {
      const persona = personaByEmail(account.email);
      expect(persona?.key).toBe(account.state);
    }
  });

  it("does not reference wiped legacy library foods without seed_version", () => {
    const rows = sqliteExec(
      `SELECT COUNT(*) FROM food_library_items f
       JOIN plan_versions pv ON pv.content_json LIKE '%' || f.id || '%'
       WHERE f.ownership='global' AND f.seed_version IS NULL`,
    );
    expect(rows[0]?.values[0]?.[0]).toBe(0);
  });
});
