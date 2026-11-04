import { TEST_OTP_IDENTIFIER_RE } from "@fitbud/core";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// D-QA1-2's allowlist lives in @fitbud/core so this suite does not import API
// source (D-W3b-9). Importing test-otp.ts would pull Workers globals into the
// trainer-web typecheck.

/** Names only. Values come from the environment and are never logged or screenshotted. */
export const ENV_OTP_CODE = "QA_TEST_OTP_CODE";
export const ENV_PASSWORD = "FITBUD_QA_PASSWORD";
export const SKIP_MESSAGE = "skipped: QA secrets not set";

const here = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(here, "../../../api");
const COMMITTED_EXPECTATIONS = path.join(API_DIR, "src/seed/qa/expectations.json");
const RUN_EXPECTATIONS = path.join(API_DIR, ".qa-seed/expectations.json");

type Env = Record<string, string | undefined>;

/** Names of the required secrets that are unset or empty. */
export function missingSecrets(env: Env = process.env): string[] {
  return [ENV_OTP_CODE, ENV_PASSWORD].filter((name) => !env[name]?.trim());
}

export function missingSecretsMessage(env: Env = process.env): string | null {
  const missing = missingSecrets(env);
  return missing.length ? `${SKIP_MESSAGE} (missing: ${missing.join(", ")})` : null;
}

export type QaAccount = {
  key: string;
  email: string;
  role: string;
  displayName: string;
  userId: string;
  relationshipId?: string;
};

export type QaExpectations = {
  referenceDate: string;
  guarantees: {
    openExceptionsSlippingMin: number;
    pendingCheckinsSlipping: number;
  };
  accounts: QaAccount[];
};

/**
 * Ids, emails and names come from the COMMITTED file (stable for every reference
 * date). Anything dated comes from this run's own copy when the nightly job left one
 * (`apps/api/.qa-seed/expectations.json`); the committed copy carries a stale
 * reference date. This suite only needs `referenceDate` from the run copy, for the log.
 */
export function loadExpectations(env: Env = process.env): QaExpectations {
  const committedPath = env.QA_EXPECTATIONS_FILE || COMMITTED_EXPECTATIONS;
  if (!existsSync(committedPath)) {
    throw new Error(
      "QA expectations file not found (apps/api/src/seed/qa/expectations.json, from QT2). " +
        "Set QA_EXPECTATIONS_FILE to point at one.",
    );
  }
  const committed = JSON.parse(readFileSync(committedPath, "utf8")) as QaExpectations;
  let referenceDate = committed.referenceDate;
  if (!env.QA_EXPECTATIONS_FILE && existsSync(RUN_EXPECTATIONS)) {
    const run = JSON.parse(readFileSync(RUN_EXPECTATIONS, "utf8")) as Partial<QaExpectations>;
    if (typeof run.referenceDate === "string") referenceDate = run.referenceDate;
  }
  return { ...committed, referenceDate };
}

export function account(expectations: QaExpectations, key: string): QaAccount {
  const found = expectations.accounts.find((a) => a.key === key);
  if (!found) throw new Error(`expectations.json has no "${key}" account`);
  return found;
}

/**
 * The trainer to sign in as. Defaults to the committed QA trainer. An override must
 * match the QA allowlist, so the suite can never write as a real-email account.
 */
export function trainerEmail(expectations: QaExpectations, env: Env = process.env): string {
  const email = (env.QA_TRAINER_EMAIL?.trim() || account(expectations, "trainer").email).toLowerCase();
  if (!TEST_OTP_IDENTIFIER_RE.test(email)) {
    throw new Error(
      "QA_TRAINER_EMAIL is outside the QA allowlist (qa+<tag>@thefitbud.com); refusing to sign in.",
    );
  }
  return email;
}
