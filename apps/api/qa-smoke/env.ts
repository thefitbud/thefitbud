/**
 * Environment contract of the staging API smoke suite (QT6).
 *
 *   STAGING_API_URL       optional, default https://api-staging.thefitbud.com (host-guarded)
 *   QA_TEST_OTP_CODE      the staging test-mode OTP (QT1); needed to sign in by code
 *   FITBUD_QA_PASSWORD    the QA password (QT2); needed for the password sign-in checks
 *   QA_SMOKE_REQUIRE_SECRETS=1, or CI=true   a missing secret fails the run instead of skipping
 *
 * Secret values are read here and never logged. Every message below names a
 * variable, never a value: this suite's output is published in the `qa-report`
 * artifact (QT8 redacts by name, but not logging a value is the first defence).
 */
import { DEFAULT_STAGING_API_URL, guardBaseUrl, type GuardedTarget } from "./host-guard.js";

export type SmokeEnv = {
  target: GuardedTarget;
  /** Present only when well formed (six digits). */
  otpCode: string | undefined;
  password: string | undefined;
  requireSecrets: boolean;
};

export class MissingSecretsError extends Error {
  constructor(readonly names: readonly string[]) {
    super(
      `Missing required QA secret${names.length === 1 ? "" : "s"}: ${names.join(", ")}. ` +
        "Set them as environment variables (GitHub environment secrets in CI).",
    );
    this.name = "MissingSecretsError";
  }
}

type Source = Readonly<Record<string, string | undefined>>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readSmokeEnv(source: Source): SmokeEnv {
  const target = guardBaseUrl(clean(source.STAGING_API_URL) ?? DEFAULT_STAGING_API_URL);
  const rawCode = clean(source.QA_TEST_OTP_CODE);
  if (rawCode !== undefined && !/^\d{6}$/.test(rawCode)) {
    throw new Error("QA_TEST_OTP_CODE must be exactly six digits.");
  }
  return {
    target,
    otpCode: rawCode,
    password: clean(source.FITBUD_QA_PASSWORD),
    requireSecrets: source.CI === "true" || source.QA_SMOKE_REQUIRE_SECRETS === "1",
  };
}

export type SignInCapabilities = {
  /**
   * Test-mode OTP exists on staging only (QT1). The runtime guard refuses a local Worker
   * that runs as staging with test auth, so a local API never offers a fixed code.
   */
  otp: boolean;
  password: boolean;
};

export function capabilities(env: SmokeEnv): SignInCapabilities {
  return {
    otp: env.otpCode !== undefined && env.target.kind === "staging",
    password: env.password !== undefined,
  };
}

/**
 * Names of the secrets this target needs and does not have. Staging needs both
 * (OTP sign-in for every account, password for the password checks). A local API
 * needs only the password, because the fixed OTP code is staging-only.
 */
export function missingSecretNames(env: SmokeEnv): string[] {
  const missing: string[] = [];
  if (env.target.kind === "staging" && env.otpCode === undefined) missing.push("QA_TEST_OTP_CODE");
  if (env.password === undefined) missing.push("FITBUD_QA_PASSWORD");
  return missing;
}

/** Throws `MissingSecretsError` only when the run must not skip (CI, or opted in). */
export function enforceSecrets(env: SmokeEnv): void {
  const missing = missingSecretNames(env);
  if (env.requireSecrets && missing.length > 0) throw new MissingSecretsError(missing);
}
