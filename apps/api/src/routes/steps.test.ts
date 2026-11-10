import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";

/**
 * Z6-9 steps API, through the real routes on persisted data: trainee upsert and
 * today, trainer range read and target, the date window, ended relationships, and
 * the target surviving a configuration revision and a copy (D-W6-26).
 */

// 2026-11-06 20:00 UTC is Sat 7 Nov 01:30 in Asia/Kolkata.
const NOW = new Date("2026-11-06T20:00:00.000Z");

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

type Trainer = { cookie: string };
type Client = {
  relationshipId: string;
  traineeUserId: string;
  trainee: Record<string, string>;
};

async function trainerSession(suffix: string): Promise<Trainer> {
  const token = createTestIdToken(`trainer-steps-${suffix}`, `steps-coach-${suffix}@example.com`);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return { cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

/** Invite, accept, onboard and review a client: coaching-ready, no configuration yet. */
async function addClient(trainer: Trainer, suffix: string): Promise<Client> {
  const client = await inviteAndOnboard(trainer, suffix);
  await setTraineeTimezone(currentDb!, client.traineeUserId, "Asia/Kolkata");
  return client;
}

async function inviteAndOnboard(trainer: Trainer, suffix: string): Promise<Client> {
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-steps-${suffix}`,
      },
      body: JSON.stringify({ recipientEmail: `steps-trainee-${suffix}@example.com` }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `steps-trainee-${suffix}`,
    `steps-trainee-${suffix}@example.com`,
  );
  const trainee = {
    Authorization: `Bearer ${traineeToken}`,
    "x-fitbud-role": "trainee",
    "Content-Type": "application/json",
  };
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: { Authorization: trainee.Authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ token: createdBody.data.token }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;
  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: trainee,
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
  await app.request(
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: { ...trainee, "Idempotency-Key": `submit-steps-${suffix}` },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  const review = await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-steps-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );
  expect(review.status).toBe(200);
  return {
    relationshipId,
    traineeUserId: acceptBody.data.relationship.traineeUserId,
    trainee,
  };
}

const draftBody = {
  expectedVersion: 0,
  goalShort: "Build strength",
  notes: "Focus on lower body recovery",
  workout: { sessionsPerWeek: 4, completionWindowHours: 24 },
  nutrition: {
    mealsPerDay: 3,
    confirmationWindowHours: 6,
    photoRequirement: "selected_meals" as const,
  },
  checkin: { cadence: "weekly" as const, dueWindowHours: 48 },
  tracking: {
    requireBodyWeight: true,
    requireProgressPhotos: false,
    requireSessionRpe: true,
  },
};

function trainerJson(trainer: Trainer, key?: string): Record<string, string> {
  return {
    Cookie: trainer.cookie,
    "Content-Type": "application/json",
    ...(key ? { "Idempotency-Key": key } : {}),
  };
}

async function saveDraft(trainer: Trainer, relationshipId: string, expectedVersion: number) {
  const response = await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: trainerJson(trainer),
      body: JSON.stringify({ ...draftBody, expectedVersion }),
    },
    testEnv(),
  );
  expect([200, 201]).toContain(response.status);
  return ((await response.json()) as { data: { recordVersion: number } }).data;
}

/** A first configuration, activated. */
async function activateConfiguration(trainer: Trainer, relationshipId: string, key: string) {
  const draft = await saveDraft(trainer, relationshipId, 0);
  const activate = await app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: trainerJson(trainer, key),
      body: JSON.stringify({ expectedVersion: draft.recordVersion }),
    },
    testEnv(),
  );
  expect(activate.status).toBe(200);
}

async function putDay(
  client: Client,
  localDate: string,
  body: Record<string, unknown>,
) {
  return app.request(
    `/me/steps/days/${localDate}`,
    { method: "PUT", headers: client.trainee, body: JSON.stringify(body) },
    testEnv(),
  );
}

async function getToday(client: Client) {
  return app.request("/me/steps/today", { headers: client.trainee }, testEnv());
}

async function putTarget(trainer: Trainer, relationshipId: string, body: unknown) {
  return app.request(
    `/steps/relationships/${relationshipId}/target`,
    { method: "PUT", headers: trainerJson(trainer), body: JSON.stringify(body) },
    testEnv(),
  );
}

async function getRange(trainer: Trainer, relationshipId: string, query = "") {
  return app.request(
    `/steps/relationships/${relationshipId}${query}`,
    { headers: { Cookie: trainer.cookie } },
    testEnv(),
  );
}

async function endRelationship(trainer: Trainer, relationshipId: string, key: string) {
  const ended = await app.request(
    `/relationships/${relationshipId}/end`,
    {
      method: "POST",
      headers: trainerJson(trainer, key),
      body: JSON.stringify({ reason: "paused" }),
    },
    testEnv(),
  );
  expect(ended.status).toBe(200);
}

async function setTraineeTimezone(db: Db, userId: string, timezone: string) {
  await db.update(schema.users).set({ timezone }).where(eq(schema.users.id, userId));
}

async function storedDay(db: Db, relationshipId: string, localDate: string) {
  const [row] = await db
    .select()
    .from(schema.dailySteps)
    .where(
      and(
        eq(schema.dailySteps.coachingRelationshipId, relationshipId),
        eq(schema.dailySteps.localDate, localDate),
      ),
    );
  return row;
}

let currentDb: Db | null = null;

type ErrorBody = { error: { code: string; message: string } };

describe("steps API", () => {
  let handle: MemoryDbHandle;
  let db: Db;

  beforeEach(async () => {
    handle = await createMemoryDb();
    db = handle.db;
    currentDb = db;
    setTestDbOverride(db);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  describe("trainee upsert and today", () => {
    it("saves a day, reads today against the default target, and a newer write replaces it", async () => {
      const trainer = await trainerSession("up");
      const client = await addClient(trainer, "up");
      await activateConfiguration(trainer, client.relationshipId, "act-up");

      const empty = await getToday(client);
      expect(empty.status).toBe(200);
      expect(((await empty.json()) as { data: unknown }).data).toEqual({
        localDate: "2026-11-07",
        steps: null,
        target: 8000,
      });

      const first = await putDay(client, "2026-11-07", {
        steps: 4200,
        source: "apple_health",
        syncedAt: "2026-11-06T19:00:00.000Z",
      });
      expect(first.status).toBe(200);
      expect(((await first.json()) as { data: unknown }).data).toEqual({
        localDate: "2026-11-07",
        steps: 4200,
        source: "apple_health",
        syncedAt: "2026-11-06T19:00:00.000Z",
        applied: true,
      });

      const newer = await putDay(client, "2026-11-07", {
        steps: 6100,
        source: "apple_health",
        syncedAt: "2026-11-06T19:30:00.000Z",
      });
      expect(((await newer.json()) as { data: { steps: number; applied: boolean } }).data).toMatchObject({
        steps: 6100,
        applied: true,
      });

      const today = await getToday(client);
      expect(((await today.json()) as { data: unknown }).data).toEqual({
        localDate: "2026-11-07",
        steps: 6100,
        target: 8000,
      });
      const row = await storedDay(db, client.relationshipId, "2026-11-07");
      expect(row?.steps).toBe(6100);
    });

    it("ignores an older syncedAt and returns what is stored; replaying the same write is a no-op", async () => {
      const trainer = await trainerSession("old");
      const client = await addClient(trainer, "old");
      await activateConfiguration(trainer, client.relationshipId, "act-old");
      const body = { steps: 7000, source: "health_connect", syncedAt: "2026-11-06T19:30:00.000Z" };
      expect((await putDay(client, "2026-11-07", body)).status).toBe(200);

      const older = await putDay(client, "2026-11-07", {
        steps: 100,
        source: "manual",
        syncedAt: "2026-11-06T18:00:00.000Z",
      });
      expect(older.status).toBe(200);
      expect(((await older.json()) as { data: unknown }).data).toEqual({
        localDate: "2026-11-07",
        steps: 7000,
        source: "health_connect",
        syncedAt: "2026-11-06T19:30:00.000Z",
        applied: false,
      });

      const replay = await putDay(client, "2026-11-07", body);
      expect(((await replay.json()) as { data: { applied: boolean; steps: number } }).data).toMatchObject({
        applied: true,
        steps: 7000,
      });
      const sameInstantDifferent = await putDay(client, "2026-11-07", {
        steps: 7001,
        source: "health_connect",
        syncedAt: "2026-11-06T19:30:00.000Z",
      });
      expect(
        ((await sameInstantDifferent.json()) as { data: { applied: boolean; steps: number } }).data,
      ).toMatchObject({ applied: false, steps: 7000 });
      const row = await storedDay(db, client.relationshipId, "2026-11-07");
      expect(row?.steps).toBe(7000);
      expect(row?.source).toBe("health_connect");
    });

    it("defaults syncedAt to the server time and clamps one ahead of the clock", async () => {
      const trainer = await trainerSession("clamp");
      const client = await addClient(trainer, "clamp");
      const noStamp = await putDay(client, "2026-11-07", { steps: 10, source: "manual" });
      expect(((await noStamp.json()) as { data: { syncedAt: string } }).data.syncedAt).toBe(
        NOW.toISOString(),
      );
      const future = await putDay(client, "2026-11-06", {
        steps: 20,
        source: "manual",
        syncedAt: "2030-01-01T00:00:00.000Z",
      });
      expect(((await future.json()) as { data: { syncedAt: string } }).data.syncedAt).toBe(
        NOW.toISOString(),
      );
    });

    it("rejects bad bodies, bad dates and out-of-range totals with static messages", async () => {
      const trainer = await trainerSession("bad");
      const client = await addClient(trainer, "bad");
      for (const body of [
        { steps: -1, source: "manual" },
        { steps: 200001, source: "manual" },
        { steps: 10.5, source: "manual" },
        { steps: 10, source: "fitbit" },
        { steps: 10 },
      ]) {
        const response = await putDay(client, "2026-11-07", body);
        expect(response.status).toBe(400);
        const parsed = (await response.json()) as ErrorBody;
        expect(parsed.error.code).toBe("INVALID_REQUEST");
        expect(parsed.error.message).toBe("Invalid steps entry.");
      }
      const edge = await putDay(client, "2026-11-07", { steps: 200000, source: "manual" });
      expect(edge.status).toBe(200);
      for (const date of ["2026-02-31", "2026-13-01", "20261107", "not-a-date"]) {
        const response = await putDay(client, date, { steps: 10, source: "manual" });
        expect(response.status).toBe(400);
        expect(((await response.json()) as ErrorBody).error.message).toBe("Invalid steps date.");
      }
    });

    it("accepts today+1 and today-30 in the trainee's zone, and rejects today+2 and today-31", async () => {
      const trainer = await trainerSession("win");
      const client = await addClient(trainer, "win");
      // Kolkata today is 2026-11-07.
      const cases: Array<[string, number, string?]> = [
        ["2026-11-08", 200],
        ["2026-11-09", 400, "STEPS_DATE_OUT_OF_RANGE"],
        ["2026-10-08", 200],
        ["2026-10-07", 400, "STEPS_DATE_OUT_OF_RANGE"],
      ];
      for (const [date, status, code] of cases) {
        const response = await putDay(client, date, { steps: 10, source: "manual" });
        expect(response.status, date).toBe(status);
        if (code) {
          const parsed = (await response.json()) as ErrorBody;
          expect(parsed.error.code).toBe(code);
          expect(parsed.error.message).toBe(
            "Steps can be saved for the last 30 days and up to tomorrow.",
          );
        }
      }
      expect(await storedDay(db, client.relationshipId, "2026-11-09")).toBeUndefined();
    });

    it("measures the window in the trainee's own zone, not the server's or UTC", async () => {
      const trainer = await trainerSession("tz");
      const client = await addClient(trainer, "tz");
      // At 20:00 UTC it is Sat 7 Nov in Auckland (09:00), but still Fri 6 Nov in Los
      // Angeles (12:00).
      await setTraineeTimezone(db, client.traineeUserId, "Pacific/Auckland");
      expect((await putDay(client, "2026-11-08", { steps: 1, source: "manual" })).status).toBe(200);
      expect((await putDay(client, "2026-11-09", { steps: 1, source: "manual" })).status).toBe(400);
      expect(((await (await getToday(client)).json()) as { data: { localDate: string } }).data.localDate).toBe(
        "2026-11-07",
      );

      await setTraineeTimezone(db, client.traineeUserId, "America/Los_Angeles");
      expect((await putDay(client, "2026-11-07", { steps: 1, source: "manual" })).status).toBe(200);
      expect((await putDay(client, "2026-11-08", { steps: 1, source: "manual" })).status).toBe(400);
      expect((await putDay(client, "2026-10-07", { steps: 1, source: "manual" })).status).toBe(200);
      expect((await putDay(client, "2026-10-06", { steps: 1, source: "manual" })).status).toBe(400);
    });

    it("keeps the settings response shape old builds read", async () => {
      const trainer = await trainerSession("old-shape");
      const client = await addClient(trainer, "old-shape");
      const settings = await app.request("/me/steps", { headers: client.trainee }, testEnv());
      expect(settings.status).toBe(200);
      const body = (await settings.json()) as { data: Record<string, unknown> };
      expect(Object.keys(body.data).sort()).toEqual(["dailyGoal", "enabled", "source"]);
    });
  });

  describe("ended relationships", () => {
    it("rejects trainee writes and trainer target edits with 409, and keeps reads working", async () => {
      const trainer = await trainerSession("end");
      const client = await addClient(trainer, "end");
      await activateConfiguration(trainer, client.relationshipId, "act-end");
      expect((await putTarget(trainer, client.relationshipId, { target: 12000 })).status).toBe(200);
      expect((await putDay(client, "2026-11-07", { steps: 5000, source: "manual" })).status).toBe(200);
      await endRelationship(trainer, client.relationshipId, "end-1");

      const write = await putDay(client, "2026-11-07", { steps: 9000, source: "manual" });
      expect(write.status).toBe(409);
      const writeBody = (await write.json()) as ErrorBody;
      expect(writeBody.error.code).toBe("RELATIONSHIP_ENDED");
      expect(writeBody.error.message).toBe("This coaching relationship has ended.");
      expect((await storedDay(db, client.relationshipId, "2026-11-07"))?.steps).toBe(5000);

      const target = await putTarget(trainer, client.relationshipId, { target: 20000 });
      expect(target.status).toBe(409);
      expect(((await target.json()) as ErrorBody).error.code).toBe("RELATIONSHIP_ENDED");

      const today = await getToday(client);
      expect(today.status).toBe(200);
      expect(((await today.json()) as { data: unknown }).data).toEqual({
        localDate: "2026-11-07",
        steps: 5000,
        target: 12000,
      });
      const range = await getRange(trainer, client.relationshipId);
      expect(range.status).toBe(200);
      const rangeBody = (await range.json()) as {
        data: { target: number; days: Array<{ steps: number }> };
      };
      expect(rangeBody.data.target).toBe(12000);
      expect(rangeBody.data.days.map((day) => day.steps)).toEqual([5000]);
    });
  });

  describe("trainer range read", () => {
    it("returns saved days oldest first inside the window, with no gaps filled in", async () => {
      const trainer = await trainerSession("rng");
      const client = await addClient(trainer, "rng");
      await activateConfiguration(trainer, client.relationshipId, "act-rng");
      for (const [date, steps] of [
        ["2026-11-07", 3000],
        ["2026-11-01", 9000],
        ["2026-10-20", 5000],
        ["2026-10-09", 4000],
      ] as const) {
        expect((await putDay(client, date, { steps, source: "apple_health" })).status).toBe(200);
      }
      // Tomorrow's entry exists but is outside every window ending today.
      expect((await putDay(client, "2026-11-08", { steps: 1, source: "apple_health" })).status).toBe(200);

      const week = await getRange(trainer, client.relationshipId);
      expect(week.status).toBe(200);
      const weekBody = (await week.json()) as {
        data: {
          relationshipId: string;
          target: number;
          from: string;
          to: string;
          days: Array<{ localDate: string; steps: number; source: string }>;
        };
      };
      expect(weekBody.data).toMatchObject({
        relationshipId: client.relationshipId,
        target: 8000,
        from: "2026-11-01",
        to: "2026-11-07",
      });
      expect(weekBody.data.days.map((day) => [day.localDate, day.steps])).toEqual([
        ["2026-11-01", 9000],
        ["2026-11-07", 3000],
      ]);

      const month = await getRange(trainer, client.relationshipId, "?range=30d");
      const monthBody = (await month.json()) as { data: { from: string; days: Array<{ localDate: string }> } };
      expect(monthBody.data.from).toBe("2026-10-09");
      expect(monthBody.data.days.map((day) => day.localDate)).toEqual([
        "2026-10-09",
        "2026-10-20",
        "2026-11-01",
        "2026-11-07",
      ]);

      const bad = await getRange(trainer, client.relationshipId, "?range=1y");
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as ErrorBody).error.message).toBe("Invalid steps range.");
    });
  });

  describe("trainer target", () => {
    it("sets the target on the active configuration; the trainee reads it; bounds are enforced", async () => {
      const trainer = await trainerSession("tgt");
      const client = await addClient(trainer, "tgt");
      await activateConfiguration(trainer, client.relationshipId, "act-tgt");

      const set = await putTarget(trainer, client.relationshipId, { target: 11000 });
      expect(set.status).toBe(200);
      expect(((await set.json()) as { data: unknown }).data).toEqual({
        relationshipId: client.relationshipId,
        target: 11000,
      });
      const today = await getToday(client);
      expect(((await today.json()) as { data: { target: number } }).data.target).toBe(11000);

      for (const target of [999, 50001, 1000.5, "9000", null]) {
        const response = await putTarget(trainer, client.relationshipId, { target });
        expect(response.status).toBe(400);
        expect(((await response.json()) as ErrorBody).error.message).toBe("Invalid steps target.");
      }
      expect((await putTarget(trainer, client.relationshipId, { target: 1000 })).status).toBe(200);
      expect((await putTarget(trainer, client.relationshipId, { target: 50000 })).status).toBe(200);
      expect((await putTarget(trainer, client.relationshipId, {})).status).toBe(400);
    });

    it("writes the active version and an open draft together, without changing either's record version", async () => {
      const trainer = await trainerSession("both");
      const client = await addClient(trainer, "both");
      await activateConfiguration(trainer, client.relationshipId, "act-both");
      const opened = await app.request(
        `/configurations/relationships/${client.relationshipId}/versions`,
        {
          method: "POST",
          headers: trainerJson(trainer, "open-both"),
          body: JSON.stringify({ expectedVersion: 2 }),
        },
        testEnv(),
      );
      expect(opened.status).toBe(201);

      const before = await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.coachingRelationshipId, client.relationshipId));
      expect((await putTarget(trainer, client.relationshipId, { target: 15000 })).status).toBe(200);
      const after = await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.coachingRelationshipId, client.relationshipId));
      expect(after.map((row) => [row.status, row.stepsTarget]).sort()).toEqual([
        ["active", 15000],
        ["draft", 15000],
      ]);
      for (const row of after) {
        const prior = before.find((candidate) => candidate.id === row.id);
        expect(row.recordVersion).toBe(prior?.recordVersion);
      }
    });

    it("carries the target onto the next version made from the active one, and through activation (D-W6-26)", async () => {
      const trainer = await trainerSession("rev");
      const client = await addClient(trainer, "rev");
      await activateConfiguration(trainer, client.relationshipId, "act-rev");
      expect((await putTarget(trainer, client.relationshipId, { target: 13500 })).status).toBe(200);

      const opened = await app.request(
        `/configurations/relationships/${client.relationshipId}/versions`,
        {
          method: "POST",
          headers: trainerJson(trainer, "open-rev"),
          body: JSON.stringify({ expectedVersion: 2 }),
        },
        testEnv(),
      );
      expect(opened.status).toBe(201);
      const draft = ((await opened.json()) as { data: { id: string; recordVersion: number } }).data;
      const [draftRow] = await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.id, draft.id));
      expect(draftRow?.stepsTarget).toBe(13500);

      const activate = await app.request(
        `/configurations/relationships/${client.relationshipId}/activate`,
        {
          method: "POST",
          headers: trainerJson(trainer, "act-rev-2"),
          body: JSON.stringify({ expectedVersion: draft.recordVersion }),
        },
        testEnv(),
      );
      expect(activate.status).toBe(200);
      const today = await getToday(client);
      expect(((await today.json()) as { data: { target: number } }).data.target).toBe(13500);
      const range = await getRange(trainer, client.relationshipId);
      expect(((await range.json()) as { data: { target: number } }).data.target).toBe(13500);
    });

    it("a target saved while a new version is being copied is not reverted when that version activates (Z8-18)", async () => {
      const trainer = await trainerSession("race");
      const client = await addClient(trainer, "race");
      await activateConfiguration(trainer, client.relationshipId, "act-race");
      expect((await putTarget(trainer, client.relationshipId, { target: 11000 })).status).toBe(200);

      // Interleave deterministically: the PUT lands after the copy has read the
      // active row but before the draft row is inserted.
      const realInsert = db.insert.bind(db);
      let interleaved = false;
      const spy = vi.spyOn(db, "insert").mockImplementation(((table: unknown) => {
        if (!interleaved && table === schema.coachingConfigurations) {
          interleaved = true;
          spy.mockRestore();
          return {
            values: async (values: unknown) => {
              const put = await putTarget(trainer, client.relationshipId, { target: 16000 });
              expect(put.status).toBe(200);
              return (realInsert(table as never) as unknown as { values: (v: unknown) => Promise<unknown> }).values(values);
            },
          };
        }
        return realInsert(table as never);
      }) as never);

      const opened = await app.request(
        `/configurations/relationships/${client.relationshipId}/versions`,
        {
          method: "POST",
          headers: trainerJson(trainer, "open-race"),
          body: JSON.stringify({ expectedVersion: 2 }),
        },
        testEnv(),
      );
      expect(opened.status).toBe(201);
      expect(interleaved).toBe(true);
      const draft = ((await opened.json()) as { data: { recordVersion: number } }).data;

      const activate = await app.request(
        `/configurations/relationships/${client.relationshipId}/activate`,
        {
          method: "POST",
          headers: trainerJson(trainer, "act-race-2"),
          body: JSON.stringify({ expectedVersion: draft.recordVersion }),
        },
        testEnv(),
      );
      expect(activate.status).toBe(200);
      const rows = await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.coachingRelationshipId, client.relationshipId));
      expect(rows.find((row) => row.status === "active")?.stepsTarget).toBe(16000);
      const range = await getRange(trainer, client.relationshipId);
      expect(((await range.json()) as { data: { target: number } }).data.target).toBe(16000);
    });

    it("carries the target when a configuration is copied from another client (D-W6-26)", async () => {
      const trainer = await trainerSession("copy");
      const source = await addClient(trainer, "copy-src");
      const target = await addClient(trainer, "copy-dst");
      await activateConfiguration(trainer, source.relationshipId, "act-copy-src");
      expect((await putTarget(trainer, source.relationshipId, { target: 16000 })).status).toBe(200);

      const copied = await app.request(
        `/configurations/relationships/${target.relationshipId}/copy`,
        {
          method: "POST",
          headers: trainerJson(trainer, "copy-steps"),
          body: JSON.stringify({ sourceRelationshipId: source.relationshipId }),
        },
        testEnv(),
      );
      expect(copied.status).toBe(201);
      const copiedId = ((await copied.json()) as { data: { id: string } }).data.id;
      const [row] = await db
        .select()
        .from(schema.coachingConfigurations)
        .where(eq(schema.coachingConfigurations.id, copiedId));
      expect(row?.stepsTarget).toBe(16000);
      // The new client's own target is the copied draft's until it is activated.
      const range = await getRange(trainer, target.relationshipId);
      expect(((await range.json()) as { data: { target: number } }).data.target).toBe(16000);
    });

    it("answers 404 CONFIGURATION_NOT_FOUND when the client has no configuration yet", async () => {
      const trainer = await trainerSession("nocfg");
      const client = await addClient(trainer, "nocfg");
      const response = await putTarget(trainer, client.relationshipId, { target: 9000 });
      expect(response.status).toBe(404);
      expect(((await response.json()) as ErrorBody).error.code).toBe("CONFIGURATION_NOT_FOUND");
    });
  });

  describe("statement counts", () => {
    type Recorded = { sql: string };

    /** The same connection, recording every statement the route runs. */
    function recording(statements: Recorded[]): void {
      const d1 = (handle.db as unknown as { $client: D1Database }).$client;
      setTestDbOverride(
        drizzle(d1, {
          schema,
          logger: { logQuery: (sql) => statements.push({ sql }) },
        }) as Db,
      );
    }

    /** Statements on the steps tables: the routes' own work, apart from sign-in. */
    function stepsStatements(statements: Recorded[]): Recorded[] {
      return statements.filter((statement) =>
        /daily_steps|coaching_configurations/.test(statement.sql),
      );
    }

    it("each endpoint runs at most 2 statements on the steps tables and relationships", async () => {
      const trainer = await trainerSession("qc");
      const client = await addClient(trainer, "qc");
      await activateConfiguration(trainer, client.relationshipId, "act-qc");
      await putDay(client, "2026-11-07", { steps: 100, source: "manual" });

      const calls: Array<[string, () => Promise<Response>]> = [
        ["PUT day", () => putDay(client, "2026-11-07", { steps: 200, source: "manual" })],
        ["GET today", () => getToday(client)],
        ["GET range", () => getRange(trainer, client.relationshipId, "?range=90d")],
        ["PUT target", () => putTarget(trainer, client.relationshipId, { target: 9000 })],
      ];
      for (const [label, call] of calls) {
        const statements: Recorded[] = [];
        recording(statements);
        const response = await call();
        expect(response.status, label).toBe(200);
        expect(stepsStatements(statements).length, label).toBeLessThanOrEqual(2);
        // The relationship lookup is one of them, and the only one that is not the write or read.
        expect(
          statements.filter((statement) => /coaching_relationships/.test(statement.sql)).length,
          label,
        ).toBeLessThanOrEqual(2);
      }
    });

    it("does not grow with other clients' step history", async () => {
      const trainer = await trainerSession("qc2");
      const client = await addClient(trainer, "qc2");
      const other = await addClient(trainer, "qc2-other");
      await activateConfiguration(trainer, client.relationshipId, "act-qc2");
      const count = async () => {
        const statements: Recorded[] = [];
        recording(statements);
        expect((await getRange(trainer, client.relationshipId)).status).toBe(200);
        return statements.length;
      };
      const small = await count();
      for (let day = 1; day <= 25; day += 1) {
        await db.insert(schema.dailySteps).values({
          id: crypto.randomUUID(),
          coachingRelationshipId: other.relationshipId,
          localDate: `2026-10-${String(day).padStart(2, "0")}`,
          steps: 1000 + day,
          source: "manual",
          syncedAt: NOW.toISOString(),
        });
      }
      setTestDbOverride(db);
      expect(await count()).toBe(small);
    });
  });
});
