/**
 * Vitest global setup for the staging API smoke suite (QT6).
 *
 * Runs once, in the main process, before any test file:
 *   1. reads and host-guards the environment (a bad `STAGING_API_URL` throws here, so
 *      nothing is sent anywhere),
 *   2. fails loudly, naming variables only, when a required secret is missing and the
 *      run must not skip (CI, or QA_SMOKE_REQUIRE_SECRETS=1),
 *   3. signs in as each QA account once and provides the tokens to the test files.
 *
 * The one line it prints names the target host kind and which sign-in methods are
 * available. It never prints a secret, a token or an address.
 */
import type { TestProject } from "vitest/node";
import { capabilities, enforceSecrets, missingSecretNames, readSmokeEnv, type SmokeEnv } from "./env.js";
import { ACCOUNT_KEYS, loadStable, type AccountKey, type StableAccount } from "./expectations.js";
import { SmokeHttp } from "./http.js";
import type { AccountSession, RunContext } from "./run-context.js";
import { otpSignIn, passwordSignIn } from "./signin.js";

async function signInAccount(
  http: SmokeHttp,
  env: SmokeEnv,
  account: StableAccount,
): Promise<AccountSession> {
  const caps = capabilities(env);
  try {
    if (caps.otp && env.otpCode !== undefined) {
      const session = await otpSignIn(http, account.email, env.otpCode);
      return { status: "ok", token: session.token, userId: session.userId, via: "otp" };
    }
    if (caps.password && account.signIn !== "otp_only" && env.password !== undefined) {
      const session = await passwordSignIn(http, account.email, env.password);
      return { status: "ok", token: session.token, userId: session.userId, via: "password" };
    }
  } catch (error) {
    // SignInError messages carry the step, status and code only.
    return { status: "error", message: error instanceof Error ? error.message : "Sign-in failed." };
  }
  return {
    status: "skip",
    reason:
      account.signIn === "otp_only" && !caps.otp
        ? `${account.displayName} signs in by code only, and test-mode OTP is not available on this target.`
        : "No sign-in secret is set for this target.",
  };
}

export default async function setup(project: TestProject): Promise<void> {
  const env = readSmokeEnv(process.env);
  enforceSecrets(env);
  const caps = capabilities(env);
  const missing = missingSecretNames(env);
  const http = new SmokeHttp(env.target);
  const stable = loadStable();

  const sessions = {} as Record<AccountKey, AccountSession>;
  for (const key of ACCOUNT_KEYS) {
    sessions[key] = await signInAccount(http, env, stable.accounts[key]);
  }

  const context: RunContext = {
    baseUrl: env.target.baseUrl,
    kind: env.target.kind,
    skipReason: missing.length > 0 ? `Missing secrets (skipping what needs them): ${missing.join(", ")}.` : null,
    otp: caps.otp,
    password: caps.password,
    sessions,
  };
  project.provide("qaSmoke", context);

  const signedIn = ACCOUNT_KEYS.filter((key) => sessions[key].status === "ok").length;
  console.log(
    `[qa-smoke] target=${env.target.kind} (${new URL(env.target.baseUrl).host}) ` +
      `signed in ${signedIn}/${ACCOUNT_KEYS.length} accounts; otp=${caps.otp} password=${caps.password}` +
      (context.skipReason ? `; ${context.skipReason}` : ""),
  );
}
