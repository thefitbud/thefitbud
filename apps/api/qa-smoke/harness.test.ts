/**
 * Offline tests of the suite's own plumbing (QT6): secret handling, request
 * construction, sign-in, and the expectation readers. No network, no secrets.
 */
import { describe, expect, it, vi } from "vitest";
import {
  capabilities,
  enforceSecrets,
  MissingSecretsError,
  missingSecretNames,
  readSmokeEnv,
} from "./env.js";
import { loadStable, localDateIn, parseStable, todaysExpectations } from "./expectations.js";
import { guardBaseUrl } from "./host-guard.js";
import { dataOf, errorOf, SmokeHttp } from "./http.js";
import { otpSignIn, passwordSignIn, SignInError } from "./signin.js";
import { authTokenResponseSchema } from "@fitbud/contracts";

const STAGING = guardBaseUrl("https://api-staging.thefitbud.com");
const USER_ID = "11a258c9-8d48-43c9-b179-a641329e2b3f";
// Test-only values that merely look like secrets. They are not real.
const FAKE_CODE = "246810";
const FAKE_PASSWORD = "not-a-real-password-1";

function scripted(...responses: Response[]) {
  const inner = vi.fn<typeof fetch>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next;
  });
  return { inner, http: new SmokeHttp(STAGING, inner) };
}

describe("secrets", () => {
  it("names missing secrets and never a value", () => {
    const env = readSmokeEnv({ CI: "true" });
    expect(missingSecretNames(env)).toEqual(["QA_TEST_OTP_CODE", "FITBUD_QA_PASSWORD"]);
    expect(() => enforceSecrets(env)).toThrow(MissingSecretsError);
    expect(() => enforceSecrets(env)).toThrow(/QA_TEST_OTP_CODE, FITBUD_QA_PASSWORD/);
  });

  it("skips (does not throw) a missing secret outside CI", () => {
    const env = readSmokeEnv({});
    expect(env.requireSecrets).toBe(false);
    expect(() => enforceSecrets(env)).not.toThrow();
    expect(capabilities(env)).toEqual({ otp: false, password: false });
  });

  it("can be told to fail on a missing secret locally", () => {
    expect(() => enforceSecrets(readSmokeEnv({ QA_SMOKE_REQUIRE_SECRETS: "1" }))).toThrow(
      MissingSecretsError,
    );
  });

  it("does not echo a malformed code", () => {
    expect(() => readSmokeEnv({ QA_TEST_OTP_CODE: "12ab56" })).toThrow(/six digits/);
    expect(() => readSmokeEnv({ QA_TEST_OTP_CODE: "12ab56" })).not.toThrow(/12ab56/);
  });

  it("treats the fixed OTP code as staging-only, as the API does", () => {
    const local = readSmokeEnv({
      STAGING_API_URL: "http://127.0.0.1:8787",
      QA_TEST_OTP_CODE: FAKE_CODE,
      FITBUD_QA_PASSWORD: FAKE_PASSWORD,
    });
    expect(capabilities(local)).toEqual({ otp: false, password: true });
    expect(missingSecretNames(local)).toEqual([]);
    const staging = readSmokeEnv({ QA_TEST_OTP_CODE: FAKE_CODE, FITBUD_QA_PASSWORD: FAKE_PASSWORD });
    expect(capabilities(staging)).toEqual({ otp: true, password: true });
  });
});

describe("request construction", () => {
  it("sets auth, role and idempotency headers and a JSON body", () => {
    expect(
      SmokeHttp.headers({ token: "t", role: "trainee", idempotencyKey: "k", body: {} }),
    ).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: "Bearer t",
      "x-fitbud-role": "trainee",
      "Idempotency-Key": "k",
    });
    expect(SmokeHttp.headers({})).toEqual({ Accept: "application/json" });
  });

  it("sends the OTP code only in the verify body, to the right paths", async () => {
    const { inner, http } = scripted(
      Response.json({ data: { sent: true, channels: ["email"] } }, { status: 202 }),
      Response.json({
        data: { purpose: "login", token: "tok", tokenKind: "firebase_id_token", userId: USER_ID },
      }),
    );
    const session = await otpSignIn(http, "qa+slipping@thefitbud.com", FAKE_CODE);
    expect(session.userId).toBe(USER_ID);
    const [start, verify] = inner.mock.calls;
    expect(start![0]).toBe("https://api-staging.thefitbud.com/auth/otp/start");
    expect(JSON.parse(String(start![1]?.body))).toEqual({
      identifier: "qa+slipping@thefitbud.com",
      purpose: "login",
    });
    expect(verify![0]).toBe("https://api-staging.thefitbud.com/auth/otp/verify");
    expect(JSON.parse(String(verify![1]?.body))).toEqual({
      identifier: "qa+slipping@thefitbud.com",
      code: FAKE_CODE,
      purpose: "login",
    });
  });

  it("logs in by password with the contract request shape", async () => {
    const { inner, http } = scripted(
      Response.json({ data: { token: "tok", tokenKind: "test_id_token", userId: USER_ID } }),
    );
    await passwordSignIn(http, "qa+trainer@thefitbud.com", FAKE_PASSWORD);
    expect(inner.mock.calls[0]![0]).toBe("https://api-staging.thefitbud.com/auth/login");
    expect(JSON.parse(String(inner.mock.calls[0]![1]?.body))).toEqual({
      identifier: "qa+trainer@thefitbud.com",
      password: FAKE_PASSWORD,
    });
  });
});

describe("failures never leak secrets", () => {
  it("reports step, status and code only", async () => {
    const { http } = scripted(
      Response.json(
        { error: { code: "INVALID_CREDENTIALS", message: `bad ${FAKE_PASSWORD}`, requestId: "r1" } },
        { status: 401 },
      ),
    );
    const error = await passwordSignIn(http, "qa+trainer@thefitbud.com", FAKE_PASSWORD).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(SignInError);
    const message = (error as Error).message;
    expect(message).toBe("Sign-in failed at login: HTTP 401 (INVALID_CREDENTIALS).");
    expect(message).not.toContain(FAKE_PASSWORD);
    expect(message).not.toContain("qa+trainer");
  });

  it("dataOf names the status and error code but not the message", () => {
    const response = {
      status: 403,
      headers: new Headers(),
      json: { error: { code: "FORBIDDEN_ROLE", message: "secret detail", requestId: "r" } },
    };
    expect(() => dataOf(response, authTokenResponseSchema)).toThrow(/but got 403 \(FORBIDDEN_ROLE\)/);
    expect(() => dataOf(response, authTokenResponseSchema)).not.toThrow(/secret detail/);
    expect(errorOf(response)).toEqual({ status: 403, code: "FORBIDDEN_ROLE" });
  });
});

describe("QA expectations", () => {
  it("reads the committed stable part and keeps the QT1 allowlist", () => {
    const stable = loadStable();
    expect(stable.accounts.trainer.role).toBe("trainer");
    expect(stable.accounts.ontrack.relationshipId).toBeDefined();
    expect(stable.accounts.slipping.signIn).toBe("otp_only");
    expect(stable.guarantees.mealAssignmentsTodayMin).toBeGreaterThan(0);
  });

  it("rejects an account outside the OTP allowlist", () => {
    const stable = loadStable();
    const accounts = Object.values(stable.accounts).map((a, i) =>
      i === 0 ? { ...a, email: "firoz@example.com" } : a,
    );
    expect(() => parseStable({ guarantees: stable.guarantees, accounts })).toThrow();
  });

  it("uses dated expectations only when they describe today", () => {
    const run = {
      referenceDate: "2026-11-02",
      accounts: {
        ontrack: {
          key: "ontrack" as const,
          today: {
            workoutName: null,
            mealNames: ["Breakfast"],
            loggedMealCount: 1,
            openExceptionCount: 0,
            pendingCheckinId: null,
          },
        },
      },
    };
    expect(todaysExpectations(run, "ontrack", "2026-11-02")?.workoutName).toBeNull();
    expect(todaysExpectations(run, "ontrack", "2026-11-03")).toBeNull();
    expect(todaysExpectations(null, "ontrack", "2026-11-02")).toBeNull();
  });

  it("computes the trainee's calendar date in their own time zone", () => {
    const instant = new Date("2026-11-02T20:30:00Z");
    expect(localDateIn("Asia/Kolkata", instant)).toBe("2026-11-03");
    expect(localDateIn("UTC", instant)).toBe("2026-11-02");
  });
});
