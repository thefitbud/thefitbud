import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { planTemplates } from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import type { Env } from "../types.js";

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

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

async function addClient(trainerCookie: string, suffix: string) {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-usedby-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `usedby-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  expect(created.status).toBe(200);
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `usedby-trainee-${suffix}`,
    `usedby-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: createdBody.data.token }),
    },
    testEnv(),
  );
  expect(accept.status).toBe(200);
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  const draft = await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Strength",
          relevant_history: "None",
          preferences: "Gym",
          schedule: "Evenings",
          limitations: "Knee",
        },
      }),
    },
    testEnv(),
  );
  expect(draft.status).toBe(201);
  const submitted = await app.request(
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-usedby-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  expect(submitted.status).toBe(200);
  const reviewed = await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-usedby-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );
  expect(reviewed.status).toBe(200);
  return relationshipId;
}

function workoutContent() {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        exercises: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            order: 1,
            name: "Squat",
            instructions: "Depth to parallel",
            setTargets: [
              {
                id: "33333333-3333-4333-8333-333333333333",
                order: 1,
                reps: 5,
                loadLabel: "RPE 7",
                rpe: 7,
              },
            ],
          },
        ],
      },
    ],
    mealPrescriptions: [] as never[],
  };
}

type UsedBy = { count: number; clientIds: string[] };

async function listTemplates(cookie: string) {
  const response = await app.request(
    "/templates?limit=50",
    { headers: { Cookie: cookie } },
    testEnv(),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);
  const body = JSON.parse(text) as {
    data: { items: Array<{ id: string; usedBy: UsedBy }> };
  };
  return body.data.items;
}

function usedByOf(
  items: Array<{ id: string; usedBy: UsedBy }>,
  templateId: string,
): UsedBy {
  const item = items.find((row) => row.id === templateId);
  expect(item).toBeTruthy();
  return item!.usedBy;
}

async function applyTemplate(
  cookie: string,
  relationshipId: string,
  templateId: string,
  key: string,
) {
  const applied = await app.request(
    `/plans/relationships/${relationshipId}/from-template`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ templateId }),
    },
    testEnv(),
  );
  const text = await applied.text();
  expect(applied.status, text).toBe(201);
  const body = JSON.parse(text) as {
    data: {
      plan: { id: string };
      version: { id: string; recordVersion: number; status: string };
    };
  };
  expect(body.data.version.status).toBe("draft");
  return body.data;
}

async function publishVersion(
  cookie: string,
  planId: string,
  versionId: string,
  recordVersion: number,
  key: string,
  mode: "immediate" | "scheduled",
) {
  const body: {
    expectedRecordVersion: number;
    mode: "immediate" | "scheduled";
    effectiveFrom?: string;
  } = { expectedRecordVersion: recordVersion, mode };
  if (mode === "scheduled") {
    body.effectiveFrom = new Date(Date.now() + 86_400_000).toISOString();
  }
  const published = await app.request(
    `/plans/${planId}/versions/${versionId}/publish`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
  const text = await published.text();
  expect(published.status, text).toBe(200);
  const parsed = JSON.parse(text) as { data: { status: string } };
  expect(parsed.data.status).toBe(mode === "scheduled" ? "scheduled" : "effective");
}

describe("template list usedBy", () => {
  let handle: MemoryDbHandle;
  let queries: string[] = [];

  beforeEach(async () => {
    handle = await createMemoryDb();
    setTestDbOverride(handle.db);
    queries = [];
    const client = (handle.db as unknown as { $client: D1Database }).$client;
    const prepare = client.prepare.bind(client);
    client.prepare = ((query: string) => {
      queries.push(query);
      return prepare(query);
    }) as D1Database["prepare"];
  });

  afterEach(() => {
    setTestDbOverride(null);
    handle.close();
  });

  it(
    "counts active clients of this coach, caps ids at three, and uses one lookup",
    async () => {
      const coachA = await createTrainerSession("usedby-coach-a@example.com");
      const coachB = await createTrainerSession("usedby-coach-b@example.com");
      const now = nowIso();
      const sharedId = createId();
      const unusedId = createId();
      const replacementId = createId();
      await (handle.db as Db).insert(planTemplates).values([
        {
          id: sharedId,
          ownership: "global",
          trainerUserId: null,
          title: "Shared base",
          templateType: "workout",
          contentJson: JSON.stringify(workoutContent()),
          recordVersion: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: unusedId,
          ownership: "trainer",
          trainerUserId: await trainerUserId(coachA.cookie),
          title: "Unused mine",
          templateType: "workout",
          contentJson: JSON.stringify(workoutContent()),
          recordVersion: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: replacementId,
          ownership: "global",
          trainerUserId: null,
          title: "Replacement base",
          templateType: "workout",
          contentJson: JSON.stringify(workoutContent()),
          recordVersion: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const zero = await listTemplates(coachA.cookie);
      expect(usedByOf(zero, sharedId)).toEqual({ count: 0, clientIds: [] });
      expect(usedByOf(zero, unusedId)).toEqual({ count: 0, clientIds: [] });

      const activeIds: string[] = [];
      for (let i = 0; i < 5; i += 1) {
        const relationshipId = await addClient(coachA.cookie, `a-${i}`);
        const applied = await applyTemplate(
          coachA.cookie,
          relationshipId,
          sharedId,
          `apply-a-${i}`,
        );
        await publishVersion(
          coachA.cookie,
          applied.plan.id,
          applied.version.id,
          applied.version.recordVersion,
          `publish-a-${i}`,
          "immediate",
        );
        activeIds.push(relationshipId);
        if (i === 0 || i === 2 || i === 4) {
          queries.length = 0;
          const items = await listTemplates(coachA.cookie);
          const expectedIds = [...activeIds].sort();
          expect(usedByOf(items, sharedId)).toEqual({
            count: expectedIds.length,
            clientIds: expectedIds.slice(0, 3),
          });
          const lookups = queries.filter((query) => query.includes("plan_versions"));
          expect(lookups).toHaveLength(1);
        }
      }

      queries.length = 0;
      const atFive = await listTemplates(coachA.cookie);
      const fiveSorted = [...activeIds].sort();
      expect(usedByOf(atFive, sharedId)).toEqual({
        count: 5,
        clientIds: fiveSorted.slice(0, 3),
      });
      const fiveLookups = queries.filter((query) => query.includes("plan_versions"));
      expect(fiveLookups).toHaveLength(1);
      expect(fiveLookups[0]).toContain("source_template_id");
      expect(fiveLookups[0]).toContain("coaching_relationships");
      expect(fiveLookups[0]).toContain("effective_to");
      expect(fiveLookups[0]).toContain("trainer_user_id");

      const usageSql = fiveLookups[0]!;
      const marks = usageSql.match(/\?/g)?.length ?? 0;
      const client = (handle.db as unknown as { $client: D1Database }).$client;
      const explained = await client
        .prepare(`EXPLAIN QUERY PLAN ${usageSql}`)
        .bind(
          ...Array.from(
            { length: marks },
            () => "00000000-0000-4000-8000-000000000001",
          ),
        )
        .all<{ detail: string }>();
      const detail = (explained.results ?? [])
        .map((row) => row.detail)
        .join("\n");
      expect(detail).toMatch(/USING INDEX \S*(coaching_relationships_trainer_idx|plan_versions_)/);

      const draftId = await addClient(coachA.cookie, "draft");
      await applyTemplate(coachA.cookie, draftId, sharedId, "apply-draft");

      const scheduledId = await addClient(coachA.cookie, "scheduled");
      const scheduled = await applyTemplate(
        coachA.cookie,
        scheduledId,
        sharedId,
        "apply-scheduled",
      );
      await publishVersion(
        coachA.cookie,
        scheduled.plan.id,
        scheduled.version.id,
        scheduled.version.recordVersion,
        "publish-scheduled",
        "scheduled",
      );

      const endedId = await addClient(coachA.cookie, "ended");
      const endedPlan = await applyTemplate(
        coachA.cookie,
        endedId,
        sharedId,
        "apply-ended",
      );
      await publishVersion(
        coachA.cookie,
        endedPlan.plan.id,
        endedPlan.version.id,
        endedPlan.version.recordVersion,
        "publish-ended",
        "immediate",
      );
      const ended = await app.request(
        `/relationships/${endedId}/end`,
        {
          method: "POST",
          headers: {
            Cookie: coachA.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: "paused" }),
        },
        testEnv(),
      );
      expect(ended.status).toBe(200);

      const replacedId = await addClient(coachA.cookie, "replaced");
      const first = await applyTemplate(
        coachA.cookie,
        replacedId,
        sharedId,
        "apply-replaced-1",
      );
      await publishVersion(
        coachA.cookie,
        first.plan.id,
        first.version.id,
        first.version.recordVersion,
        "publish-replaced-1",
        "immediate",
      );
      const second = await applyTemplate(
        coachA.cookie,
        replacedId,
        replacementId,
        "apply-replaced-2",
      );
      await publishVersion(
        coachA.cookie,
        second.plan.id,
        second.version.id,
        second.version.recordVersion,
        "publish-replaced-2",
        "immediate",
      );

      const closedId = await addClient(coachA.cookie, "closed");
      const closedPlan = await applyTemplate(
        coachA.cookie,
        closedId,
        sharedId,
        "apply-closed",
      );
      await publishVersion(
        coachA.cookie,
        closedPlan.plan.id,
        closedPlan.version.id,
        closedPlan.version.recordVersion,
        "publish-closed",
        "immediate",
      );
      handle.sqlite.run(
        "UPDATE plan_versions SET effective_to = ? WHERE id = ?",
        ["2000-01-01T00:00:00.000Z", closedPlan.version.id],
      );

      const replacedByBlankId = await addClient(coachA.cookie, "blank");
      const fromTemplate = await applyTemplate(
        coachA.cookie,
        replacedByBlankId,
        sharedId,
        "apply-blank-template",
      );
      await publishVersion(
        coachA.cookie,
        fromTemplate.plan.id,
        fromTemplate.version.id,
        fromTemplate.version.recordVersion,
        "publish-blank-template",
        "immediate",
      );
      const blank = await app.request(
        `/plans/relationships/${replacedByBlankId}`,
        {
          method: "POST",
          headers: {
            Cookie: coachA.cookie,
            "Content-Type": "application/json",
            "Idempotency-Key": "create-blank-plan",
          },
          body: JSON.stringify({
            title: "Later blank plan",
            content: workoutContent(),
          }),
        },
        testEnv(),
      );
      const blankText = await blank.text();
      expect(blank.status, blankText).toBe(201);
      const blankBody = JSON.parse(blankText) as {
        data: {
          plan: { id: string };
          version: { id: string; recordVersion: number };
        };
      };
      await publishVersion(
        coachA.cookie,
        blankBody.data.plan.id,
        blankBody.data.version.id,
        blankBody.data.version.recordVersion,
        "publish-blank-plan",
        "immediate",
      );

      const otherId = await addClient(coachB.cookie, "b-0");
      const otherPlan = await applyTemplate(
        coachB.cookie,
        otherId,
        sharedId,
        "apply-b-0",
      );
      await publishVersion(
        coachB.cookie,
        otherPlan.plan.id,
        otherPlan.version.id,
        otherPlan.version.recordVersion,
        "publish-b-0",
        "immediate",
      );

      const after = await listTemplates(coachA.cookie);
      expect(usedByOf(after, sharedId)).toEqual({
        count: 5,
        clientIds: fiveSorted.slice(0, 3),
      });
      expect(usedByOf(after, unusedId)).toEqual({ count: 0, clientIds: [] });
      expect(usedByOf(after, replacementId)).toEqual({
        count: 1,
        clientIds: [replacedId],
      });
      const sharedIds = usedByOf(after, sharedId).clientIds;
      expect(sharedIds).not.toContain(draftId);
      expect(sharedIds).not.toContain(scheduledId);
      expect(sharedIds).not.toContain(endedId);
      expect(sharedIds).not.toContain(replacedId);
      expect(sharedIds).not.toContain(closedId);
      expect(sharedIds).not.toContain(replacedByBlankId);
      expect(sharedIds).not.toContain(otherId);

      const otherList = await listTemplates(coachB.cookie);
      expect(usedByOf(otherList, sharedId)).toEqual({
        count: 1,
        clientIds: [otherId],
      });
      expect(otherList.some((item) => item.id === unusedId)).toBe(false);
    },
    60_000,
  );
});

async function trainerUserId(cookie: string): Promise<string> {
  const me = await app.request("/me", { headers: { Cookie: cookie } }, testEnv());
  expect(me.status).toBe(200);
  const body = (await me.json()) as { data: { userId: string } };
  return body.data.userId;
}
