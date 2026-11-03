import { createHash } from "node:crypto";
import { QA_ACCOUNTS, qaUserId } from "./accounts.js";
import { demoUuid } from "../demo/ids.js";
import type { QaScopeIdentity } from "./ownership.js";

/** Same digest `auth_otps.identifier_hash` stores (sha256 hex of the normalised identifier). */
export function identifierHashSync(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** The QA world on staging: every fixed QA id and the hashes of their emails. */
export function qaScopeIdentity(): QaScopeIdentity {
  return {
    userIds: QA_ACCOUNTS.map(qaUserId),
    identifierHashes: QA_ACCOUNTS.map((account) =>
      identifierHashSync(account.email.toLowerCase()),
    ),
  };
}

/** The same personas inside the scratch demo world the seed is read from. */
export function demoScopeIdentity(): QaScopeIdentity {
  return {
    userIds: QA_ACCOUNTS.map((account) => demoUuid("user", account.demoEmail)),
    identifierHashes: QA_ACCOUNTS.map((account) =>
      identifierHashSync(account.demoEmail.toLowerCase()),
    ),
  };
}
