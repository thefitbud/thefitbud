#!/usr/bin/env node
/**
 * Demo world seed (T24). Writes SQL and applies to local D1.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../src/auth/password.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "../src/seed/demo/spec.js";
import { buildDemoSeedSql } from "../src/seed/demo/build.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, ".wrangler", "demo-seed.sql");

if (process.argv.includes("--remote")) {
  console.error("seed-demo refuses non-local runs.");
  process.exit(1);
}

const referenceInstant = new Date().toISOString();
const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
const sql = buildDemoSeedSql({ referenceInstant, passwordHash });
writeFileSync(outFile, sql, "utf8");
console.log(`Wrote ${outFile} (${sql.length} bytes)`);

const result = spawnSync(
  "pnpm",
  [
    "exec",
    "wrangler",
    "d1",
    "execute",
    "fitbud",
    "--local",
    "--persist-to",
    ".wrangler/state",
    "--file",
    outFile,
  ],
  { cwd: apiRoot, stdio: "inherit" },
);

console.log("\nDemo accounts (@demo.fitbud.test, password FitBud-demo-2026):");
for (const account of DEMO_ACCOUNTS) {
  console.log(`  ${account.email.padEnd(36)} ${account.state}`);
}

process.exit(result.status ?? 1);
