/**
 * Z14-1: count D1 round trips per request.
 *
 * D1 charges latency per round trip, not per row: a standalone statement is one
 * trip, and a `db.batch([...])` is one trip however many statements it holds.
 * This helper wraps the seeded test database so a test can measure exactly that,
 * and keeps the SQL of every statement for a readable failure message.
 *
 * Usage (see `routes/*.query-count.test.ts`):
 *
 *   const counter = installRoundTripCounter(handle);   // after createDemoSeededDb
 *   const headers = await loginHeaders(DEMO_TRAINER, "trainer");
 *   const run = await measureRequest(counter, "/clients", { headers });
 *   expect(run.roundTrips).toBeLessThanOrEqual(4);
 */
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../seed/demo/spec.js";
import type { Env } from "../types.js";
import type { MemoryDbHandle } from "./memory-db.js";

export const DEMO_TRAINER = "rahul.coach@demo.fitbud.test";
export const DEMO_TRAINEE = "aarav.ontrack@demo.fitbud.test";

export type RoundTrip = { kind: "statement" | "batch"; sql: string[] };

export type RoundTripCounter = {
  /** Every round trip since the last reset, in order. */
  trips: RoundTrip[];
  reset: () => void;
  /** The counting database; also installed as the test DB override. */
  db: Db;
};

type Stmt = {
  bind: (...values: unknown[]) => Stmt;
  all: (...args: unknown[]) => Promise<unknown>;
  first: (...args: unknown[]) => Promise<unknown>;
  run: (...args: unknown[]) => Promise<unknown>;
  raw: (...args: unknown[]) => Promise<unknown>;
};

const BATCH_MEMBER = Symbol("batchMember");

function countingStatement(inner: Stmt, sql: string, trips: RoundTrip[]): Stmt {
  const wrapped: Stmt & { [BATCH_MEMBER]?: Stmt } = {
    bind(...values: unknown[]) {
      return countingStatement(inner.bind(...values), sql, trips);
    },
    all(...args) {
      trips.push({ kind: "statement", sql: [sql] });
      return inner.all(...args);
    },
    first(...args) {
      trips.push({ kind: "statement", sql: [sql] });
      return inner.first(...args);
    },
    run(...args) {
      trips.push({ kind: "statement", sql: [sql] });
      return inner.run(...args);
    },
    raw(...args) {
      trips.push({ kind: "statement", sql: [sql] });
      return inner.raw(...args);
    },
  };
  wrapped[BATCH_MEMBER] = inner;
  (wrapped as unknown as { __sql: string }).__sql = sql;
  return wrapped;
}

/**
 * Wraps the handle's D1 client so each standalone statement and each batch is
 * one recorded round trip, and installs it as the test DB override.
 */
export function installRoundTripCounter(handle: MemoryDbHandle): RoundTripCounter {
  const d1 = (handle.db as unknown as { $client: D1Database }).$client;
  const trips: RoundTrip[] = [];
  const counted = {
    prepare(query: string) {
      return countingStatement(d1.prepare(query) as unknown as Stmt, query, trips);
    },
    async batch(statements: Stmt[]) {
      trips.push({
        kind: "batch",
        sql: statements.map((s) => (s as unknown as { __sql: string }).__sql),
      });
      const inner = statements.map(
        (s) => (s as Stmt & { [BATCH_MEMBER]?: Stmt })[BATCH_MEMBER] ?? s,
      );
      return d1.batch(inner as unknown as D1PreparedStatement[]);
    },
    exec(query: string) {
      trips.push({ kind: "statement", sql: [query] });
      return d1.exec(query);
    },
    dump() {
      return d1.dump();
    },
  } as unknown as D1Database;
  const db = drizzle(counted, { schema }) as Db;
  setTestDbOverride(db);
  return {
    trips,
    reset() {
      trips.length = 0;
    },
    db,
  };
}

export function queryCountTestEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when the test DB override is set");
      },
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

/** Bearer headers for a demo persona, signed in through the real login route. */
export async function loginHeaders(
  identifier: string,
  role: "trainer" | "trainee",
  env: Env = queryCountTestEnv(),
): Promise<Record<string, string>> {
  const login = await app.request(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password: DEMO_PASSWORD_PLAINTEXT }),
    },
    env,
  );
  expect(login.status, `login ${identifier}`).toBe(200);
  const { data } = (await login.json()) as { data: { token: string } };
  return { Authorization: `Bearer ${data.token}`, "x-fitbud-role": role };
}

export type MeasuredRequest = {
  status: number;
  headers: Headers;
  body: unknown;
  roundTrips: number;
  trips: RoundTrip[];
};

/** Runs one request and returns its D1 round trips (auth included). */
export async function measureRequest(
  counter: RoundTripCounter,
  path: string,
  init: RequestInit,
  env: Env = queryCountTestEnv(),
): Promise<MeasuredRequest> {
  counter.reset();
  const response = await app.request(path, init, env);
  const trips = [...counter.trips];
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON bodies (304, HTML) stay as text.
  }
  return { status: response.status, headers: response.headers, body, roundTrips: trips.length, trips };
}

/** A readable list of the round trips, for assertion messages. */
export function describeTrips(trips: RoundTrip[]): string {
  return trips
    .map((trip, index) =>
      trip.kind === "batch"
        ? `${index + 1}. batch(${trip.sql.length}): ${trip.sql.map((s) => s.slice(0, 80)).join(" | ")}`
        : `${index + 1}. ${trip.sql[0]?.slice(0, 160)}`,
    )
    .join("\n");
}
