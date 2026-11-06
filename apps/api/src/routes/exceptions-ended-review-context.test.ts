import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { evaluateRelationshipExceptions } from "../domain/exceptions.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";

/**
 * EC1b fix round 1 (QA F1): ending coaching must make exception detection a
 * no-op for that relationship, whoever triggers it. QA's repro: the demo seed
 * built at SEED, the API clock three-and-a-half days later (NOW), Rahul ends
 * every active client that has a submitted check-in, then opens each
 * check-in's review-context. Before the fix that created ~9 open rows on 7 of
 * the ended clients (missed workouts, overdue meals, an overdue check-in).
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-29T12:00:00.000Z";
const TRAINER = "rahul.coach@demo.fitbud.test";

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

describe("EC1b: exception detection is a no-op on an ended relationship", () => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const rows = (sql: string) => q(sql).map((r) => r.map(String).join(" | "));
  const snapshot = (relationshipIds: string[]) => {
    const ids = `(${relationshipIds.map((id) => `'${id}'`).join(", ")})`;
    return {
      exceptions: rows(`select * from exceptions where coaching_relationship_id in ${ids} order by id`),
      actions: rows(
        `select a.* from exception_actions a join exceptions e on e.id = a.exception_id where e.coaching_relationship_id in ${ids} order by a.id`,
      ),
      interventions: rows(`select * from interventions where coaching_relationship_id in ${ids} order by id`),
    };
  };
  /** Active clients of Rahul with their latest submitted check-in (QA's candidate list). */
  const candidates = () =>
    q(`select r.id, (select c.id from checkins c where c.coaching_relationship_id = r.id and c.record_status = 'submitted' order by c.local_date desc limit 1)
         from coaching_relationships r join user_identities t on t.user_id = r.trainer_user_id
        where r.status = 'active' and t.email = '${TRAINER}' order by r.id`)
      .map(([rel, checkin]) => ({ relationshipId: String(rel), checkinId: checkin == null ? null : String(checkin) }))
      .filter((c): c is { relationshipId: string; checkinId: string } => c.checkinId !== null);

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

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    setTestDbOverride(handle.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
    vi.useRealTimers();
  });

  it("opening review-context after the end changes no exception, action or intervention row", async () => {
    const headers = await trainerHeaders();
    const clients = candidates();
    expect(clients.length).toBeGreaterThanOrEqual(5);
    const ids = clients.map((c) => c.relationshipId);

    // Not vacuous: at NOW these clients have detectable items (a dry run on a copy finds them).
    const control = await createDemoSeededDb(SEED);
    try {
      let wouldCreate = 0;
      for (const id of ids) wouldCreate += (await evaluateRelationshipExceptions(control.db, id, NOW)).created;
      expect(wouldCreate).toBeGreaterThan(0);
    } finally {
      control.close();
    }

    for (const { relationshipId } of clients) {
      const end = await app.request(
        `/relationships/${relationshipId}/end`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json", "idempotency-key": `ec1b-fr1-end-${relationshipId}` },
          body: JSON.stringify({ reason: "paused" }),
        },
        testEnv(),
      );
      expect(end.status).toBe(200);
    }
    const before = snapshot(ids);

    for (const { checkinId } of clients) {
      const context = await app.request(`/checkins/${checkinId}/review-context`, { headers }, testEnv());
      expect(context.status).toBe(200);
      const body = (await context.json()) as { data: { activeExceptions: unknown[] } };
      expect(body.data.activeExceptions).toEqual([]);
    }
    expect(snapshot(ids)).toEqual(before);
    expect(rows(`select id from exceptions where coaching_relationship_id in (${ids.map((id) => `'${id}'`).join(", ")}) and status in ('detected', 'active', 'acknowledged')`)).toEqual([]);
  });

  it("evaluateRelationshipExceptions does nothing for an ended relationship", async () => {
    const headers = await trainerHeaders();
    const ids = candidates().map((c) => c.relationshipId);
    const control = await createDemoSeededDb(SEED);
    let target: string | undefined;
    try {
      for (const id of ids) {
        if ((await evaluateRelationshipExceptions(control.db, id, NOW)).created > 0) {
          target = id;
          break;
        }
      }
    } finally {
      control.close();
    }
    expect(target).toBeDefined();
    const end = await app.request(
      `/relationships/${target}/end`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json", "idempotency-key": "ec1b-fr1-direct-end" },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(end.status).toBe(200);
    const before = snapshot([target!]);

    const result = await evaluateRelationshipExceptions(handle.db, target!, NOW);
    expect(result).toEqual({ created: 0, activated: 0, resolved: 0, exceptions: [], resolvedExceptions: [] });
    expect(snapshot([target!])).toEqual(before);
  });
});
