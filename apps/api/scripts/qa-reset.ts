#!/usr/bin/env node
/**
 * Writes the QA reset SQL for one QA suite on staging (QT2, D-QA1-3, D-QA1-7, D-W5-14).
 *
 *   cd apps/api
 *   pnpm exec tsx scripts/qa-reset.ts --suite <api|web|android|ios>
 *
 * Output (git-ignored): apps/api/.qa-seed/<suite>/qa-reset.sql. It deletes everything
 * that suite's QA accounts own — including what a run created on them — and nothing
 * else: no demo or real account, and no other suite's QA accounts, so one suite can be
 * reset while another runs. `apps/api/src/seed/qa/reset.ts` explains the guarantees.
 *
 * Applying it is a remote command, so this script never does it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  QA_EMAIL_PATTERN,
  parseQaSuiteArg,
  qaSuiteAccounts,
  qaUserId,
} from "../src/seed/qa/accounts.js";
import { qaScopeIdentity } from "../src/seed/qa/identity.js";
import { buildQaResetSql } from "../src/seed/qa/reset.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");

if (process.argv.includes("--remote")) {
  console.error("qa-reset only writes files. Applying the SQL is a remote command (QT7 / Firoz).");
  process.exit(1);
}

let suite: ReturnType<typeof parseQaSuiteArg>;
try {
  suite = parseQaSuiteArg(process.argv);
} catch (error) {
  console.error(
    `${(error as Error).message}. Each QA suite is reset on its own (D-W5-14); name the one to reset.`,
  );
  process.exit(1);
}

const accounts = qaSuiteAccounts(suite);
for (const account of accounts) {
  if (!QA_EMAIL_PATTERN.test(account.email)) {
    console.error(`${account.email} is outside the QA allowlist (D-QA1-2).`);
    process.exit(1);
  }
}

const sql = buildQaResetSql(qaScopeIdentity(suite), suite);

const outDir = path.join(apiRoot, ".qa-seed", suite);
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "qa-reset.sql");
writeFileSync(outFile, sql, "utf8");

console.log(`Wrote ${outFile} (${sql.length} bytes)`);
console.log(`Scoped to exactly these user ids (suite ${suite}):`);
for (const account of accounts) {
  console.log(`  ${qaUserId(account)}  ${account.email}`);
}
console.log(
  `\nApply on staging before .qa-seed/${suite}/qa-seed.sql (remote command — QT7's nightly job or Firoz):\n` +
    `  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/${suite}/qa-reset.sql`,
);
