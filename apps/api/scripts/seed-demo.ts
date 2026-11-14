#!/usr/bin/env node
/**
 * Demo world seed (T24, Z12-34). Builds the SQL and applies it to the local D1 file in one
 * transaction, wiping and reloading only the demo data (never migrations or the library).
 * Refuses when migrations are not current. Used by `pnpm db:reseed` and by db:reset.
 * Stop the local API first when you can; the write waits up to 30 s for its lock.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { localD1File } from "./lib/local-d1.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/auth/password.js";
import { DEMO_ALL_ACCOUNTS, buildDemoSeedSql } from "../src/seed/demo/build.js";
import { DEMO_PENDING_INVITE_TOKEN } from "../src/seed/demo/history.js";
import {
  loadDemoLibraryIndex,
} from "../src/seed/demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "../src/seed/demo/spec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const outFile = path.join(apiRoot, ".wrangler", "demo-seed.sql");

if (process.argv.includes("--remote")) {
  console.error("seed-demo refuses non-local runs.");
  process.exit(1);
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** Refuses unless every committed migration is applied and the library is loaded (Z12-34). */
function assertSchemaCurrent(sqlite: DatabaseSync): void {
  const onDisk = readdirSync(path.join(apiRoot, "drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let applied: Set<string>;
  try {
    applied = new Set(
      (sqlite.prepare("SELECT name FROM d1_migrations").all() as Array<{ name: string }>).map((r) => r.name),
    );
  } catch {
    fail("The local D1 has no migrations applied. Run `pnpm db:reset` (it migrates and loads the library and the demo).");
  }
  const missing = onDisk.filter((name) => !applied.has(name));
  if (missing.length > 0) {
    fail(
      `The local D1 is behind the code: ${missing.length} migration(s) not applied (${missing[0]}${missing.length > 1 ? ", ..." : ""}).\n` +
        "Run `pnpm db:reset` to rebuild it. db:reseed reloads only the demo data and never migrates.",
    );
  }
  const exercises = sqlite.prepare("SELECT count(*) AS n FROM exercise_library_items").get() as { n: number };
  const foods = sqlite.prepare("SELECT count(*) AS n FROM food_library_items").get() as { n: number };
  if (exercises.n === 0 || foods.n === 0) {
    fail("The exercise/food library is not loaded. Run `pnpm db:reset` (db:reseed never loads the library).");
  }
}

/** Apply the whole seed in one transaction on the local D1 file (no wrangler process, no per-statement round trips). */
function applySeed(sqlite: DatabaseSync, sql: string): void {
  sqlite.exec("PRAGMA busy_timeout = 30000;");
  sqlite.exec("BEGIN IMMEDIATE;");
  try {
    sqlite.exec(sql);
    sqlite.exec("COMMIT;");
  } catch (error) {
    sqlite.exec("ROLLBACK;");
    throw error;
  }
}

const referenceInstant = process.env.NOW ?? new Date().toISOString();
const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
let d1File: string;
try {
  d1File = localD1File(apiRoot);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const sqlite = new DatabaseSync(d1File);
assertSchemaCurrent(sqlite);
const libraryIndex = loadDemoLibraryIndex({
  exec: (sql: string) => {
    const rows = sqlite.prepare(sql).all();
    if (rows.length === 0) return [];
    const columns = Object.keys(rows[0] as object);
    return [{ columns, values: rows.map((r) => columns.map((c) => (r as Record<string, unknown>)[c])) }];
  },
});

const sql = buildDemoSeedSql({ referenceInstant, passwordHash, libraryIndex });
writeFileSync(outFile, sql, "utf8");
console.log(`Wrote ${outFile} (${sql.length} bytes)`);

const startedAt = Date.now();
applySeed(sqlite, sql);
sqlite.close();
console.log(`Applied the demo seed to the local D1 in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);

console.log("\nDemo accounts (@demo.fitbud.test, password FitBud-demo-2026):");
for (const account of DEMO_ALL_ACCOUNTS) {
  console.log(`  ${account.email.padEnd(36)} ${account.state}`);
}
console.log(`\nPending invite token (anita.invite@demo.fitbud.test): ${DEMO_PENDING_INVITE_TOKEN}`);
