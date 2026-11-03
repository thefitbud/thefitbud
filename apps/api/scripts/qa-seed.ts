#!/usr/bin/env node
/**
 * Writes the deterministic QA seed for staging (QT2, D-QA1-3).
 *
 *   cd apps/api
 *   FITBUD_QA_PASSWORD=… pnpm exec tsx scripts/qa-seed.ts [--reference-date YYYY-MM-DD]
 *
 * Output (git-ignored): apps/api/.qa-seed/qa-seed.sql and apps/api/.qa-seed/expectations.json.
 * The same reference date always produces a byte-identical file.
 *
 * Applying it is a remote command, so this script never does it. The nightly job
 * (QT7) or Firoz runs, in this order:
 *
 *   wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/qa-reset.sql
 *   wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/qa-seed.sql
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQaSeed,
  qaDefaultReferenceDate,
  stableExpectations,
  type QaExpectations,
} from "../src/seed/qa/build.js";
import { QA_ACCOUNTS } from "../src/seed/qa/accounts.js";
import { qaPasswordHash } from "../src/seed/qa/password.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outDir = path.join(apiRoot, ".qa-seed");
const committedExpectations = path.join(apiRoot, "src", "seed", "qa", "expectations.json");

if (process.argv.includes("--remote")) {
  console.error("qa-seed only writes files. Applying the SQL is a remote command (QT7 / Firoz).");
  process.exit(1);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const password = process.env.FITBUD_QA_PASSWORD;
if (!password) {
  console.error(
    "FITBUD_QA_PASSWORD is not set. The QA seed needs it to hash the trainer and on-track passwords;\n" +
      "the plaintext is never written to the output file. It is a GitHub Actions secret (QA1 manual step 3).",
  );
  process.exit(1);
}

const referenceDate = flag("reference-date") ?? qaDefaultReferenceDate();
const result = await buildQaSeed({
  referenceDate,
  qaPasswordHash: qaPasswordHash(password),
  forbiddenStrings: [password],
});

if (result.sql.includes(password)) {
  throw new Error("qa-seed: the generated SQL contains the QA password in plain text");
}

mkdirSync(outDir, { recursive: true });
const seedFile = path.join(outDir, "qa-seed.sql");
const expectationsFile = path.join(outDir, "expectations.json");
writeFileSync(seedFile, result.sql, "utf8");
writeFileSync(expectationsFile, `${JSON.stringify(result.expectations, null, 2)}\n`, "utf8");

if (process.argv.includes("--update-expectations")) {
  writeFileSync(
    committedExpectations,
    `${JSON.stringify(result.expectations, null, 2)}\n`,
    "utf8",
  );
  console.log(`Updated ${committedExpectations}`);
} else {
  const committed = JSON.parse(readFileSync(committedExpectations, "utf8")) as QaExpectations;
  if (stableExpectations(committed) !== stableExpectations(result.expectations)) {
    console.error(
      `${committedExpectations} no longer matches the generated world.\n` +
        "Re-run with --update-expectations and commit the result (QT3, QT5 and QT6 read it).",
    );
    process.exit(1);
  }
}

const rows = Object.values(result.expectations.rowCounts).reduce((sum, n) => sum + n, 0);
console.log(`Wrote ${seedFile} (${result.sql.length} bytes, ${rows} rows)`);
console.log(`Wrote ${expectationsFile}`);
console.log(`\nQA accounts (reference date ${referenceDate}, Asia/Kolkata):`);
for (const account of QA_ACCOUNTS) {
  const expectation = result.expectations.accounts.find((entry) => entry.key === account.key);
  console.log(
    `  ${account.email.padEnd(28)} ${account.role.padEnd(8)} ${account.displayName.padEnd(10)} ${expectation?.signIn}`,
  );
}
console.log(
  "\nApply on staging (remote command — QT7's nightly job or Firoz, never an implementer):\n" +
    "  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/qa-reset.sql\n" +
    "  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/qa-seed.sql",
);
