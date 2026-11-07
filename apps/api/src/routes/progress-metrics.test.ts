/**
 * Z6-7 (D-W6-41): progress series by check-in question key. Real routes on
 * persisted data: invitation -> accepted relationship, check-ins pinned to a
 * keyed form version and stored measurements inserted as the production
 * workflow stores them, then GET /progress/relationships/:id/metrics.
 *
 * The clock is pinned (Date only): Thursday 5 Nov 2026 06:00 UTC is 11:30 in
 * Asia/Kolkata, so "today" is 2026-11-05. 4w is 2026-10-09..2026-11-05 and
 * 12w is 2026-08-14..2026-11-05, both inclusive.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { createId } from "../lib/crypto.js";
import type { Env } from "../types.js";

const THURSDAY = "2026-11-05T06:00:00.000Z";
const TZ = "Asia/Kolkata";
const GLOBAL_V1_VERSION_ID = "c1000001-0000-4000-8000-000000000011";

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
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

type Json = {
  data?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  error?: { code: string; message: string };
};

async function call(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown } = {},
) {
  const response = await app.request(
    path,
    {
      method: init.method ?? "GET",
      headers: {
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    testEnv(),
  );
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : null) as Json };
}

async function trainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: TZ }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return { Cookie: response.headers.get("set-cookie")!.split(";")[0]! };
}

async function activeClient(suffix: string) {
  const trainer = await trainerSession(`metrics-${suffix}@example.com`);
  const invite = await call("/invitations", {
    method: "POST",
    headers: { ...trainer, "Idempotency-Key": `inv-${suffix}` },
    body: { recipientEmail: `metrics-client-${suffix}@example.com` },
  });
  const traineeToken = createTestIdToken(
    `metrics-client-${suffix}`,
    `metrics-client-${suffix}@example.com`,
  );
  const trainee = { Authorization: `Bearer ${traineeToken}`, "x-fitbud-role": "trainee" };
  const accepted = await call("/invitations/accept", {
    method: "POST",
    headers: { Authorization: `Bearer ${traineeToken}` },
    body: { token: invite.body.data.token, timezone: TZ },
  });
  expect(accepted.status).toBeLessThan(300);
  return { trainer, trainee, relationshipId: accepted.body.data.relationship.id as string };
}

const KEYED_FIELDS = [
  { id: "weight", label: "Weight", type: "measurement", measurementType: "body_weight_kg", required: false, key: "weight" },
  { id: "waist", label: "Waist", type: "measurement", measurementType: "waist_cm", required: false, key: "waist" },
  { id: "arm", label: "Arm", type: "measurement", measurementType: "other", unit: "cm", required: false, key: "arm" },
  { id: "energy", label: "Energy", type: "scale_1_5", required: false, key: "energy" },
  { id: "stress", label: "Stress", type: "scale_1_5", required: false, key: "stress" },
  { id: "photo_front", label: "Front", type: "photo_intent", photoSlot: "front", required: false, key: "photo_front" },
  { id: "notes", label: "Notes", type: "long_text", required: false, key: "notes" },
  // A custom question that happens to share an id with a standard key: no `key`, never charted.
  { id: "hunger", label: "How hungry were you?", type: "scale_1_5", required: false },
];

describe("progress metrics by question key (Z6-7)", () => {
  let db: Db;
  let close: () => void;
  let queryCounter: { count: number; reset: () => void };
  let f: Awaited<ReturnType<typeof activeClient>>;
  let people: { trainerUserId: string; traineeUserId: string };
  let keyedVersionId: string;

  async function addCheckin(
    localDate: string,
    answers: Record<string, unknown>,
    options: { status?: "draft" | "submitted"; formVersionId?: string; legacy?: Record<string, unknown> } = {},
  ) {
    const id = createId();
    const now = new Date().toISOString();
    await db.insert(schema.checkins).values({
      id,
      coachingRelationshipId: f.relationshipId,
      localDate,
      windowStartsAt: `${localDate}T00:00:00.000Z`,
      windowEndsAt: `${localDate}T18:29:59.000Z`,
      recordStatus: options.status ?? "submitted",
      checkinFormVersionId: options.formVersionId ?? keyedVersionId,
      answersJson: JSON.stringify({ wellbeing: "OK", ...options.legacy, fieldAnswers: answers }),
      submittedAt: options.status === "draft" ? null : `${localDate}T03:00:00.000Z`,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  async function addMeasurement(
    type: "body_weight_kg" | "waist_cm" | "hip_cm" | "chest_cm" | "other",
    value: number,
    observedAt: string,
    unit = type === "body_weight_kg" ? "kg" : "cm",
    checkinId: string | null = null,
  ) {
    const now = new Date().toISOString();
    await db.insert(schema.measurements).values({
      id: createId(),
      coachingRelationshipId: f.relationshipId,
      traineeUserId: people.traineeUserId,
      type,
      value,
      unit,
      observedAt,
      source: checkinId ? "checkin" : "trainee_entry",
      checkinId,
      createdAt: now,
      updatedAt: now,
    });
  }

  function metrics(
    query: string,
    headers: Record<string, string> = f.trainer,
    relationshipId = f.relationshipId,
  ) {
    return call(`/progress/relationships/${relationshipId}/metrics${query}`, { headers });
  }

  const dates = (body: Json, index = 0) =>
    (body.data.series[index].points as Array<{ localDate: string }>).map((p) => p.localDate);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(THURSDAY));
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    queryCounter = handle.queryCounter;
    setTestDbOverride(db);
    f = await activeClient(createId().slice(0, 8));
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, f.relationshipId));
    people = { trainerUserId: rel!.trainerUserId, traineeUserId: rel!.traineeUserId };

    const now = new Date().toISOString();
    const templateId = createId();
    keyedVersionId = createId();
    await db.insert(schema.checkinFormTemplates).values({
      id: templateId,
      ownership: "trainer",
      trainerUserId: people.trainerUserId,
      name: "Weekly check-in with standard questions",
      description: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.checkinFormVersions).values({
      id: keyedVersionId,
      templateId,
      key: "weekly_standard",
      version: 1,
      scope: "trainer",
      trainerUserId: people.trainerUserId,
      schemaJson: JSON.stringify({ fields: KEYED_FIELDS }),
      createdAt: now,
    });
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    close();
  });

  describe("access", () => {
    it("401 without a sign-in", async () => {
      const response = await call(`/progress/relationships/${f.relationshipId}/metrics?keys=weight`);
      expect(response.status).toBe(401);
    });

    it("the owning trainer and the client themselves can read; another trainer gets 403, another client 404, an unknown id 404", async () => {
      expect((await metrics("?keys=weight")).status).toBe(200);
      expect((await metrics("?keys=weight", f.trainee)).status).toBe(200);

      const otherTrainer = await trainerSession(`metrics-other-${createId().slice(0, 6)}@example.com`);
      const denied = await metrics("?keys=weight", otherTrainer);
      expect(denied.status).toBe(403);
      expect(denied.body.error?.code).toBe("FORBIDDEN");

      const other = await activeClient(createId().slice(0, 8));
      const otherClient = await metrics("?keys=weight", other.trainee);
      expect(otherClient.status).toBe(404);
      expect(otherClient.body.error?.code).toBe("RELATIONSHIP_NOT_FOUND");

      const unknown = await metrics("?keys=weight", f.trainer, createId());
      expect(unknown.status).toBe(404);
    });

    it("an ended relationship stays readable", async () => {
      await addMeasurement("body_weight_kg", 71.2, "2026-11-02T04:00:00.000Z");
      const ended = await call(`/relationships/${f.relationshipId}/end`, {
        method: "POST",
        headers: f.trainer,
        body: {},
      });
      expect(ended.status).toBe(200);
      const response = await metrics("?keys=weight&range=4w");
      expect(response.status).toBe(200);
      expect(response.body.data.series[0].points).toHaveLength(1);
    });
  });

  describe("validation (422)", () => {
    it.each([
      ["no keys", ""],
      ["empty keys", "?keys="],
      ["unknown key", "?keys=bicep"],
      ["a photo key", "?keys=photo_front"],
      ["the notes key", "?keys=notes"],
      ["one good and one unknown key", "?keys=weight,bicep"],
      ["three keys", "?keys=weight,waist,hips"],
      ["a repeated key", "?keys=weight,weight"],
      ["an unknown range", "?keys=weight&range=1y"],
      ["custom without dates", "?keys=weight&range=custom"],
      ["custom with only from", "?keys=weight&range=custom&from=2026-10-01"],
      ["custom with from after to", "?keys=weight&range=custom&from=2026-10-20&to=2026-10-10"],
      ["a date that is not a calendar day", "?keys=weight&range=custom&from=2026-02-30&to=2026-03-05"],
      ["a date with a time", "?keys=weight&range=custom&from=2026-10-01T00:00:00Z&to=2026-10-10"],
      ["from and to with a preset range", "?keys=weight&range=4w&from=2026-10-01&to=2026-10-10"],
    ])("%s", async (_name, query) => {
      const response = await metrics(query);
      expect(response.status).toBe(422);
      expect(response.body.error?.code).toBe("INVALID_REQUEST");
      expect(response.body.error?.message).toBe("Invalid progress metrics query.");
    });

    it("an invalid query from a non-owner is still 403, not a validation hint", async () => {
      const otherTrainer = await trainerSession(`metrics-other-${createId().slice(0, 6)}@example.com`);
      expect((await metrics("?keys=bicep", otherTrainer)).status).toBe(403);
    });

    it("custom from equal to to is a one-day range", async () => {
      await addMeasurement("body_weight_kg", 70.5, "2026-10-20T04:00:00.000Z");
      await addMeasurement("body_weight_kg", 70.1, "2026-10-21T04:00:00.000Z");
      const response = await metrics("?keys=weight&range=custom&from=2026-10-20&to=2026-10-20");
      expect(response.status).toBe(200);
      expect(dates(response.body)).toEqual(["2026-10-20"]);
    });
  });

  describe("ranges", () => {
    beforeEach(async () => {
      for (const [date, value] of [
        ["2026-01-05", 80.0],
        ["2026-08-13", 78.0],
        ["2026-08-14", 77.5],
        ["2026-10-08", 75.0],
        ["2026-10-09", 74.5],
        ["2026-11-05", 73.0],
      ] as const) {
        await addMeasurement("body_weight_kg", value, `${date}T05:00:00.000Z`);
      }
      // A day after today never appears, whatever the range.
      await addMeasurement("body_weight_kg", 72.0, "2026-11-06T05:00:00.000Z");
    });

    it("4w is the 28 days ending today, inclusive", async () => {
      const response = await metrics("?keys=weight&range=4w");
      expect(response.body.data).toMatchObject({
        range: "4w",
        from: "2026-10-09",
        to: "2026-11-05",
        timezone: TZ,
      });
      expect(dates(response.body)).toEqual(["2026-10-09", "2026-11-05"]);
    });

    it("12w is the 84 days ending today, inclusive", async () => {
      const response = await metrics("?keys=weight&range=12w");
      expect(response.body.data).toMatchObject({ from: "2026-08-14", to: "2026-11-05" });
      expect(dates(response.body)).toEqual(["2026-08-14", "2026-10-08", "2026-10-09", "2026-11-05"]);
    });

    it("the default range is 12w", async () => {
      const response = await metrics("?keys=weight");
      expect(response.body.data.range).toBe("12w");
      expect(dates(response.body)).toEqual(["2026-08-14", "2026-10-08", "2026-10-09", "2026-11-05"]);
    });

    it("all returns every point, oldest first, with no resolved dates", async () => {
      const response = await metrics("?keys=weight&range=all");
      expect(response.body.data).toMatchObject({ range: "all", from: null, to: null });
      expect(dates(response.body)).toEqual([
        "2026-01-05",
        "2026-08-13",
        "2026-08-14",
        "2026-10-08",
        "2026-10-09",
        "2026-11-05",
        "2026-11-06",
      ]);
    });

    it("custom is inclusive at both ends", async () => {
      const response = await metrics("?keys=weight&range=custom&from=2026-08-14&to=2026-10-08");
      expect(response.body.data).toMatchObject({ range: "custom", from: "2026-08-14", to: "2026-10-08" });
      expect(dates(response.body)).toEqual(["2026-08-14", "2026-10-08"]);
    });

    it("an empty window is an empty series, not an error", async () => {
      const response = await metrics("?keys=weight&range=custom&from=2026-03-01&to=2026-03-31");
      expect(response.status).toBe(200);
      expect(response.body.data.series).toEqual([{ key: "weight", unit: "kg", points: [] }]);
    });

    it("check-in dates are cut by the same window", async () => {
      await addCheckin("2026-10-08", { weight: 75.2 });
      await addCheckin("2026-10-09", { weight: 74.8 });
      await addCheckin("2026-11-05", { weight: 73.4 });
      const four = await metrics("?keys=weight&range=4w");
      expect(four.body.data.series[0].points.map((p: { value: number }) => p.value)).toEqual([74.8, 73.4]);
    });
  });

  describe("local dates in the stored timezone", () => {
    it("a late-evening UTC reading belongs to the next local day", async () => {
      // 30 Oct 20:00 UTC is 31 Oct 01:30 in Asia/Kolkata.
      await addMeasurement("body_weight_kg", 72.6, "2026-10-30T20:00:00.000Z");
      const includes = await metrics("?keys=weight&range=custom&from=2026-10-31&to=2026-10-31");
      expect(includes.body.data.series[0].points).toEqual([
        { localDate: "2026-10-31", value: 72.6, checkinId: null },
      ]);
      const excludes = await metrics("?keys=weight&range=custom&from=2026-10-30&to=2026-10-30");
      expect(excludes.body.data.series[0].points).toEqual([]);
    });

    it("uses the trainee's stored timezone, not the caller's", async () => {
      await db
        .update(schema.users)
        .set({ timezone: "America/Los_Angeles" })
        .where(eq(schema.users.id, people.traineeUserId));
      // 31 Oct 03:00 UTC is 30 Oct 20:00 in Los Angeles.
      await addMeasurement("body_weight_kg", 72.6, "2026-10-31T03:00:00.000Z");
      const response = await metrics("?keys=weight&range=all");
      expect(response.body.data.timezone).toBe("America/Los_Angeles");
      expect(dates(response.body)).toEqual(["2026-10-30"]);
    });
  });

  describe("merge and keys", () => {
    it("a check-in answer wins the day it shares with a stored measurement", async () => {
      const checkinId = await addCheckin("2026-10-28", { weight: 71.5 });
      await addMeasurement("body_weight_kg", 72.0, "2026-10-28T05:00:00.000Z");
      await addMeasurement("body_weight_kg", 72.4, "2026-10-27T05:00:00.000Z");
      const response = await metrics("?keys=weight&range=4w");
      expect(response.body.data.series[0].points).toEqual([
        { localDate: "2026-10-27", value: 72.4, checkinId: null },
        { localDate: "2026-10-28", value: 71.5, checkinId },
      ]);
    });

    it("a measurement linked to a check-in carries its checkinId", async () => {
      const checkinId = await addCheckin("2026-10-21", { notes: "ok" });
      await addMeasurement("waist_cm", 84.2, "2026-10-21T05:00:00.000Z", "cm", checkinId);
      const response = await metrics("?keys=waist&range=4w");
      expect(response.body.data.series[0].points).toEqual([
        { localDate: "2026-10-21", value: 84.2, checkinId },
      ]);
    });

    it("the latest reading of a day wins among stored measurements", async () => {
      await addMeasurement("body_weight_kg", 72.0, "2026-10-28T02:00:00.000Z");
      await addMeasurement("body_weight_kg", 71.8, "2026-10-28T11:00:00.000Z");
      const response = await metrics("?keys=weight&range=4w");
      expect(response.body.data.series[0].points).toEqual([
        { localDate: "2026-10-28", value: 71.8, checkinId: null },
      ]);
    });

    it("arm comes from check-in answers by key; an unkeyed `other` measurement is never an arm", async () => {
      await addMeasurement("other", 33.3, "2026-10-14T05:00:00.000Z", "cm");
      const checkinId = await addCheckin("2026-10-21", { arm: 34.1 });
      const response = await metrics("?keys=arm&range=4w");
      expect(response.body.data.series[0]).toEqual({
        key: "arm",
        unit: "cm",
        points: [{ localDate: "2026-10-21", value: 34.1, checkinId }],
      });
    });

    it("ratings are integers; an out-of-range or fractional stored answer is dropped", async () => {
      const good = await addCheckin("2026-10-14", { energy: 4, stress: 2 });
      await addCheckin("2026-10-21", { energy: 3.5, stress: 6 });
      const lastGood = await addCheckin("2026-10-28", { energy: 5 });
      const response = await metrics("?keys=energy,stress&range=4w");
      expect(response.body.data.series).toEqual([
        {
          key: "energy",
          unit: null,
          points: [
            { localDate: "2026-10-14", value: 4, checkinId: good },
            { localDate: "2026-10-28", value: 5, checkinId: lastGood },
          ],
        },
        { key: "stress", unit: null, points: [{ localDate: "2026-10-14", value: 2, checkinId: good }] },
      ]);
      for (const series of response.body.data.series) {
        for (const point of series.points) expect(Number.isInteger(point.value)).toBe(true);
      }
    });

    it("an unkeyed custom question is never returned, even with a standard key's id", async () => {
      await addCheckin("2026-10-14", { hunger: 5, energy: 3 });
      const response = await metrics("?keys=hunger,energy&range=4w");
      expect(response.body.data.series[0]).toEqual({ key: "hunger", unit: null, points: [] });
      expect(response.body.data.series[1].points).toHaveLength(1);
    });

    it("a form version without keys (v1) falls back to stored measurements only", async () => {
      await addCheckin("2026-10-14", { body_weight: 70.1 }, { formVersionId: GLOBAL_V1_VERSION_ID, legacy: { bodyWeightKg: 70.1 } });
      await addMeasurement("body_weight_kg", 70.1, "2026-10-14T05:00:00.000Z");
      const response = await metrics("?keys=weight&range=4w");
      expect(response.body.data.series[0].points).toEqual([
        { localDate: "2026-10-14", value: 70.1, checkinId: null },
      ]);
    });

    it("draft check-ins and other clients' data are not read", async () => {
      await addCheckin("2026-10-14", { weight: 69.9 }, { status: "draft" });
      const other = await activeClient(createId().slice(0, 8));
      const [otherRel] = await db
        .select()
        .from(schema.coachingRelationships)
        .where(eq(schema.coachingRelationships.id, other.relationshipId));
      const now = new Date().toISOString();
      await db.insert(schema.measurements).values({
        id: createId(),
        coachingRelationshipId: other.relationshipId,
        traineeUserId: otherRel!.traineeUserId,
        type: "body_weight_kg",
        value: 99,
        unit: "kg",
        observedAt: "2026-10-14T05:00:00.000Z",
        source: "trainee_entry",
        createdAt: now,
        updatedAt: now,
      });
      const response = await metrics("?keys=weight&range=4w");
      expect(response.body.data.series[0].points).toEqual([]);
    });

    it("compare: two keys in one call, in the order asked, each with its own points", async () => {
      const a = await addCheckin("2026-10-14", { weight: 72.0, waist: 85.0, energy: 3 });
      const b = await addCheckin("2026-10-21", { weight: 71.6, waist: 84.4, energy: 4 });
      const forward = await metrics("?keys=weight,waist&range=4w");
      expect(forward.status).toBe(200);
      expect(forward.body.data).toEqual({
        relationshipId: f.relationshipId,
        range: "4w",
        from: "2026-10-09",
        to: "2026-11-05",
        timezone: TZ,
        series: [
          {
            key: "weight",
            unit: "kg",
            points: [
              { localDate: "2026-10-14", value: 72.0, checkinId: a },
              { localDate: "2026-10-21", value: 71.6, checkinId: b },
            ],
          },
          {
            key: "waist",
            unit: "cm",
            points: [
              { localDate: "2026-10-14", value: 85.0, checkinId: a },
              { localDate: "2026-10-21", value: 84.4, checkinId: b },
            ],
          },
        ],
      });
      const reversed = await metrics("?keys=energy,weight&range=4w");
      expect(reversed.body.data.series.map((s: { key: string }) => s.key)).toEqual(["energy", "weight"]);
    });

    it("the response carries values only: no trend, change or percentage fields", async () => {
      await addCheckin("2026-10-14", { weight: 72.0 });
      await addCheckin("2026-10-21", { weight: 71.0 });
      const response = await metrics("?keys=weight&range=4w");
      expect(Object.keys(response.body.data).sort()).toEqual(
        ["from", "range", "relationshipId", "series", "timezone", "to"],
      );
      expect(Object.keys(response.body.data.series[0]).sort()).toEqual(["key", "points", "unit"]);
      expect(Object.keys(response.body.data.series[0].points[0]).sort()).toEqual([
        "checkinId",
        "localDate",
        "value",
      ]);
    });
  });

  it("a bounded number of queries, whatever the number of points", async () => {
    const ids: string[] = [];
    for (let week = 0; week < 10; week += 1) {
      const day = String(1 + week * 3).padStart(2, "0");
      ids.push(await addCheckin(`2026-10-${day}`, { weight: 72 - week * 0.2, energy: 3, stress: 2 }));
      await addMeasurement("waist_cm", 85 - week * 0.1, `2026-10-${day}T05:00:00.000Z`);
    }
    queryCounter.reset();
    const response = await metrics("?keys=weight,energy&range=12w");
    expect(response.status).toBe(200);
    expect(response.body.data.series[0].points).toHaveLength(10);
    // Session and role resolution, the relationship, the trainee's timezone, check-ins,
    // their form versions and measurements. Nothing per point or per check-in.
    const withTen = queryCounter.count;
    expect(withTen).toBeLessThanOrEqual(12);

    for (let week = 0; week < 10; week += 1) {
      const day = String(2 + week * 3).padStart(2, "0");
      await addCheckin(`2026-10-${day}`, { weight: 70 - week * 0.2, energy: 4 });
    }
    queryCounter.reset();
    const again = await metrics("?keys=weight,energy&range=12w");
    expect(again.body.data.series[0].points).toHaveLength(20);
    expect(queryCounter.count).toBe(withTen);
  });
});
