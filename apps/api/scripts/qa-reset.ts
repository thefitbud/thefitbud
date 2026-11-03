#!/usr/bin/env node
/**
 * Writes the QA reset SQL for staging (QT2, D-QA1-3, D-QA1-7).
 *
 *   cd apps/api
 *   pnpm exec tsx scripts/qa-reset.ts
 *
 * Output (git-ignored): apps/api/.qa-seed/qa-reset.sql. It deletes everything the
 * three QA accounts own — including what the nightly run created on them — and
 * nothing else; `apps/api/src/seed/qa/reset.ts` explains the two guarantees.
 *
 * Applying it is a remote command, so this script never does it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QA_ACCOUNTS, QA_EMAIL_PATTERN, qaUserId } from "../src/seed/qa/accounts.js";
import { qaScopeIdentity } from "../src/seed/qa/identity.js";
import { buildQaResetSql } from "../src/seed/qa/reset.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outDir = path.join(apiRoot, ".qa-seed");

if (process.argv.includes("--remote")) {
  console.error("qa-reset only writes files. Applying the SQL is a remote command (QT7 / Firoz).");
  process.exit(1);
}

for (const account of QA_ACCOUNTS) {
  if (!QA_EMAIL_PATTERN.test(account.email)) {
    console.error(`${account.email} is outside the QA allowlist (D-QA1-2).`);
    process.exit(1);
  }
}

const identity = qaScopeIdentity();
const sql = buildQaResetSql(identity);

mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "qa-reset.sql");
writeFileSync(outFile, sql, "utf8");

console.log(`Wrote ${outFile} (${sql.length} bytes)`);
console.log("Scoped to exactly these user ids:");
for (const account of QA_ACCOUNTS) {
  console.log(`  ${qaUserId(account)}  ${account.email}`);
}
console.log(
  "\nApply on staging before qa-seed.sql (remote command — QT7's nightly job or Firoz):\n" +
    "  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/qa-reset.sql",
);
