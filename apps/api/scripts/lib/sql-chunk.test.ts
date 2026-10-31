import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../../src/test-support/sql-split.js";
import { chunkSqlStatements, MAX_CHUNK_BYTES } from "./sql-chunk.js";

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../seed/library/sql");
const bytes = (text: string) => Buffer.byteLength(text, "utf8");

describe("chunkSqlStatements (I2d)", () => {
  it("keeps a file under the limit as one chunk", () => {
    const sql = readFileSync(path.join(sqlDir, "01_lookups.sql"), "utf8");
    const chunks = chunkSqlStatements(sql);
    expect(chunks).toHaveLength(1);
    expect(splitSqlStatements(chunks[0]!)).toEqual(splitSqlStatements(sql));
  });

  it("splits 02_foods.sql (~23 MB) into chunks of at most 5 MB that round-trip in order", () => {
    const sql = readFileSync(path.join(sqlDir, "02_foods.sql"), "utf8");
    expect(bytes(sql)).toBeGreaterThan(MAX_CHUNK_BYTES);
    const chunks = chunkSqlStatements(sql);
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    for (const chunk of chunks) expect(bytes(chunk)).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
    expect(chunks.flatMap((chunk) => splitSqlStatements(chunk))).toEqual(splitSqlStatements(sql));
  });

  it("repeats the leading PRAGMA of 03b in every chunk and otherwise round-trips", () => {
    const sql = readFileSync(path.join(sqlDir, "03b_exercise_base.sql"), "utf8");
    const chunks = chunkSqlStatements(sql);
    expect(chunks.length).toBeGreaterThan(1);
    const [pragma, ...rest] = splitSqlStatements(sql);
    expect(pragma).toMatch(/^-- FitBud exercise base[\s\S]*\nPRAGMA defer_foreign_keys = true;$/);
    for (const chunk of chunks) {
      expect(bytes(chunk)).toBeLessThanOrEqual(MAX_CHUNK_BYTES);
      expect(splitSqlStatements(chunk)[0]).toBe(pragma);
    }
    expect(chunks.flatMap((chunk) => splitSqlStatements(chunk).slice(1))).toEqual(rest);
  });

  it("keeps a header comment cut by its ';' in the first chunk and repeats only the PRAGMA", () => {
    const sql = "-- header; still a comment\nPRAGMA defer_foreign_keys = true;\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (2);\n";
    expect(chunkSqlStatements(sql, 100)).toEqual([
      "-- header; still a comment\nPRAGMA defer_foreign_keys = true;\nINSERT INTO t VALUES (1);\n",
      "PRAGMA defer_foreign_keys = true;\nINSERT INTO t VALUES (2);\n",
    ]);
  });

  it("splits only at statement ends, never inside a quoted ';' or a multi-line value", () => {
    const statements = [
      "INSERT INTO t (a) VALUES ('one; still one');",
      "INSERT INTO t (a) VALUES ('line 1\nline 2; ''quoted''');",
      "INSERT INTO t (a) VALUES ('three');",
    ];
    const sql = `${statements.join("\n")}\n`;
    const chunks = chunkSqlStatements(sql, bytes(statements[1]!) + 1);
    expect(chunks).toEqual(statements.map((s) => `${s}\n`));
  });

  it("refuses a single statement larger than the limit", () => {
    expect(() => chunkSqlStatements("INSERT INTO t VALUES ('xxxxxxxxxx');\n", 10)).toThrow(/over the 10-byte/);
  });
});
