/**
 * Batch 0 API/seed acceptance tests (03-api-changes A1–A14).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { hashPassword } from "../auth/password.js";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { demoUuid } from "../seed/demo/ids.js";
import { coerceIsoInstant } from "../domain/mappers.js";

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

describe("Batch 0 API fixes", () => {
  let db: Db;
  let close: () => void = () => {};
  let trainerToken = "";

  beforeEach(async () => {
    const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
    const sql = buildDemoSeedSql({
      referenceInstant: new Date().toISOString(),
      passwordHash,
      libraryIndex,
    });
    handle.sqlite.exec(sql);
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
    trainerToken = await login("rahul.coach@demo.fitbud.test");
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("A1: attention groupBy=relationship returns separate client groups; limit counts groups", async () => {
    const res = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as {
      data: {
        groups: Array<{ traineeDisplayName: string; items: unknown[] }>;
      };
    };
    const names = body.data.groups.map((g) => g.traineeDisplayName);
    expect(names.some((n) => /Rohan/i.test(n))).toBe(true);
    expect(names.some((n) => /Ishita/i.test(n))).toBe(true);
    expect(new Set(names).size).toBe(names.length);

    const limited = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=2",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const limitedBody = JSON.parse(await limited.text()) as {
      data: { groups: unknown[] };
    };
    expect(limitedBody.data.groups.length).toBeLessThanOrEqual(2);
  });

  it("A2: ended Kavya and Nikhil absent from inbox and attention", async () => {
    const kavyaId = demoUuid(
      "relationship",
      "rahul.coach",
      "kavya.ended",
    );
    const nikhilId = demoUuid(
      "relationship",
      "rahul.coach",
      "nikhil.reactivate",
    );

    const inbox = await app.request(
      "/checkins/inbox",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const inboxBody = JSON.parse(await inbox.text()) as {
      data: { items: Array<{ coachingRelationshipId: string }> };
    };
    expect(
      inboxBody.data.items.some((i) => i.coachingRelationshipId === kavyaId),
    ).toBe(false);
    expect(
      inboxBody.data.items.some((i) => i.coachingRelationshipId === nikhilId),
    ).toBe(false);

    const attention = await app.request(
      "/exceptions/attention?limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const attentionBody = JSON.parse(await attention.text()) as {
      data: { items: Array<{ coachingRelationshipId: string }> };
    };
    expect(
      attentionBody.data.items.some((i) => i.coachingRelationshipId === kavyaId),
    ).toBe(false);
    expect(
      attentionBody.data.items.some(
        (i) => i.coachingRelationshipId === nikhilId,
      ),
    ).toBe(false);
  });

  it("A3: Meera exception GET returns 200 with coerced detectedAt", async () => {
    const meeraExceptionId = demoUuid("exception", "meera-ack-meal");
    const res = await app.request(`/exceptions/${meeraExceptionId}`, {
      headers: {
        Authorization: `Bearer ${trainerToken}`,
        "x-fitbud-role": "trainer",
      },
    }, testEnv());
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as { data: { detectedAt: string } };
    expect(body.data.detectedAt).toMatch(/T/);
  });

  it("A4: open exceptions per client stay realistic after attention evaluate", async () => {
    await app.request(
      "/exceptions/attention?limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const grouped = await app.request(
      "/exceptions/attention?groupBy=relationship&limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const body = JSON.parse(await grouped.text()) as {
      data: { groups: Array<{ items: unknown[] }> };
    };
    for (const group of body.data.groups) {
      expect(group.items.length).toBeLessThanOrEqual(12);
    }
  });

  it("A9: activity feed kcal is divided by NUTRIENT_SCALE", async () => {
    const res = await app.request(
      "/activity/feed?limit=30",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as {
      data: { events: Array<{ kcal?: number | null }> };
    };
    for (const event of body.data.events) {
      if (event.kcal == null) continue;
      expect(event.kcal).toBeLessThan(NUTRIENT_SCALE);
      expect(event.kcal).toBeGreaterThan(0);
      expect(event.kcal).toBeLessThan(10_000);
    }
  });

  it("A11: activity feed events are not in the future", async () => {
    const now = Date.now() + 60_000;
    const res = await app.request(
      "/activity/feed?limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const body = JSON.parse(await res.text()) as {
      data: { events: Array<{ occurredAt: string }> };
    };
    for (const event of body.data.events) {
      expect(Date.parse(event.occurredAt)).toBeLessThanOrEqual(now);
    }
  });

  it("A12/decision 20: sneha.review is trainee-only", async () => {
    const token = await login("sneha.review@demo.fitbud.test");
    const res = await app.request(
      "/me",
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      testEnv(),
    );
    const body = JSON.parse(await res.text()) as {
      data: { permittedRoles: string[] };
    };
    expect(body.data.permittedRoles).toEqual(["trainee"]);
  });

  it("A13: seed display names are title-cased", async () => {
    const res = await app.request(
      "/clients?limit=50",
      {
        headers: {
          Authorization: `Bearer ${trainerToken}`,
          "x-fitbud-role": "trainer",
        },
      },
      testEnv(),
    );
    const body = JSON.parse(await res.text()) as {
      data: { items: Array<{ traineeDisplayName?: string; displayName?: string }> };
    };
    for (const item of body.data.items) {
      const name = item.traineeDisplayName ?? item.displayName ?? "";
      if (!name) continue;
      expect(name).toMatch(/^[A-Z]/);
      expect(name).not.toMatch(
        /^(rahul|priya|rohan|meera|sneha|ishita|kavya|nikhil)\b/,
      );
    }
  });

  it("A6: workspace header includes clientWhatsappE164", async () => {
    const rohanRel = demoUuid("relationship", "rahul.coach", "rohan.slipping");
    const res = await app.request(`/workspaces/relationships/${rohanRel}`, {
      headers: {
        Authorization: `Bearer ${trainerToken}`,
        "x-fitbud-role": "trainer",
      },
    }, testEnv());
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as {
      data: { header: { clientWhatsappE164: string | null } };
    };
    expect(body.data.header.clientWhatsappE164).toMatch(/^\+\d+/);
  });
});

describe("coerceIsoInstant", () => {
  it("promotes date-only values to midnight UTC", () => {
    expect(coerceIsoInstant("2026-10-16")).toBe("2026-10-16T00:00:00.000Z");
    expect(coerceIsoInstant("2026-10-16T09:00:00.000Z")).toBe(
      "2026-10-16T09:00:00.000Z",
    );
  });
});
