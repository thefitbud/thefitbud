/**
 * F11 dark (#497): after the light pass submits Meera's due check-in, Today
 * calls ensure-due again. It must return/create the next scheduled draft (not
 * 500, and not the just-submitted row).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, gt } from "drizzle-orm";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { checkins } from "../db/schema.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";

const FROZEN = "2026-11-20T11:30:00.000Z";

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

describe("ensure-due after submit (F11 / #497)", () => {
  let db: Db;
  let close: () => void = () => {};

  beforeAll(async () => {
    await prepareDemoSeededDb(FROZEN);
  }, 180_000);

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

  async function meeraSession() {
    const login = await app.request(
      "/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: "meera.ack@demo.fitbud.test",
          password: DEMO_PASSWORD_PLAINTEXT,
        }),
      },
      testEnv(),
    );
    expect(login.status).toBe(200);
    const { data: auth } = (await login.json()) as { data: { token: string } };
    const headers = {
      Authorization: `Bearer ${auth.token}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
      "idempotency-key": "meera-ensure-1",
    };
    const rels = await app.request("/relationships", { headers }, testEnv());
    const relId = (
      (await rels.json()) as { data: { items: Array<{ id: string }> } }
    ).data.items[0]!.id;
    return { headers, relId };
  }

  async function submitDue(
    headers: Record<string, string>,
    relId: string,
  ): Promise<string> {
    const listed = await app.request(
      `/checkins/relationships/${relId}`,
      { headers },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const items = (
      (await listed.json()) as {
        data: {
          items: Array<{
            id: string;
            status: string;
            recordVersion: number;
            localDate: string;
          }>;
        };
      }
    ).data.items;
    const due = items.find((i) => i.status === "due" || i.status === "overdue");
    expect(due).toBeTruthy();
    const submit = await app.request(
      `/checkins/${due!.id}/submit`,
      {
        method: "POST",
        headers: { ...headers, "idempotency-key": `submit-${due!.id}` },
        body: JSON.stringify({
          expectedVersion: due!.recordVersion,
          answers: {
            wellbeing: "Good week, one session missed.",
            fieldAnswers: { wellbeing: "Good week, one session missed." },
          },
        }),
      },
      testEnv(),
    );
    expect(submit.status, await submit.clone().text()).toBe(200);
    return due!.id;
  }

  it("returns the seeded next draft after Meera submits today's due check-in", async () => {
    const { headers, relId } = await meeraSession();
    const submittedId = await submitDue(headers, relId);

    const ensure = await app.request(
      `/checkins/relationships/${relId}/ensure-due`,
      {
        method: "POST",
        headers: { ...headers, "idempotency-key": "meera-ensure-after" },
        body: "{}",
      },
      testEnv(),
    );
    expect(ensure.status, await ensure.clone().text()).toBe(200);
    const body = (await ensure.json()) as {
      data: {
        checkin: { id: string; localDate: string; recordStatus: string };
        created: boolean;
      };
    };
    expect(body.data.checkin.id).not.toBe(submittedId);
    expect(body.data.checkin.recordStatus).toBe("draft");
    expect(body.data.checkin.localDate > "2026-11-20").toBe(true);
    expect(body.data.created).toBe(false);
  }, 60_000);

  it("creates the next cadence draft when no future draft exists after submit", async () => {
    const { headers, relId } = await meeraSession();
    const submittedId = await submitDue(headers, relId);
    await db
      .delete(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relId),
          gt(checkins.localDate, "2026-11-20"),
        ),
      );

    const ensure = await app.request(
      `/checkins/relationships/${relId}/ensure-due`,
      {
        method: "POST",
        headers: { ...headers, "idempotency-key": "meera-ensure-create" },
        body: "{}",
      },
      testEnv(),
    );
    expect(ensure.status, await ensure.clone().text()).toBe(200);
    const body = (await ensure.json()) as {
      data: {
        checkin: { id: string; localDate: string; recordStatus: string };
        created: boolean;
      };
    };
    expect(body.data.checkin.id).not.toBe(submittedId);
    expect(body.data.checkin.recordStatus).toBe("draft");
    expect(body.data.checkin.localDate).toBe("2026-11-27");
    expect(body.data.created).toBe(true);
  }, 60_000);

  it("Meera client-visible coach notes do not repeat the same body", async () => {
    const { headers } = await meeraSession();
    const notes = await app.request("/me/coach-notes", { headers }, testEnv());
    expect(notes.status).toBe(200);
    const items = (
      (await notes.json()) as { data: { items: Array<{ body: string }> } }
    ).data.items;
    const bodies = items.map((n) => n.body);
    expect(new Set(bodies).size).toBe(bodies.length);
  }, 60_000);
});
