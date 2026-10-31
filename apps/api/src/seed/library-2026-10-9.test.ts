import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "./demo/build.js";
import { loadDemoLibraryIndex } from "./demo/personas.js";
import { DEMO_PASSWORD_PLAINTEXT } from "./demo/spec.js";
import { LOCAL_FILES } from "../../scripts/library-seed.js";
import { foreignKeyViolations } from "../test-support/foreign-key-check.js";
import {
  createMemoryDb,
  type MemoryDbHandle,
  yieldToEventLoop,
} from "../test-support/memory-db.js";

/**
 * Task I2b: the locked foods release 2026.10.9 as copied into seed/library, loaded in
 * the order `scripts/library-seed.ts` uses for `pnpm db:reset` (LOCAL_FILES), with the demo seed on top.
 */
const seedDir = join(dirname(fileURLToPath(import.meta.url)), "../../seed/library");
const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";


const FOOD_TYPES = ["ingredient", "dish", "beverage", "packaged_or_prepared"];
const COOKING_STATES = ["raw", "cooked", "ready_to_eat", "as_purchased"];

type Manifest = {
  seed_version: string;
  counts: { foods: number };
  files: Record<string, { sha256: string; bytes: number }>;
};

function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(seedDir, "manifest.json"), "utf8")) as Manifest;
}

/** Manifest file names are bare; the SQL files live under sql/. */
function manifestFilePath(name: string): string {
  return name.endsWith(".sql") ? join(seedDir, "sql", name) : join(seedDir, name);
}

function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .trim();
}

function scalar(handle: MemoryDbHandle, sql: string): unknown {
  return handle.sqlite.exec(sql)[0]?.values[0]?.[0];
}

describe("library seed 2026.10.9", () => {
  it("manifest is release 2026.10.9 with 1,243 foods", () => {
    const manifest = readManifest();
    expect(manifest.seed_version).toBe("2026.10.9");
    expect(manifest.counts.foods).toBe(1243);
  });

  it("every manifest file matches its sha256 and byte size", () => {
    const files = Object.entries(readManifest().files);
    expect(files.map(([name]) => name).sort()).toEqual([
      "01_lookups.sql",
      "02_foods.sql",
      "03_exercises.sql",
      "04_templates.sql",
      "05_search.sql",
      "06_seed_version.sql",
      "library-2026.10.9.json",
    ]);
    for (const [name, expected] of files) {
      const bytes = readFileSync(manifestFilePath(name));
      expect({ name, sha256: createHash("sha256").update(bytes).digest("hex") }).toEqual({
        name,
        sha256: expected.sha256,
      });
      expect(bytes.byteLength).toBe(expected.bytes);
    }
  });

  it("02b_food_extras.sql holds comments only, no SQL statements", () => {
    const sql = readFileSync(join(seedDir, "sql/02b_food_extras.sql"), "utf8");
    expect(sql.trim()).not.toBe("");
    expect(withoutComments(sql)).toBe("");
  });

  it("08_post_seed.sql exists (its corrections are covered by library-post-seed.test.ts)", () => {
    const sql = readFileSync(join(seedDir, "sql/08_post_seed.sql"), "utf8");
    expect(sql.trim()).not.toBe("");
  });

  describe("loaded into D1 with the demo seed", () => {
    let handle: MemoryDbHandle;

    beforeAll(async () => {
      handle = await createMemoryDb({ foreignKeys: true });
      for (const rel of LOCAL_FILES) {
        const sql = readFileSync(join(seedDir, rel), "utf8");
        handle.sqlite.exec("BEGIN");
        try {
          handle.sqlite.exec(sql);
          handle.sqlite.exec("COMMIT");
        } catch (error) {
          handle.sqlite.exec("ROLLBACK");
          throw new Error(`Seed file ${rel} failed: ${String(error)}`, { cause: error });
        }
        await yieldToEventLoop();
      }
      const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
      const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
      handle.sqlite.exec(
        buildDemoSeedSql({
          referenceInstant: FROZEN_REFERENCE_INSTANT,
          passwordHash,
          libraryIndex,
        }),
      );
      await yieldToEventLoop();
    }, 180_000);

    afterAll(() => {
      handle?.close();
    });

    it("has 1,243 global foods recorded as seed 2026.10.9", () => {
      expect(scalar(handle, "SELECT count(*) FROM food_library_items")).toBe(1243);
      expect(
        scalar(
          handle,
          "SELECT count(*) FROM food_library_items WHERE ownership = 'global' AND seed_version = '2026.10.9'",
        ),
      ).toBe(1243);
      expect(
        scalar(handle, "SELECT food_count FROM library_seed_versions WHERE version = '2026.10.9'"),
      ).toBe(1243);
    });

    it("gives every food exactly one default serving, the one it points at", () => {
      const offenders = handle.sqlite.exec(
        `SELECT f.slug, count(s.id) AS defaults
         FROM food_library_items f
         LEFT JOIN food_library_servings s
           ON s.food_library_item_id = f.id AND s.is_default = 1
         GROUP BY f.id
         HAVING count(s.id) <> 1`,
      )[0]?.values;
      expect(offenders ?? []).toEqual([]);
      expect(
        scalar(
          handle,
          `SELECT count(*) FROM food_library_items f
           WHERE NOT EXISTS (
             SELECT 1 FROM food_library_servings s
             WHERE s.id = f.default_serving_id AND s.food_library_item_id = f.id AND s.is_default = 1
           )`,
        ),
      ).toBe(0);
    });

    it("uses only the D6 food_type and cooking_state values", () => {
      const distinct = (column: string) =>
        (handle.sqlite.exec(`SELECT DISTINCT ${column} FROM food_library_items`)[0]?.values ?? []).map(
          (row) => row[0],
        );
      for (const value of distinct("food_type")) {
        expect(FOOD_TYPES).toContain(value);
      }
      for (const value of distinct("cooking_state")) {
        expect(COOKING_STATES).toContain(value);
      }
    });

    it("reports no foreign key violations", () => {
      expect(foreignKeyViolations(handle.sqlite)).toEqual([]);
    });
  });
});
