import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/d1";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../db/schema.js";
import type { Db } from "../db/client.js";
import { createD1Database } from "./d1-sqlite.js";
import { splitSqlStatements } from "./sql-split.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");
const librarySeedDir = join(dirname(fileURLToPath(import.meta.url)), "../../seed/library");

export type SqlJsCompatDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  run: (sql: string, params?: unknown[]) => void;
  close: () => void;
};

export type MemoryDbHandle = {
  db: Db;
  /** sql.js-shaped adapter for legacy tests that insert rows between migrations. */
  sqlite: SqlJsCompatDatabase;
  close: () => void;
  applyMigrationsUpTo: (inclusiveFileName: string) => void;
  applyMigrationsFrom: (inclusiveFileName: string) => void;
};

function assertFts5Available(): void {
  const probe = new DatabaseSync(":memory:");
  try {
    probe.exec("CREATE VIRTUAL TABLE fts_probe USING fts5(content)");
  } catch {
    throw new Error(
      "node:sqlite FTS5 is required for API tests (migration 0021). Use Node >= 22.23 (see .nvmrc) — /exec-daemon/node 22.14 lacks fts5.",
    );
  } finally {
    probe.close();
  }
}

function migrationFiles(): string[] {
  return readdirSync(drizzleDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function applyMigrationFile(sqlite: DatabaseSync, fileName: string): void {
  const sql = readFileSync(join(drizzleDir, fileName), "utf8");
  sqlite.exec("BEGIN");
  try {
    // Wrangler applies each migration file atomically; splitting breaks JSON/FTS literals.
    sqlite.exec(sql);
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw new Error(`Migration ${fileName} failed: ${String(error)}`, { cause: error });
  }
}

function applySeedSqlFile(sqlite: DatabaseSync, filePath: string): void {
  const sql = readFileSync(filePath, "utf8");
  sqlite.exec("BEGIN");
  try {
    if (filePath.includes("05_search.sql")) {
      sqlite.exec(sql);
    } else {
      for (const statement of splitSqlStatements(sql)) {
        sqlite.exec(statement);
      }
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw new Error(`Seed file ${filePath} failed: ${String(error)}`, { cause: error });
  }
}

function createSqlJsCompat(sqlite: DatabaseSync): SqlJsCompatDatabase {
  return {
    exec(sql: string) {
      const outputs: Array<{ columns: string[]; values: unknown[][] }> = [];
      for (const statement of splitSqlStatements(sql)) {
        const trimmed = statement.trim();
        if (!trimmed) {
          continue;
        }
        const upper = trimmed.replace(/\s+/g, " ").toUpperCase();
        if (
          upper.startsWith("INSERT") ||
          upper.startsWith("UPDATE") ||
          upper.startsWith("DELETE") ||
          upper.startsWith("CREATE") ||
          upper.startsWith("ALTER") ||
          upper.startsWith("DROP") ||
          upper.startsWith("PRAGMA")
        ) {
          sqlite.exec(trimmed);
          if (!upper.startsWith("SELECT")) {
            continue;
          }
        }
        if (upper.startsWith("SELECT") || upper.startsWith("WITH")) {
          const stmt = sqlite.prepare(trimmed);
          const rows = stmt.all() as Record<string, unknown>[];
          const columns =
            rows.length > 0 ? Object.keys(rows[0]!) : (stmt.columns?.().map((c) => c.name) ?? []);
          outputs.push({
            columns,
            values: rows.map((row) => columns.map((col) => row[col])),
          });
        } else {
          sqlite.exec(trimmed);
        }
      }
      return outputs;
    },
    run(sql: string, params: unknown[] = []) {
      const bound = params.map((value) =>
        value === undefined ? null : value,
      ) as (string | number | bigint | Uint8Array | null)[];
      sqlite.prepare(sql).run(...bound);
    },
    close() {
      sqlite.close();
    },
  };
}

function runLibrarySeed(sqlite: DatabaseSync): void {
  const ordered = [
    "00_wipe_legacy_dev.sql",
    "sql/01_lookups.sql",
    "sql/02_foods.sql",
    "sql/03_exercises.sql",
    "sql/04_templates.sql",
    "sql/05_search.sql",
    "sql/06_seed_version.sql",
    "07_post_wipe_dev.sql",
    "sql/05_search.sql",
  ];
  for (const rel of ordered) {
    const path = join(librarySeedDir, rel);
    applySeedSqlFile(sqlite, path);
  }
}

export async function createMemoryDb(options?: {
  foreignKeys?: boolean;
  librarySeed?: boolean;
  /** Apply only through this migration file name (inclusive) on first open. */
  through?: string;
}): Promise<MemoryDbHandle> {
  assertFts5Available();
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`PRAGMA foreign_keys = ${options?.foreignKeys === false ? "OFF" : "ON"}`);

  const files = migrationFiles();
  const applied = new Set<string>();

  const applyFile = (fileName: string) => {
    if (applied.has(fileName)) {
      return;
    }
    applyMigrationFile(sqlite, fileName);
    applied.add(fileName);
  };

  const through = options?.through;
  for (const file of files) {
    if (through && file.localeCompare(through, undefined, { numeric: true }) > 0) {
      break;
    }
    applyFile(file);
  }

  if (options?.librarySeed) {
    runLibrarySeed(sqlite);
  }

  const d1 = createD1Database(sqlite);
  const db = drizzle(d1, { schema }) as Db;

  const applyMigrationsUpTo = (inclusiveFileName: string) => {
    const endIdx = files.findIndex((f) => f === inclusiveFileName);
    if (endIdx < 0) {
      throw new Error(`Unknown migration file: ${inclusiveFileName}`);
    }
    for (let i = 0; i <= endIdx; i += 1) {
      applyFile(files[i]!);
    }
  };

  const applyMigrationsFrom = (inclusiveFileName: string) => {
    const startIdx = files.findIndex((f) => f === inclusiveFileName);
    if (startIdx < 0) {
      throw new Error(`Unknown migration file: ${inclusiveFileName}`);
    }
    for (let i = startIdx; i < files.length; i += 1) {
      applyFile(files[i]!);
    }
  };

  return {
    db,
    sqlite: createSqlJsCompat(sqlite),
    close: () => sqlite.close(),
    applyMigrationsUpTo,
    applyMigrationsFrom,
  };
}
