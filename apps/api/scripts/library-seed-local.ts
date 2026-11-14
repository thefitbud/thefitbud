#!/usr/bin/env node
/**
 * Local-only library load for `pnpm db:reset` (Z12-34). Runs the same files, in the same order, as
 * `library-seed.ts` in local mode, but straight into the local D1 SQLite file, one transaction per
 * file, with no wrangler process. Remote/staging loading stays in library-seed.ts, unchanged.
 */
import { existsSync, readFileSync } from "node:fs";
import { localD1File } from "./lib/local-d1.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { LOCAL_FILES, hasStatements } from "./library-seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const seedDir = path.join(apiRoot, "seed", "library");
let d1File: string;
try {
  d1File = localD1File(apiRoot);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const sqlite = new DatabaseSync(d1File);
sqlite.exec("PRAGMA busy_timeout = 30000;");
console.log("Seeding FitBud library into local D1 (direct SQLite)...");
for (const rel of LOCAL_FILES) {
  const file = path.join(seedDir, rel);
  if (!existsSync(file)) throw new Error(`Missing seed file: ${file}`);
  const sql = readFileSync(file, "utf8");
  if (!hasStatements(sql)) {
    console.log(`-> ${rel} (no statements, skipped)`);
    continue;
  }
  const started = Date.now();
  sqlite.exec("BEGIN IMMEDIATE;");
  try {
    sqlite.exec(sql);
    sqlite.exec("COMMIT;");
  } catch (error) {
    sqlite.exec("ROLLBACK;");
    throw error;
  }
  console.log(`-> ${rel} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
}
sqlite.close();
console.log("Library seed complete.");
