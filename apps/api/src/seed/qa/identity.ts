import { createHash } from "node:crypto";
import { QA_DEFAULT_SUITE, qaSuiteAccounts, qaUserId, type QaSuite } from "./accounts.js";
import { demoUuid } from "../demo/ids.js";
import type { QaScopeIdentity } from "./ownership.js";

/** Same digest `auth_otps.identifier_hash` stores (sha256 hex of the normalised identifier). */
export function identifierHashSync(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * One suite's QA world on staging: its fixed QA ids and the hashes of its emails, and
 * nothing of any other suite's (D-W5-14), so a seed or reset scoped by it cannot reach
 * another suite's accounts.
 */
export function qaScopeIdentity(suite: QaSuite = QA_DEFAULT_SUITE): QaScopeIdentity {
  const accounts = qaSuiteAccounts(suite);
  return {
    userIds: accounts.map(qaUserId),
    identifierHashes: accounts.map((account) =>
      identifierHashSync(account.email.toLowerCase()),
    ),
  };
}

/** The same personas inside the scratch demo world the seed is read from. */
export function demoScopeIdentity(suite: QaSuite = QA_DEFAULT_SUITE): QaScopeIdentity {
  const accounts = qaSuiteAccounts(suite);
  return {
    userIds: accounts.map((account) => demoUuid("user", account.demoEmail)),
    identifierHashes: accounts.map((account) =>
      identifierHashSync(account.demoEmail.toLowerCase()),
    ),
  };
}
