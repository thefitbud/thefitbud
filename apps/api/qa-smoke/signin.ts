/**
 * Sign-in as a QA account, by the same endpoints the apps use.
 *
 *  - code:     `POST /auth/otp/start` then `POST /auth/otp/verify` (QT1 test mode, staging only)
 *  - password: `POST /auth/login`
 *
 * Responses are parsed with the shared contracts. Failures throw `SignInError`, whose
 * message holds the step, HTTP status and error code only: never the identifier, the
 * code, the password or the response body.
 */
import {
  authOtpStartResponseSchema,
  authOtpVerifyResponseSchema,
  authTokenResponseSchema,
} from "@fitbud/contracts";
import { dataOf, errorOf, type SmokeHttp } from "./http.js";

export type Session = {
  token: string;
  userId: string;
  /** Present for Firebase-issued tokens. A secret: keep it out of logs and provided context. */
  refreshToken: string | undefined;
};

export class SignInError extends Error {
  constructor(step: string, status: number, code: string | null) {
    super(`Sign-in failed at ${step}: HTTP ${status}${code ? ` (${code})` : ""}.`);
    this.name = "SignInError";
  }
}

function failure(step: string, response: { status: number; json: unknown }): SignInError {
  let code: string | null = null;
  try {
    code = errorOf({ status: response.status, headers: new Headers(), json: response.json }).code;
  } catch {
    // Not an error body; the status alone is reported.
  }
  return new SignInError(step, response.status, code);
}

export async function startOtp(http: SmokeHttp, email: string): Promise<void> {
  const response = await http.request("POST", "/auth/otp/start", {
    body: { identifier: email, purpose: "login" },
  });
  if (response.status !== 202) throw failure("otp/start", response);
  authOtpStartResponseSchema.parse((response.json as { data?: unknown }).data);
}

export async function verifyOtp(http: SmokeHttp, email: string, code: string): Promise<Session> {
  const response = await http.request("POST", "/auth/otp/verify", {
    body: { identifier: email, code, purpose: "login" },
  });
  if (response.status !== 200) throw failure("otp/verify", response);
  const data = dataOf(response, authOtpVerifyResponseSchema);
  if (data.purpose !== "login") {
    throw new SignInError("otp/verify", response.status, "UNEXPECTED_PURPOSE");
  }
  return { token: data.token, userId: data.userId, refreshToken: data.refreshToken };
}

export async function otpSignIn(http: SmokeHttp, email: string, code: string): Promise<Session> {
  await startOtp(http, email);
  return verifyOtp(http, email, code);
}

export async function passwordSignIn(
  http: SmokeHttp,
  email: string,
  password: string,
): Promise<Session> {
  const response = await http.request("POST", "/auth/login", {
    body: { identifier: email, password },
  });
  if (response.status !== 200) throw failure("login", response);
  const data = dataOf(response, authTokenResponseSchema);
  return { token: data.token, userId: data.userId, refreshToken: data.refreshToken };
}
