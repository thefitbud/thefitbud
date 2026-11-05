/**
 * The dedicated staging QA accounts (D-QA1-3), one persona set per QA suite (D-W5-14).
 *
 * They are deliberately separate from the demo personas that Firoz's real-email
 * staging accounts point at: different ids, different emails, different firebase
 * uids, no phone numbers. The QA seed never updates or deletes a row that belongs
 * to those accounts, and the QA reset only ever touches the ids below.
 *
 * One persona set per suite (D-W5-14, BT8 / G13). Each QA suite signs in as its own
 * trainer and trainees and is seeded and reset on its own (`qa-seed --suite <name>`),
 * so one suite's writes can never change what another suite reads:
 *
 * - `web`, `android` and `ios` each get `qa+<suite>-<role>@thefitbud.com`. Android and
 *   iOS do NOT share: they run as separate jobs, and a shared trainee would let one
 *   platform's logs change the other's Today.
 * - `api` (the staging API smoke) keeps the original QA1 accounts unchanged
 *   (`qa+trainer@`, `qa+ontrack@`, ...), including the second trainer and their one
 *   client (CU11), which only the API smoke's ownership checks read. D-W5-14 names the
 *   three app suites; the API smoke is the fourth suite on the same staging database, so
 *   it gets its own set too, and keeping its existing addresses changes nothing for it.
 *
 * Every address stays inside D-QA1-2's `qa+<tag>@thefitbud.com` allowlist, so the API's
 * test-mode OTP needs no change. Display names are the same in every suite (`QA Rahul`,
 * `QA Aarav`, `QA Rohan`): a trainer only ever sees their own clients, and the Maestro
 * flows' default names keep matching on both platforms.
 *
 * Two trainers in the `api` suite, not one (CU11). The second trainer and their single
 * client exist so the staging smoke can prove ownership with real ids instead of a
 * nonexistent one: a trainer that reads another trainer's relationship must be refused.
 */
import { demoUuid } from "../demo/ids.js";
import { TEST_OTP_IDENTIFIER_RE } from "../../auth/test-otp.js";

/**
 * Allowlisted QA login addresses (D-QA1-2), login purpose only. The same constant
 * the staging test-mode OTP allowlists (QT1), not a second copy of the decision: an
 * account these emails did not match would be unable to sign in unattended.
 */
export const QA_EMAIL_PATTERN = TEST_OTP_IDENTIFIER_RE;

/** The QA suites, each with its own personas and its own seed (D-W5-14). */
export const QA_SUITES = ["api", "web", "android", "ios"] as const;
export type QaSuite = (typeof QA_SUITES)[number];

/**
 * The suite a library call means when it names none, so the QA1-era callers keep
 * reading the API smoke's world. The command-line scripts never default: they require
 * `--suite` ({@link parseQaSuiteArg}), so no run can seed a world by accident.
 */
export const QA_DEFAULT_SUITE: QaSuite = "api";

export type QaAccountKey =
  | "trainer"
  | "ontrack"
  | "slipping"
  /** Second trainer, with one client of their own (CU11). `api` suite only. */
  | "trainer2"
  | "client2";

export type QaAccount = {
  key: QaAccountKey;
  /** The suite this account belongs to; no account is in two suites. */
  suite: QaSuite;
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

type QaPersona = Omit<QaAccount, "suite" | "email" | "firebaseUid">;

/** What a persona is, independent of the suite that signs in as it. */
const QA_PERSONAS: readonly QaPersona[] = [
  {
    key: "trainer",
    role: "trainer",
    demoEmail: "rahul.coach@demo.fitbud.test",
    displayName: "QA Rahul",
    demoDisplayName: "Rahul Verma",
    hasPassword: true,
  },
  {
    key: "ontrack",
    role: "trainee",
    demoEmail: "aarav.ontrack@demo.fitbud.test",
    displayName: "QA Aarav",
    demoDisplayName: "Aarav Shah",
    hasPassword: true,
  },
  {
    key: "slipping",
    role: "trainee",
    demoEmail: "rohan.slipping@demo.fitbud.test",
    displayName: "QA Rohan",
    demoDisplayName: "Rohan Mehta",
    hasPassword: false,
  },
  {
    // The cross-trainer boundary: a second trainer whose client the first trainer
    // must not be able to read (and the other way round). Read from the demo
    // generator's own second trainer, so it is a real coaching world, not a stub.
    key: "trainer2",
    role: "trainer",
    demoEmail: "priya.coach@demo.fitbud.test",
    displayName: "QA Priya",
    demoDisplayName: "Priya Malhotra",
    hasPassword: true,
  },
  {
    // The second trainer's one client. A QA alias like the others (D-QA1-2) and no
    // new secret: it is seed data for the ownership checks and signs in nowhere, so
    // it stays OTP-only like the slipping client.
    key: "client2",
    role: "trainee",
    demoEmail: "lakshmi.foods@demo.fitbud.test",
    displayName: "QA Lakshmi",
    demoDisplayName: "Lakshmi Iyer",
    hasPassword: false,
  },
];

/** Which personas each suite gets. Only the API smoke reads the second trainer's world. */
const SUITE_PERSONA_KEYS: Record<QaSuite, readonly QaAccountKey[]> = {
  api: ["trainer", "ontrack", "slipping", "trainer2", "client2"],
  web: ["trainer", "ontrack", "slipping"],
  android: ["trainer", "ontrack", "slipping"],
  ios: ["trainer", "ontrack", "slipping"],
};

function suiteAccount(suite: QaSuite, persona: QaPersona): QaAccount {
  // `api` keeps the QA1 addresses and uids (see the header); every other suite is
  // `qa+<suite>-<role>@thefitbud.com` (D-W5-14).
  const tag = suite === "api" ? persona.key : `${suite}-${persona.key}`;
  return {
    ...persona,
    suite,
    email: `qa+${tag}@thefitbud.com`,
    firebaseUid: `qa-seed-${tag}`,
  };
}

/** Every suite's accounts, in persona order. */
export const QA_SUITE_ACCOUNTS: Readonly<Record<QaSuite, readonly QaAccount[]>> =
  Object.fromEntries(
    QA_SUITES.map((suite) => [
      suite,
      SUITE_PERSONA_KEYS[suite].map((key) =>
        suiteAccount(suite, QA_PERSONAS.find((persona) => persona.key === key)!),
      ),
    ]),
  ) as unknown as Record<QaSuite, readonly QaAccount[]>;

export function qaSuiteAccounts(suite: QaSuite = QA_DEFAULT_SUITE): readonly QaAccount[] {
  return QA_SUITE_ACCOUNTS[suite];
}

/**
 * The API smoke suite's accounts (the QA1 world). Kept under its old name so the
 * QA1-era code and tests that mean "the QA accounts" still read exactly that world.
 */
export const QA_ACCOUNTS: readonly QaAccount[] = QA_SUITE_ACCOUNTS[QA_DEFAULT_SUITE];

/** Fixed user id for a QA account. Same shape as the demo ids, different input. */
export function qaUserId(account: QaAccount): string {
  return demoUuid("user", account.email);
}

/** The only user ids the API suite's seed writes and its reset may delete. */
export const QA_USER_IDS: readonly string[] = QA_ACCOUNTS.map(qaUserId);

export function qaAccount(key: QaAccountKey, suite: QaSuite = QA_DEFAULT_SUITE): QaAccount {
  const found = qaSuiteAccounts(suite).find((account) => account.key === key);
  if (!found) {
    throw new Error(`Unknown QA account: ${key} in suite ${suite}`);
  }
  return found;
}

/**
 * Deterministic id for a QA row rewritten from a demo row. The `api` suite keeps the
 * QA1 ids; every other suite mixes its name in, so no two suites share a row id.
 */
export function qaRowId(demoId: string, suite: QaSuite = QA_DEFAULT_SUITE): string {
  return suite === "api" ? demoUuid("qa-row", demoId) : demoUuid("qa-row", suite, demoId);
}

export function isQaSuite(value: unknown): value is QaSuite {
  return typeof value === "string" && (QA_SUITES as readonly string[]).includes(value);
}

/**
 * The `--suite <name>` argument of `qa-seed.ts` and `qa-reset.ts`. Required: a run
 * that named no suite would otherwise fall back to one, and seeding or resetting the
 * wrong world on staging is exactly the cross-suite interference D-W5-14 removes.
 */
export function parseQaSuiteArg(argv: readonly string[]): QaSuite {
  const index = argv.indexOf("--suite");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!isQaSuite(value)) {
    throw new Error(`--suite must be one of ${QA_SUITES.join(", ")}`);
  }
  return value;
}
