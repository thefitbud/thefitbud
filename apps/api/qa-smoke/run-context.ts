/**
 * What `global-setup.ts` hands to every test file, and the helpers tests use to read it.
 *
 * The context holds bearer tokens, so nothing here prints it. Tokens are minted once per
 * run (not per test file) to keep the number of sign-ins, and so the rate-limit
 * pressure on staging, small.
 */
import { inject, type TestContext } from "vitest";
import type { AccountKey } from "./expectations.js";
import { SmokeHttp } from "./http.js";

export type AccountSession =
  | { status: "ok"; token: string; userId: string; via: "otp" | "password" }
  /** Not configured on this target (for example slipping on a local API). */
  | { status: "skip"; reason: string }
  /** Configured but sign-in failed. A failure, never a skip. */
  | { status: "error"; message: string };

export type RunContext = {
  baseUrl: string;
  kind: "staging" | "local";
  /** Set when the whole run cannot sign in (missing secrets, local run). */
  skipReason: string | null;
  otp: boolean;
  password: boolean;
  sessions: Record<AccountKey, AccountSession>;
};

declare module "vitest" {
  export interface ProvidedContext {
    qaSmoke: RunContext;
  }
}

export function runContext(): RunContext {
  return inject("qaSmoke");
}

export function smokeHttp(): SmokeHttp {
  const ctx = runContext();
  return new SmokeHttp({ baseUrl: ctx.baseUrl, kind: ctx.kind });
}

export type LiveSession = { token: string; userId: string; role: "trainer" | "trainee" };

/**
 * The signed-in session for an account, or skips the calling test with a reason.
 * A sign-in that was attempted and failed throws instead, so it shows up as a failure.
 */
export function sessionFor(t: TestContext, key: AccountKey): LiveSession {
  const session = runContext().sessions[key];
  if (session.status === "skip") t.skip(session.reason);
  if (session.status === "error") throw new Error(`${key}: ${session.message}`);
  if (session.status !== "ok") throw new Error("unreachable");
  return { token: session.token, userId: session.userId, role: key === "trainer" ? "trainer" : "trainee" };
}

export function requireOtp(t: TestContext): void {
  if (!runContext().otp) {
    t.skip("Test-mode OTP is staging-only and needs QA_TEST_OTP_CODE; not available on this target.");
  }
}

export function requirePassword(t: TestContext): void {
  if (!runContext().password) t.skip("FITBUD_QA_PASSWORD is not set.");
}

/**
 * Skips a test that needs no sign-in but still reaches the network (public config,
 * unauthenticated refusals). With no QA secret at all the whole suite skips cleanly
 * and sends nothing, so an offline or fork run stays quiet.
 */
export function requireConfigured(t: TestContext): void {
  const ctx = runContext();
  if (!ctx.otp && !ctx.password) {
    t.skip("No QA secret is set (QA_TEST_OTP_CODE / FITBUD_QA_PASSWORD); the suite sends nothing.");
  }
}
