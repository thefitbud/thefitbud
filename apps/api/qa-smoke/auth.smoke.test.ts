/**
 * Auth smoke (QT6): code and password sign-in, the web session exchange, refresh.
 * Every success body is parsed with the shared contract.
 */
import {
  authRefreshResponseSchema,
  authTokenResponseSchema,
  createWebSessionResponseSchema,
} from "@fitbud/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ACCOUNT_KEYS, dataOf, errorOf, stable } from "./helpers.js";
import { cookieHeaderFrom } from "./http.js";
import { requireOtp, requirePassword, sessionFor, smokeHttp } from "./run-context.js";
import { otpSignIn, startOtp, verifyOtp } from "./signin.js";

const http = smokeHttp();

describe("sign-in as the QA accounts", () => {
  it.for(ACCOUNT_KEYS)("%s: the run signed in and the user id is the seeded one", (key, t) => {
    // `sessionFor` skips when no secret is set for this target and fails when sign-in failed.
    const session = sessionFor(t, key);
    expect(session.userId).toBe(stable.accounts[key].userId);
  });
});

describe("code sign-in (QT1 test mode, staging only)", () => {
  it("POST /auth/otp/start answers 202 with the start contract and /verify returns a login token", async (t) => {
    requireOtp(t);
    const code = process.env.QA_TEST_OTP_CODE ?? "";
    const email = stable.accounts.slipping.email;
    const start = await http.request("POST", "/auth/otp/start", {
      body: { identifier: email, purpose: "login" },
    });
    expect(start.status).toBe(202);
    await startOtp(http, email); // parses authOtpStartResponseSchema
    const session = await verifyOtp(http, email, code); // parses authOtpVerifyResponseSchema
    expect(session.userId).toBe(stable.accounts.slipping.userId);
    expect(session.token.length).toBeGreaterThan(20);
  });

  it("POST /auth/refresh trades a refresh token for a new id token (Firebase mode)", async (t) => {
    requireOtp(t);
    const session = await otpSignIn(http, stable.accounts.ontrack.email, process.env.QA_TEST_OTP_CODE ?? "");
    if (!session.refreshToken) t.skip("This API issues test tokens, which have no refresh token.");
    const response = await http.request("POST", "/auth/refresh", {
      body: { refreshToken: session.refreshToken },
    });
    const refreshed = dataOf(response, authRefreshResponseSchema);
    expect(refreshed.tokenKind).toBe("firebase_id_token");
    expect(refreshed.expiresIn).toBeGreaterThan(0);
  });
});

describe("password sign-in", () => {
  it.for(["trainer", "ontrack"] as const)("POST /auth/login signs in %s", async (key, t) => {
    requirePassword(t);
    const response = await http.request("POST", "/auth/login", {
      body: { identifier: stable.accounts[key].email, password: process.env.FITBUD_QA_PASSWORD },
    });
    const body = dataOf(response, authTokenResponseSchema);
    expect(body.userId).toBe(stable.accounts[key].userId);
  });

  it("an OTP-only account (QA Rohan) cannot sign in with a password", async (t) => {
    requirePassword(t);
    const response = await http.request("POST", "/auth/login", {
      body: { identifier: stable.accounts.slipping.email, password: process.env.FITBUD_QA_PASSWORD },
    });
    expect(errorOf(response)).toEqual({ status: 401, code: "INVALID_CREDENTIALS" });
  });
});

describe("trainer web session", () => {
  it("POST /auth/session exchanges the trainer token and DELETE /auth/session ends it", async (t) => {
    const trainer = sessionFor(t, "trainer");
    const created = await http.request("POST", "/auth/session", {
      body: { idToken: trainer.token },
    });
    const body = dataOf(created, createWebSessionResponseSchema);
    expect(body.userId).toBe(stable.accounts.trainer.userId);
    const cookie = cookieHeaderFrom(created.headers);
    expect(cookie).not.toBe("");

    const ended = await http.request("DELETE", "/auth/session", { cookie });
    expect(dataOf(ended, z.object({ ended: z.literal(true) }))).toEqual({ ended: true });
  });
});
