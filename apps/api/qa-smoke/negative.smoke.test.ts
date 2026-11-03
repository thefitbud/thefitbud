/**
 * Negative contract checks (QT6): the right refusal with the one error body shape.
 * Nothing here writes: every refused request is rejected before it touches data.
 */
import { describe, expect, it } from "vitest";
import { errorOf, newIdempotencyKey, relationshipIdOf, send, stable } from "./helpers.js";
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
