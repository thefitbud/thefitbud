/**
 * The three dedicated staging QA accounts (D-QA1-3).
 *
 * They are deliberately separate from the demo personas that Firoz's real-email
 * staging accounts point at: different ids, different emails, different firebase
 * uids, no phone numbers. The QA seed never updates or deletes a row that belongs
 * to those accounts, and the QA reset only ever touches the three ids below.
 */
import { demoUuid } from "../demo/ids.js";
import { TEST_OTP_IDENTIFIER_RE } from "../../auth/test-otp.js";

/**
 * Allowlisted QA login addresses (D-QA1-2), login purpose only. The same constant
 * the staging test-mode OTP allowlists (QT1), not a second copy of the decision: an
 * account these three emails did not match would be unable to sign in unattended.
 */
export const QA_EMAIL_PATTERN = TEST_OTP_IDENTIFIER_RE;

export type QaAccountKey = "trainer" | "ontrack" | "slipping";

export type QaAccount = {
  key: QaAccountKey;
  /** QA login address; must match {@link QA_EMAIL_PATTERN}. */
  email: string;
  role: "trainer" | "trainee";
  /** Persona in the demo generator this account is rewritten from. */
  demoEmail: string;
  /** Fixed firebase uid so re-applying the seed is stable. */
  firebaseUid: string;
  /** `QA `-prefixed so a screenshot can never be confused with real data. */
  displayName: string;
  /** Demo display name replaced by {@link displayName} wherever it appears. */
  demoDisplayName: string;
  /** Password journey testable for trainer + on-track; the slipping client is OTP-only. */
  hasPassword: boolean;
};

export const QA_ACCOUNTS: readonly QaAccount[] = [
  {
    key: "trainer",
    email: "qa+trainer@thefitbud.com",
    role: "trainer",
    demoEmail: "rahul.coach@demo.fitbud.test",
    firebaseUid: "qa-seed-trainer",
    displayName: "QA Rahul",
    demoDisplayName: "Rahul Verma",
    hasPassword: true,
  },
  {
    key: "ontrack",
    email: "qa+ontrack@thefitbud.com",
    role: "trainee",
    demoEmail: "aarav.ontrack@demo.fitbud.test",
    firebaseUid: "qa-seed-ontrack",
    displayName: "QA Aarav",
    demoDisplayName: "Aarav Shah",
    hasPassword: true,
  },
  {
    key: "slipping",
    email: "qa+slipping@thefitbud.com",
    role: "trainee",
    demoEmail: "rohan.slipping@demo.fitbud.test",
    firebaseUid: "qa-seed-slipping",
    displayName: "QA Rohan",
    demoDisplayName: "Rohan Mehta",
    hasPassword: false,
  },
] as const;

/** Fixed user id for a QA account. Same shape as the demo ids, different input. */
export function qaUserId(account: QaAccount): string {
  return demoUuid("user", account.email);
}

/** The only three user ids the QA seed writes and the QA reset may delete. */
export const QA_USER_IDS: readonly string[] = QA_ACCOUNTS.map(qaUserId);

export function qaAccount(key: QaAccountKey): QaAccount {
  const found = QA_ACCOUNTS.find((account) => account.key === key);
  if (!found) {
    throw new Error(`Unknown QA account: ${key}`);
  }
  return found;
}

/** Deterministic id for a QA row rewritten from a demo row. */
export function qaRowId(demoId: string): string {
  return demoUuid("qa-row", demoId);
}
