import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  reminders: vi.fn(),
  replenishment: vi.fn(),
  coachAsk: vi.fn(),
  pushReceipts: vi.fn(),
  queueBatch: vi.fn(),
}));

vi.mock("./jobs/reminders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./jobs/reminders")>()),
  handleScheduledReminders: jobs.reminders,
  handleReminderQueueBatch: jobs.queueBatch,
}));
vi.mock("./jobs/replenishment", () => ({ handleScheduledReplenishment: jobs.replenishment }));
vi.mock("./jobs/push-receipts", () => ({ handleScheduledPushReceipts: jobs.pushReceipts }));
vi.mock("./domain/coach-asks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./domain/coach-asks")>()),
  runCoachAskMaintenance: jobs.coachAsk,
}));

import { Hono } from "hono";
import worker, { app } from "./index.js";
import { createMemoryR2Bucket } from "./lib/memory-r2.js";
import type { ActorContext, Env } from "./types.js";

const EMAIL = "priya.client@example.test";
const BEARER = "Bearer eyJhbGciOiJSUzI1NiJ9.secret-id-token";
const SECRET_MESSAGE = `boom for ${EMAIL} with ${BEARER}`;
const CLIENT_ID = "7f3c2a10-5b1e-4c3d-9a2b-1c2d3e4f5a6b";

class DomainFailure extends Error {
  readonly code = "D1_TIMEOUT";
  constructor() {
    super(SECRET_MESSAGE);
    this.name = "DomainFailure";
  }
}

const ACTOR: ActorContext = {
  userId: "0b6c1f7e-1111-4222-8333-444455556666",
  firebaseUid: "firebase-trainer",
  accountState: "active",
  timezone: "Asia/Kolkata",
  permittedRoles: ["trainer"],
  selectedRole: "trainer",
  surface: "trainer_web",
  trainerProfileId: "trainer-profile",
  traineeProfileId: null,
  authMethod: "session",
};

// Test-only routes on the real app, after every real middleware.
app.get("/__ob2/clients/:clientId/fail", () => {
  throw new DomainFailure();
});
app.get("/__ob2/clients/:clientId/fail-as-actor", (c) => {
  c.set("actor", ACTOR);
  throw new DomainFailure();
});

// Mounted like the real route modules (app.route), to check the full pattern.
const mounted = new Hono();
mounted.get("/relationships/:relationshipId/fail", () => {
  throw new DomainFailure();
});
app.route("/__ob2-mounted", mounted);

function env(environment: Env["ENVIRONMENT"]): Env {
  return {
    DB: {} as D1Database,
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    PUSH_PROVIDER_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    ENVIRONMENT: environment,
    // A correctly configured deployed Worker passes AU2's guard.
    ...(environment === "staging" || environment === "production"
      ? { AUTH_MODE: "firebase" as const, PUSH_PROVIDER_MODE: "expo" as const, EMAIL_PROVIDER: "zeptomail" as const }
      : {}),
  };
}

let lines: string[];

function logLines(): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

function expectNothingSensitive() {
  const text = lines.join("\n");
  expect(text).not.toContain(SECRET_MESSAGE);
  expect(text).not.toContain(EMAIL);
  expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
  expect(text).not.toMatch(/bearer\s/i);
  expect(text).not.toContain("secret-id-token");
  expect(text).not.toContain(CLIENT_ID);
}

beforeEach(() => {
  lines = [];
  for (const method of ["debug", "info", "warn", "error", "log"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
  }
  for (const job of Object.values(jobs)) job.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("onError (OB2)", () => {
  it("logs method, route pattern, status 500 and safe error fields, and keeps today's production 500 body", async () => {
    const response = await app.request(
      `/__ob2/clients/${CLIENT_ID}/fail?email=${encodeURIComponent(EMAIL)}`,
      { headers: { Authorization: BEARER } },
      env("production"),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string; requestId: string } };
    expect(body.error).toEqual({
      code: "INTERNAL_ERROR",
      message: "An unexpected server error occurred.",
      requestId: expect.any(String),
    });
    const [line, ...rest] = logLines().filter((l) => l.message === "Unhandled API error");
    expect(rest).toHaveLength(0);
    expect(line).toMatchObject({
      level: "error",
      requestId: body.error.requestId,
      method: "GET",
      path: "/__ob2/clients/:clientId/fail",
      status: 500,
      errorName: "DomainFailure",
      errorCode: "D1_TIMEOUT",
    });
    expect(line).not.toHaveProperty("actorUserId");
    expectNothingSensitive();
  });

  it("adds actorUserId when the actor is known; local still returns LOCAL_DEV_ERROR", async () => {
    const response = await app.request(`/__ob2/clients/${CLIENT_ID}/fail-as-actor`, {}, env("local"));
    expect(response.status).toBe(500);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("LOCAL_DEV_ERROR");
    const [line] = logLines().filter((l) => l.message === "Unhandled API error");
    expect(line).toMatchObject({
      path: "/__ob2/clients/:clientId/fail-as-actor",
      status: 500,
      actorUserId: ACTOR.userId,
    });
    expectNothingSensitive();
  });
});

it("onError logs the full pattern of a route mounted with app.route", async () => {
  const response = await app.request(`/__ob2-mounted/relationships/${CLIENT_ID}/fail`, {}, env("production"));
  expect(response.status).toBe(500);
  const [line] = logLines().filter((l) => l.message === "Unhandled API error");
  expect(line).toMatchObject({ path: "/__ob2-mounted/relationships/:relationshipId/fail", status: 500 });
  expectNothingSensitive();
});

describe("scheduled() (OB2)", () => {
  const controller = { scheduledTime: Date.parse("2026-10-31T06:00:00.000Z"), cron: "*/5 * * * *" } as ScheduledController;

  it("logs one line per job with operation and latencyMs", async () => {
    await worker.scheduled(controller, env("staging"));
    const cron = logLines().filter((l) => String(l.message).startsWith("cron."));
    expect(cron.map((l) => [l.message, l.operation])).toEqual([
      ["cron.completed", "cron.reminders"],
      ["cron.completed", "cron.replenishment"],
      ["cron.completed", "cron.coach_ask"],
      ["cron.completed", "cron.push_receipts"],
    ]);
    for (const line of cron) expect(typeof line.latencyMs).toBe("number");
  });

  it("a failing job does not stop the next ones; it is logged safely and rethrown at the end", async () => {
    const failure = new DomainFailure();
    jobs.reminders.mockRejectedValueOnce(failure);
    jobs.coachAsk.mockRejectedValueOnce(new TypeError(SECRET_MESSAGE));

    await expect(worker.scheduled(controller, env("staging"))).rejects.toBe(failure);

    expect(jobs.replenishment).toHaveBeenCalledTimes(1);
    expect(jobs.coachAsk).toHaveBeenCalledTimes(1);
    expect(jobs.pushReceipts).toHaveBeenCalledTimes(1);
    const cron = logLines().filter((l) => String(l.message).startsWith("cron."));
    expect(cron).toEqual([
      expect.objectContaining({
        level: "error",
        message: "cron.failed",
        operation: "cron.reminders",
        errorName: "DomainFailure",
        errorCode: "D1_TIMEOUT",
        latencyMs: expect.any(Number),
      }),
      expect.objectContaining({ message: "cron.completed", operation: "cron.replenishment" }),
      expect.objectContaining({ message: "cron.failed", operation: "cron.coach_ask", errorName: "TypeError" }),
      expect.objectContaining({ message: "cron.completed", operation: "cron.push_receipts" }),
    ]);
    expectNothingSensitive();
  });
});

describe("queue() (OB2)", () => {
  const batch = { messages: [{}, {}, {}] } as unknown as MessageBatch<unknown>;

  it("logs batch size, retried count and latencyMs", async () => {
    jobs.queueBatch.mockResolvedValueOnce({ acked: 2, retried: 1 });
    await worker.queue(batch, env("staging"));
    const [line] = logLines().filter((l) => l.operation === "queue.reminders");
    expect(line).toMatchObject({
      level: "warn",
      message: "queue.batch_completed",
      batchSize: 3,
      retried: 1,
      latencyMs: expect.any(Number),
    });
  });

  it("logs and rethrows when the whole batch throws", async () => {
    const failure = new DomainFailure();
    jobs.queueBatch.mockRejectedValueOnce(failure);
    await expect(worker.queue(batch, env("staging"))).rejects.toBe(failure);
    const [line] = logLines().filter((l) => l.operation === "queue.reminders");
    expect(line).toMatchObject({ level: "error", message: "queue.batch_failed", batchSize: 3, errorName: "DomainFailure" });
    expectNothingSensitive();
  });
});
