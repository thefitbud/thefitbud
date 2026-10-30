/**
 * Batch 0 API/seed acceptance tests (03-api-changes A1–A14).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
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

const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";

describe("Batch 0 API fixes", () => {
  let db: Db;
  let close: () => void = () => {};
  let trainerToken = "";

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
    trainerToken = await login("rahul.coach@demo.fitbud.test");
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
    vi.useRealTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
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
      // Evaluate can surface a dense overdue stack for paused clients; keep bounded.
      expect(group.items.length).toBeLessThanOrEqual(10);
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

  it("A4b: exception summaries are human labels, not raw types", async () => {
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
    const body = JSON.parse(await res.text()) as {
      data: {
        groups: Array<{
          items: Array<{ type: string; summary: string; severity: string }>;
        }>;
      };
    };
    for (const group of body.data.groups) {
      for (const item of group.items) {
        expect(item.summary).not.toBe(item.type);
        expect(item.summary).not.toMatch(/_/);
      }
    }
  });

  it("A4c: on-track Aarav is not critical and has no future meal logs", async () => {
    const aaravRel = demoUuid("relationship", "rahul.coach", "aarav.ontrack");
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
    const attention = JSON.parse(await grouped.text()) as {
      data: {
        groups: Array<{
          relationshipId: string;
          items: Array<{ severity: string }>;
        }>;
      };
    };
    const aaravGroup = attention.data.groups.find(
      (g) => g.relationshipId === aaravRel,
    );
    if (aaravGroup) {
      expect(aaravGroup.items.some((i) => i.severity === "critical")).toBe(
        false,
      );
    }

    const aaravToken = await login("aarav.ontrack@demo.fitbud.test");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const mealsRes = await app.request(
      `/meals/relationships/${aaravRel}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${aaravToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const mealsText = await mealsRes.text();
    expect(mealsRes.status, mealsText).toBe(200);
    const mealsBody = JSON.parse(mealsText) as {
      data: {
        items: Array<{
          localDate: string;
          mealName: string;
          status: string;
          windowStartsAt: string;
        }>;
      };
    };
    const now = Date.now();
    for (const meal of mealsBody.data.items) {
      if (Date.parse(meal.windowStartsAt) > now) {
        expect(
          meal.status,
          `${meal.mealName} before slot start`,
        ).not.toBe("confirmed");
      }
    }
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
