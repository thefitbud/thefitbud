import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";

/** Mirrors apps/mobile pickTodayCheckin (live Today path after ensure-due + list). */
function pickTodayCheckin(
  items: Array<{
    id: string;
    localDate: string;
    status: string;
    review: { notes: string | null; outcome: string } | null;
  }>,
) {
  const due = items
    .filter((i) => i.status === "due" || i.status === "overdue")
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  if (due[0]) return due[0];
  const reviewed = items
    .filter((i) => Boolean(i.review) || i.status === "reviewed")
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (reviewed[0]) return reviewed[0];
  const waiting = items
    .filter((i) => i.status === "submitted" && !i.review)
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  return waiting[0] ?? null;
}

const FROZEN = "2026-10-17T14:30:00.000Z";

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

describe("Today check-in banner live path", () => {
  let db: Db;
  let close: () => void = () => {};

  beforeAll(async () => {
    await prepareDemoSeededDb(FROZEN);
  });

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN));
    const handle = await createDemoSeededDb(FROZEN);
    close = handle.close;
    db = handle.db;
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

  it("ensure-due + listCheckins prefers reviewed reply over waiting submitted", async () => {
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "rohan.slipping@demo.fitbud.test",
          password: DEMO_PASSWORD_PLAINTEXT,
        }),
      },
      testEnv(),
    );
    expect(login.status).toBe(200);
    const { data: auth } = (await login.json()) as {
      data: { token: string };
    };
    const headers = {
      Authorization: `Bearer ${auth.token}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
      "idempotency-key": "today-checkin-banner-1",
    };
    const rels = await app.request("/relationships", { headers }, testEnv());
    const relBody = (await rels.json()) as {
      data: { items: Array<{ id: string }> };
    };
    const relId = relBody.data.items[0]!.id;

    await app.request(
      `/checkins/relationships/${relId}/ensure-due`,
      { method: "POST", headers, body: "{}" },
      testEnv(),
    );
    const listed = await app.request(
      `/checkins/relationships/${relId}`,
      { headers },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as {
      data: {
        items: Array<{
          id: string;
          localDate: string;
          status: string;
          review: { notes: string | null; outcome: string } | null;
        }>;
      };
    };
    const picked = pickTodayCheckin(body.data.items);
    expect(picked).not.toBeNull();
    expect(picked!.review).not.toBeNull();
    expect(picked!.review!.outcome).toBe("acknowledged");
    expect(picked!.status).toBe("reviewed");
    expect(picked!.review!.notes).toMatch(/sleep|rebuild|effort/i);
  }, 60_000);
});
