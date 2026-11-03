/**
 * Negative contract checks (QT6): the right refusal with the one error body shape.
 * Nothing here writes: every refused request is rejected before it touches data.
 */
import { apiErrorBodySchema } from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_KEYS,
  errorOf,
  newIdempotencyKey,
  relationshipIdOf,
  send,
  stable,
} from "./helpers.js";
import type { RawResponse } from "./http.js";
import { requireConfigured, requireOtp, sessionFor, smokeHttp } from "./run-context.js";
import { startOtp, verifyOtp } from "./signin.js";

const http = smokeHttp();
const SOME_UUID = "00000000-0000-4000-8000-000000000000";

describe("authentication", () => {
  it.for(["/me", "/clients", "/exceptions/attention", "/checkins/inbox", "/me/day/2026-01-01"])(
    "GET %s without a token is 401 UNAUTHENTICATED",
    async (path, t) => {
      requireConfigured(t);
      const response = await http.request("GET", path);
      expect(errorOf(response)).toEqual({ status: 401, code: "UNAUTHENTICATED" });
    },
  );

  it("a malformed bearer token is 401", async (t) => {
    requireConfigured(t);
    const response = await http.request("GET", "/me", { token: "not.a.token", role: "trainer" });
    expect(response.status).toBe(401);
    expect(errorOf(response).code.length).toBeGreaterThan(0);
  });
});

describe("roles and ownership", () => {
  it.for(["/clients", "/exceptions/attention", "/checkins/inbox", "/activity/feed"])(
    "a trainee calling trainer endpoint %s is 403 FORBIDDEN_ROLE",
    async (path, t) => {
      const trainee = sessionFor(t, "ontrack");
      const response = await send(http, trainee, "GET", path);
      expect(errorOf(response)).toEqual({ status: 403, code: "FORBIDDEN_ROLE" });
    },
  );

  it("a trainer calling the trainee day is 403 FORBIDDEN_ROLE", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const response = await send(http, trainer, "GET", "/me/day/2026-01-01");
    expect(errorOf(response)).toEqual({ status: 403, code: "FORBIDDEN_ROLE" });
  });

  it("a trainer cannot log a meal for a trainee", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const response = await send(http, trainer, "POST", `/meals/assignments/${SOME_UUID}/confirm`, {
      body: {},
      idempotencyKey: newIdempotencyKey(),
    });
    expect(errorOf(response)).toEqual({ status: 403, code: "FORBIDDEN_ROLE" });
  });

  it("a trainee cannot read another trainee's plans", async (t) => {
    const ontrack = sessionFor(t, "ontrack");
    const response = await send(http, ontrack, "GET", `/plans/relationships/${relationshipIdOf("slipping")}`);
    expect(response.status).toBe(404);
    expect(errorOf(response).code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("logging a meal needs an Idempotency-Key", async (t) => {
    const trainee = sessionFor(t, "ontrack");
    const response = await send(http, trainee, "POST", `/meals/assignments/${SOME_UUID}/confirm`, { body: {} });
    expect(errorOf(response)).toEqual({ status: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});

describe("one-time codes (QT1 test mode)", () => {
  it("a used code cannot be used again: 401 OTP_INVALID", async (t) => {
    requireOtp(t);
    const email = stable.accounts.slipping.email;
    const code = process.env.QA_TEST_OTP_CODE ?? "";
    await startOtp(http, email);
    await verifyOtp(http, email, code);
    const again = await http.request("POST", "/auth/otp/verify", {
      body: { identifier: email, code, purpose: "login" },
    });
    expect(errorOf(again)).toEqual({ status: 401, code: "OTP_INVALID" });
  });

  it.for(["qa-smoke-negative@example.com", "qa-smoke-negative@thefitbud.com", "qa@thefitbud.com"])(
    "the fixed code does not work for a non-QA address (%s)",
    async (identifier, t) => {
      requireOtp(t);
      // Start answers the same 202 for any address (it must not reveal which exist).
      const start = await http.request("POST", "/auth/otp/start", {
        body: { identifier, purpose: "login" },
      });
      expect(start.status).toBe(202);
      const verify = await http.request("POST", "/auth/otp/verify", {
        body: { identifier, code: process.env.QA_TEST_OTP_CODE, purpose: "login" },
      });
      expect(errorOf(verify)).toEqual({ status: 401, code: "OTP_INVALID" });
    },
  );
});

/**
 * Privilege escalation: a trainee token plus `x-fitbud-role: trainer` (CU12).
 *
 * The suite above sends each session its own role, so none of it would notice a
 * server that trusted the header. These cases send the *wrong* role deliberately. The
 * probe was proved able to fail: with `resolveSelectedRole` locally mutated to return
 * the requested role unchecked, `/clients` answered 200 with a `{ data }` roster
 * envelope and the relationship read answered 404 RELATIONSHIP_NOT_FOUND, so every
 * case here went red (that mutation was reverted and never committed).
 *
 * Every probe is a GET, so nothing writes even in that failure mode.
 *
 * Resolution checked on `main`: `apps/api/src/middleware/auth.ts` parses the header
 * into a *requested* role and `resolveSelectedRole` (`packages/core/src/roles.ts`)
 * keeps it only when it is one of the actor's persisted `permittedRoles`; otherwise
 * `selectedRole` is null and `requireRole("trainer")` refuses. The refusal happens in
 * middleware, before any handler reads a relationship, which is why an existing and a
 * made-up relationship id are refused identically (asserted below).
 */
const TRAINEE_KEYS = ["ontrack", "slipping"] as const;

/** Trainer-only routes: `roles: ["trainer"]` and `requireRole("trainer")` on `main`. */
const TRAINER_ONLY_ROUTES: ReadonlyArray<{
  label: string;
  path: (trainee: (typeof TRAINEE_KEYS)[number]) => string;
}> = [
  { label: "the clients list GET /clients", path: () => "/clients" },
  {
    label: "a relationship read GET /exceptions/relationships/:relationshipId",
    path: (trainee) => `/exceptions/relationships/${relationshipIdOf(trainee)}`,
  },
];

/** The one refusal the role gate may emit, asserted exactly rather than by pattern. */
const ROLE_REFUSAL = { status: 403, code: "FORBIDDEN_ROLE" } as const;

/**
 * Values that only a trainer-facing body would carry. A 403 whose body leaked any of
 * them would still be a leak, so the status alone is not enough.
 */
function trainerOnlyValues(): string[] {
  const values = [
    stable.accounts.trainer.userId,
    stable.accounts.trainer.firebaseUid,
    stable.accounts.trainer.displayName,
    stable.accounts.trainer.email,
  ];
  for (const key of ACCOUNT_KEYS) {
    const relationshipId = stable.accounts[key].relationshipId;
    if (relationshipId) values.push(relationshipId);
  }
  return values;
}

/**
 * Checks the refused body positively: the one error envelope, carrying the caller's
 * own role metadata and nothing else — no `data`, no client, relationship or trainer
 * field, and no sign that the trainer's records exist.
 */
function expectRoleRefusalBody(response: RawResponse): void {
  const body = apiErrorBodySchema.parse(response.json);
  expect(Object.keys(response.json as Record<string, unknown>)).toEqual(["error"]);
  expect(Object.keys(body.error).sort()).toEqual(["code", "details", "message", "requestId"]);
  // middleware/auth.ts reports what the route needs and what the caller actually has.
  expect(Object.keys(body.error.details ?? {}).sort()).toEqual([
    "permittedRoles",
    "requiredRoles",
    "selectedRole",
  ]);
  expect(body.error.details).toEqual({
    requiredRoles: ["trainer"],
    // Null, not "trainer": the requested role was discarded, not adopted.
    selectedRole: null,
    permittedRoles: ["trainee"],
  });
  const serialized = JSON.stringify(response.json);
  for (const value of trainerOnlyValues()) {
    expect(serialized, `refused body must not contain "${value}"`).not.toContain(value);
  }
}

describe("a client-sent trainer role on a trainee session", () => {
  for (const traineeKey of TRAINEE_KEYS) {
    for (const route of TRAINER_ONLY_ROUTES) {
      it(`${traineeKey} sending x-fitbud-role: trainer to ${route.label} is 403 FORBIDDEN_ROLE`, async (t) => {
        const trainee = sessionFor(t, traineeKey);
        const response = await http.request("GET", route.path(traineeKey), {
          token: trainee.token,
          // Deliberately not `trainee.role`: this is the escalation attempt.
          role: "trainer",
        });
        expect(errorOf(response)).toEqual(ROLE_REFUSAL);
        expectRoleRefusalBody(response);
      });
    }
  }

  it.for(TRAINEE_KEYS)(
    "%s is refused identically for a relationship that does not exist, so the refusal reveals no trainer records",
    async (traineeKey, t) => {
      const trainee = sessionFor(t, traineeKey);
      const own = await http.request(
        "GET",
        `/exceptions/relationships/${relationshipIdOf(traineeKey)}`,
        { token: trainee.token, role: "trainer" },
      );
      const absent = await http.request("GET", `/exceptions/relationships/${SOME_UUID}`, {
        token: trainee.token,
        role: "trainer",
      });
      expect(errorOf(own)).toEqual(ROLE_REFUSAL);
      expect(errorOf(absent)).toEqual(ROLE_REFUSAL);
      // Same refusal either way: the role gate runs before any relationship lookup.
      expect(apiErrorBodySchema.parse(absent.json).error.details).toEqual(
        apiErrorBodySchema.parse(own.json).error.details,
      );
      expectRoleRefusalBody(absent);
    },
  );
});
