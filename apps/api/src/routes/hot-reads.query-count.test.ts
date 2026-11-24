import { writeFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { formatLocalDate, addDaysToLocalDate } from "@fitbud/core";
import { schema, setTestDbOverride } from "../db/client.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  DEMO_TRAINEE,
  DEMO_TRAINER,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  measureRequest,
  type RoundTripCounter,
} from "../test-support/query-count.js";

/**
 * Z14-1: every hot read path answers in a small, fixed number of D1 round trips
 * (a standalone statement is one trip, a `db.batch` is one trip). Auth is
 * included in each count. Caps are per endpoint and written here; the
 * before/after table lives in `docs/qa/Z14-1/query-counts.md`.
 *
 * Set `Z14_1_QUERY_REPORT=<file>` to write the measured counts as JSON (used to
 * build that table on `main` and on the branch).
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const TZ = "Asia/Kolkata";

type Persona = "trainer" | "trainee";
type Endpoint = {
  name: string;
  persona: Persona;
  path: (ids: Ids) => string;
  cap: number;
};
type Ids = {
  relationshipId: string;
  exceptionId: string;
  today: string;
  tomorrow: string;
};

const ENDPOINTS: Endpoint[] = [
  // Trainer
  { name: "GET /exceptions/attention (Needs you)", persona: "trainer", cap: 12, path: () => "/exceptions/attention?groupBy=relationship&limit=50" },
  { name: "GET /clients", persona: "trainer", cap: 2, path: () => "/clients?limit=50" },
  { name: "GET /coach-asks?status=open (trainer)", persona: "trainer", cap: 2, path: () => "/coach-asks?status=open" },
  { name: "GET /checkins/inbox", persona: "trainer", cap: 2, path: () => "/checkins/inbox" },
  { name: "GET /activity/feed", persona: "trainer", cap: 2, path: () => "/activity/feed" },
  { name: "GET /workspaces/relationships/:id", persona: "trainer", cap: 3, path: (i) => `/workspaces/relationships/${i.relationshipId}` },
  { name: "GET /workspaces/relationships/:id/week", persona: "trainer", cap: 3, path: (i) => `/workspaces/relationships/${i.relationshipId}/week` },
  { name: "GET /notifications/relationships/:id/responsiveness", persona: "trainer", cap: 2, path: (i) => `/notifications/relationships/${i.relationshipId}/responsiveness?days=14` },
  { name: "GET /checkins/relationships/:id/notes", persona: "trainer", cap: 2, path: (i) => `/checkins/relationships/${i.relationshipId}/notes` },
  { name: "GET /exceptions/relationships/:id", persona: "trainer", cap: 2, path: (i) => `/exceptions/relationships/${i.relationshipId}` },
  { name: "GET /exceptions/:id", persona: "trainer", cap: 2, path: (i) => `/exceptions/${i.exceptionId}` },
  { name: "GET /workouts/relationships/:id/assignments (trainer)", persona: "trainer", cap: 2, path: (i) => `/workouts/relationships/${i.relationshipId}/assignments?fromDate=${i.today}&toDate=${i.tomorrow}` },
  { name: "GET /meals/relationships/:id/assignments (trainer)", persona: "trainer", cap: 2, path: (i) => `/meals/relationships/${i.relationshipId}/assignments?fromDate=${i.today}&toDate=${i.today}` },
  { name: "GET /checkins/relationships/:id (trainer)", persona: "trainer", cap: 2, path: (i) => `/checkins/relationships/${i.relationshipId}` },
  { name: "GET /progress/relationships/:id (trainer)", persona: "trainer", cap: 2, path: (i) => `/progress/relationships/${i.relationshipId}` },
  { name: "GET /history/relationships/:id", persona: "trainer", cap: 3, path: (i) => `/history/relationships/${i.relationshipId}` },
  // Trainee (aarav.ontrack)
  { name: "GET /me/day/:date", persona: "trainee", cap: 2, path: (i) => `/me/day/${i.today}` },
  { name: "GET /me/week", persona: "trainee", cap: 3, path: () => "/me/week" },
  { name: "GET /workouts/relationships/:id/assignments (trainee)", persona: "trainee", cap: 2, path: (i) => `/workouts/relationships/${i.relationshipId}/assignments?fromDate=${i.today}&toDate=${i.tomorrow}` },
  { name: "GET /meals/relationships/:id/assignments (trainee)", persona: "trainee", cap: 2, path: (i) => `/meals/relationships/${i.relationshipId}/assignments?fromDate=${i.today}&toDate=${i.today}` },
  { name: "GET /checkins/relationships/:id (trainee)", persona: "trainee", cap: 2, path: (i) => `/checkins/relationships/${i.relationshipId}` },
  { name: "GET /progress/relationships/:id (trainee)", persona: "trainee", cap: 2, path: (i) => `/progress/relationships/${i.relationshipId}` },
  { name: "GET /coach-asks (trainee)", persona: "trainee", cap: 2, path: () => "/coach-asks" },
  { name: "GET /notifications (inbox)", persona: "trainee", cap: 2, path: () => "/notifications" },
];

const reportFile = process.env.Z14_1_QUERY_REPORT;
const measured: Record<string, number> = {};

describe("hot read paths: D1 round trips per request (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;
  let ids: Ids;
  const headers: Partial<Record<Persona, Record<string, string>>> = {};

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
    headers.trainer = await loginHeaders(DEMO_TRAINER, "trainer");
    headers.trainee = await loginHeaders(DEMO_TRAINEE, "trainee");

    const [rel] = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships)
      .innerJoin(
        schema.userIdentities,
        eq(schema.userIdentities.userId, schema.coachingRelationships.traineeUserId),
      )
      .where(
        and(
          eq(schema.userIdentities.emailNorm, DEMO_TRAINEE),
          eq(schema.coachingRelationships.status, "active"),
        ),
      )
      .limit(1);
    if (!rel) throw new Error("demo seed has no relationship for the demo trainee");
    // Warm up once so detection has run and an exception exists to open.
    const warm = await measureRequest(
      counter,
      "/exceptions/attention?groupBy=relationship&limit=50",
      { headers: headers.trainer },
    );
    expect(warm.status).toBe(200);
    const [exception] = await handle.db
      .select({ id: schema.exceptions.id })
      .from(schema.exceptions)
      .where(eq(schema.exceptions.coachingRelationshipId, rel.id))
      .limit(1);
    const [anyException] = await handle.db
      .select({ id: schema.exceptions.id })
      .from(schema.exceptions)
      .limit(1);
    const today = formatLocalDate(new Date(NOW), TZ);
    ids = {
      relationshipId: rel.id,
      exceptionId: exception?.id ?? anyException?.id ?? "missing",
      today,
      tomorrow: addDaysToLocalDate(today, 1),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  afterAll(() => {
    if (reportFile) writeFileSync(reportFile, `${JSON.stringify(measured, null, 2)}\n`);
  });

  for (const endpoint of ENDPOINTS) {
    it(`${endpoint.name} stays within ${endpoint.cap} round trips`, async () => {
      const run = await measureRequest(counter, endpoint.path(ids), {
        headers: headers[endpoint.persona],
      });
      measured[endpoint.name] = run.roundTrips;
      expect(run.status, JSON.stringify(run.body).slice(0, 300)).toBe(200);
      if (!reportFile) {
        expect(run.roundTrips, describeTrips(run.trips)).toBeLessThanOrEqual(endpoint.cap);
      }
    });
  }
});
