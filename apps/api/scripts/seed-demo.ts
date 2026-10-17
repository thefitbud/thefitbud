#!/usr/bin/env node
/**
 * Demo world seed (T24). Writes SQL and applies to local D1.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/auth/password.js";
import { buildDemoSeedSql } from "../src/seed/demo/build.js";
import { DEMO_PENDING_INVITE_TOKEN } from "../src/seed/demo/history.js";
import {
  loadDemoLibraryIndex,
} from "../src/seed/demo/personas.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "../src/seed/demo/spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, ".wrangler", "demo-seed.sql");

if (process.argv.includes("--remote")) {
  console.error("seed-demo refuses non-local runs.");
  process.exit(1);
}

function openLocalD1(): DatabaseSync {
  const d1Dir = path.join(
    apiRoot,
    ".wrangler/state/v3/d1/miniflare-D1DatabaseObject",
  );
  const dbFile = readdirSync(d1Dir).find(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  if (!dbFile) {
    throw new Error(
      "Local D1 database not found. Run pnpm db:migrate:local && pnpm db:seed:library first.",
    );
  }
  return new DatabaseSync(path.join(d1Dir, dbFile), { readOnly: true });
}

const referenceInstant = new Date().toISOString();
const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
const sqlite = openLocalD1();
const libraryIndex = loadDemoLibraryIndex({
  exec: (sql: string) => {
    const rows = sqlite.prepare(sql).all();
    if (rows.length === 0) return [];
    const columns = Object.keys(rows[0] as object);
    return [{ columns, values: rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c])) }];
  },
});
sqlite.close();

const sql = buildDemoSeedSql({ referenceInstant, passwordHash, libraryIndex });
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
console.log(`\nPending invite token (anita.invite@demo.fitbud.test): ${DEMO_PENDING_INVITE_TOKEN}`);

process.exit(result.status ?? 1);
