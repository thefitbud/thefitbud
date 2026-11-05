#!/usr/bin/env node
/**
 * Writes the deterministic QA seed for one QA suite on staging (QT2, D-QA1-3, D-W5-14).
 *
 *   cd apps/api
 *   FITBUD_QA_PASSWORD=… pnpm exec tsx scripts/qa-seed.ts --suite <api|web|android|ios> [--reference-date YYYY-MM-DD]
 *   FITBUD_QA_PASSWORD=… pnpm exec tsx scripts/qa-seed.ts --update-expectations [--reference-date YYYY-MM-DD]
 *
 * `--suite` is required: each suite (the API smoke, trainer web, Android, iOS) has its
 * own personas (`src/seed/qa/accounts.ts`) and is seeded on its own, so seeding one
 * suite never changes what another suite reads (D-W5-14).
 *
 * Output (git-ignored), per suite: apps/api/.qa-seed/<suite>/qa-seed.sql and
 * apps/api/.qa-seed/<suite>/expectations.json. The same suite and reference date always
 * produce a byte-identical file.
 *
 * `--update-expectations` builds every suite and rewrites the committed
 * src/seed/qa/expectations.json, which holds all of them keyed by suite.
 *
 * Applying it is a remote command, so this script never does it. The nightly job
 * (QT7) or Firoz runs, in this order, for the same suite:
 *
 *   wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/<suite>/qa-reset.sql
 *   wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/<suite>/qa-seed.sql
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildQaSeeds,
  committedQaExpectationsFile,
  qaDefaultReferenceDate,
  qaExpectationsFile,
  stableExpectations,
  suiteExpectations,
  type QaExpectationsFile,
} from "../src/seed/qa/build.js";
import { QA_SUITES, parseQaSuiteArg, qaSuiteAccounts } from "../src/seed/qa/accounts.js";
import { qaPasswordHash } from "../src/seed/qa/password.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const committedExpectations = path.join(apiRoot, "src", "seed", "qa", "expectations.json");

if (process.argv.includes("--remote")) {
  console.error("qa-seed only writes files. Applying the SQL is a remote command (QT7 / Firoz).");
  process.exit(1);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const updateExpectations = process.argv.includes("--update-expectations");
let suite: ReturnType<typeof parseQaSuiteArg> | null = null;
if (!updateExpectations || process.argv.includes("--suite")) {
  try {
    suite = parseQaSuiteArg(process.argv);
  } catch (error) {
    console.error(
      `${(error as Error).message}. Each QA suite is seeded on its own (D-W5-14); name the one to seed.`,
    );
    process.exit(1);
  }
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
const results = await buildQaSeeds({
  suites: updateExpectations ? QA_SUITES : [suite!],
  referenceDate,
  qaPasswordHash: qaPasswordHash(password),
  forbiddenStrings: [password],
});

for (const result of Object.values(results)) {
  if (result.sql.includes(password)) {
    throw new Error("qa-seed: the generated SQL contains the QA password in plain text");
  }
}

if (updateExpectations) {
  const file = committedQaExpectationsFile(QA_SUITES.map((name) => results[name].expectations));
  writeFileSync(committedExpectations, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`Updated ${committedExpectations} (suites: ${QA_SUITES.join(", ")})`);
}

if (suite) {
  const result = results[suite];
  if (!updateExpectations) {
    const committed = suiteExpectations(
      JSON.parse(readFileSync(committedExpectations, "utf8")) as QaExpectationsFile,
      suite,
    );
    if (!committed || stableExpectations(committed) !== stableExpectations(result.expectations)) {
      console.error(
        `${committedExpectations} no longer matches the generated ${suite} world.\n` +
          "Re-run with --update-expectations and commit the result (the QA suites read it).",
      );
      process.exit(1);
    }
  }

  const outDir = path.join(apiRoot, ".qa-seed", suite);
  mkdirSync(outDir, { recursive: true });
  const seedFile = path.join(outDir, "qa-seed.sql");
  const expectationsFile = path.join(outDir, "expectations.json");
  writeFileSync(seedFile, result.sql, "utf8");
  writeFileSync(
    expectationsFile,
    `${JSON.stringify(qaExpectationsFile([result.expectations]), null, 2)}\n`,
    "utf8",
  );

  const rows = Object.values(result.expectations.rowCounts).reduce((sum, n) => sum + n, 0);
  console.log(`Wrote ${seedFile} (${result.sql.length} bytes, ${rows} rows)`);
  console.log(`Wrote ${expectationsFile}`);
  console.log(`\nQA accounts of the ${suite} suite (reference date ${referenceDate}, Asia/Kolkata):`);
  for (const account of qaSuiteAccounts(suite)) {
    const expectation = result.expectations.accounts.find((entry) => entry.key === account.key);
    console.log(
      `  ${account.email.padEnd(32)} ${account.role.padEnd(8)} ${account.displayName.padEnd(10)} ${expectation?.signIn}`,
    );
  }
  console.log(
    "\nApply on staging (remote command — QT7's nightly job or Firoz, never an implementer):\n" +
      `  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/${suite}/qa-reset.sql\n` +
      `  wrangler d1 execute fitbud-staging --env staging --remote --file apps/api/.qa-seed/${suite}/qa-seed.sql`,
  );
}
