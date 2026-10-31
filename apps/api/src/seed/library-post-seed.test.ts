import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createMemoryDb,
  type MemoryDbHandle,
  yieldToEventLoop,
} from "../test-support/memory-db.js";

/**
 * Task I2f: 08_post_seed.sql removes the Jain tag from dal-lentil-curry-generic (D18)
 * and changes nothing else. Files load in the `scripts/library-seed.ts` order.
 */
const seedDir = join(dirname(fileURLToPath(import.meta.url)), "../../seed/library");
const SLUG = "dal-lentil-curry-generic";

/** scripts/library-seed.ts order up to (not including) 08_post_seed.sql. */
const BEFORE_POST_SEED = [
  "00_wipe_legacy_dev.sql",
  "sql/01_lookups.sql",
  "sql/02_foods.sql",
  "sql/02b_food_extras.sql",
  "sql/03_exercises.sql",
  "sql/04_templates.sql",
  "sql/05_search.sql",
  "sql/06_seed_version.sql",
  "07_post_wipe_dev.sql",
];

function applyFile(handle: MemoryDbHandle, rel: string): void {
  const sql = readFileSync(join(seedDir, rel), "utf8");
  handle.sqlite.exec("BEGIN");
  try {
    handle.sqlite.exec(sql);
    handle.sqlite.exec("COMMIT");
  } catch (error) {
    handle.sqlite.exec("ROLLBACK");
    throw new Error(`Seed file ${rel} failed: ${String(error)}`, { cause: error });
  }
}

/** Every food row except the corrected one, as one stable string. */
function otherFoodsSnapshot(handle: MemoryDbHandle): string {
  const rows =
    handle.sqlite.exec(
      `SELECT * FROM food_library_items WHERE NOT (ownership = 'global' AND slug = '${SLUG}') ORDER BY id`,
    )[0]?.values ?? [];
  return JSON.stringify(rows);
}

function targetRow(handle: MemoryDbHandle): { tags: string[]; updatedAt: string; rest: string } {
  const result = handle.sqlite.exec(
    `SELECT * FROM food_library_items WHERE ownership = 'global' AND slug = '${SLUG}'`,
  )[0];
  expect(result?.values).toHaveLength(1);
  const columns = result!.columns;
  const row = result!.values[0]!;
  const value = (name: string) => row[columns.indexOf(name)];
  const rest = columns
    .map((name, i) => (name === "diet_tags_json" || name === "updated_at" ? null : row[i]))
    .filter((v) => v !== null);
  return {
    tags: JSON.parse(String(value("diet_tags_json"))) as string[],
    updatedAt: String(value("updated_at")),
    rest: JSON.stringify(rest),
  };
}

function count(handle: MemoryDbHandle, sql: string): number {
  return Number(handle.sqlite.exec(sql)[0]?.values[0]?.[0] ?? 0);
}

describe("08_post_seed.sql (I2f)", () => {
  let handle: MemoryDbHandle;
  let before: { foods: number; others: string; target: ReturnType<typeof targetRow> };

  beforeAll(async () => {
    handle = await createMemoryDb({ foreignKeys: true });
    for (const rel of BEFORE_POST_SEED) {
      applyFile(handle, rel);
      await yieldToEventLoop();
    }
    before = {
      foods: count(handle, "SELECT count(*) FROM food_library_items"),
      others: otherFoodsSnapshot(handle),
      target: targetRow(handle),
    };
    applyFile(handle, "sql/08_post_seed.sql");
    applyFile(handle, "sql/05_search.sql");
  }, 120_000);

  afterAll(() => {
    handle?.close();
  });

  it("starts from the release row tagged vegetarian + jain", () => {
    expect(before.target.tags).toEqual(["vegetarian", "jain"]);
  });

  it("removes the Jain tag and keeps every other tag", () => {
    expect(targetRow(handle).tags).toEqual(["vegetarian"]);
  });

  it("changes no other column of the food except updated_at", () => {
    const after = targetRow(handle);
    expect(after.rest).toBe(before.target.rest);
    expect(after.updatedAt).toBe("2026-10-31T00:00:00.000Z");
  });

  it("leaves every other food row unchanged", () => {
    expect(count(handle, "SELECT count(*) FROM food_library_items")).toBe(before.foods);
    expect(otherFoodsSnapshot(handle)).toBe(before.others);
  });

  it("drops jain from the rebuilt search tags", () => {
    const tags = String(
      handle.sqlite.exec(
        `SELECT s.tags FROM food_search_fts s JOIN food_library_items f ON f.id = s.food_id
         WHERE f.ownership = 'global' AND f.slug = '${SLUG}'`,
      )[0]?.values[0]?.[0],
    );
    expect(tags.split(/\s+/)).toContain("vegetarian");
    expect(tags.split(/\s+/)).not.toContain("jain");
  });

  it("is idempotent: a second run gives the same rows", () => {
    const once = { target: targetRow(handle), others: otherFoodsSnapshot(handle) };
    applyFile(handle, "sql/08_post_seed.sql");
    expect(targetRow(handle)).toEqual(once.target);
    expect(otherFoodsSnapshot(handle)).toBe(once.others);
  });
});
