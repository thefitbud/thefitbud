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
 * Task I2c: the locked exercise base 2026.10.21-v3 (03b_exercise_base.sql) on top of the
 * foods release, then the current demo seed (no I2e), in the `pnpm db:reset` order of
 * scripts/library-seed.ts (LOCAL_FILES).
 */
const seedDir = join(dirname(fileURLToPath(import.meta.url)), "../../seed/library");
const FROZEN_REFERENCE_INSTANT = "2026-10-17T14:30:00.000Z";
const MEDIA_KEY = /^exercises\/[a-z0-9-]+\/[0-9]+\.(jpg|jpeg|png|webp|gif|mp4)$/;

describe("exercise base 2026.10.21-v3 (03b)", () => {
  let handle: MemoryDbHandle;
  const q = (sql: string) => handle.sqlite.exec(sql)[0]?.values ?? [];
  const one = (sql: string) => Number(q(sql)[0]?.[0] ?? 0);
  let legacyCreatedAt: string;

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
      if (rel === "sql/03_exercises.sql") {
        legacyCreatedAt = String(
          q("SELECT created_at FROM exercise_library_items WHERE slug = 'bench-press-barbell'")[0]?.[0],
        );
      }
      await yieldToEventLoop();
    }
    const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
    handle.sqlite.exec(
      buildDemoSeedSql({
        referenceInstant: FROZEN_REFERENCE_INSTANT,
        passwordHash,
        libraryIndex: loadDemoLibraryIndex(handle.sqlite),
      }),
    );
    await yieldToEventLoop();
  }, 180_000);

  afterAll(() => {
    handle?.close();
  });

  it("holds 1,362 active global exercises", () => {
    expect(one("SELECT count(*) FROM exercise_library_items WHERE ownership = 'global'")).toBe(1362);
    expect(
      one("SELECT count(*) FROM exercise_library_items WHERE ownership = 'global' AND status = 'active' AND seed_version = '2026.10.21-v3'"),
    ).toBe(1362);
  });

  it("replaces the 353 exercises of 03 in place, keeping their created_at", () => {
    expect(legacyCreatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(q("SELECT name, created_at FROM exercise_library_items WHERE slug = 'bench-press-barbell'")).toEqual([
      ["Barbell Bench Press", legacyCreatedAt],
    ]);
    expect(one("SELECT count(*) FROM exercise_library_media WHERE storage_key NOT LIKE 'exercises/%'")).toBe(0);
  });

  it("has 919 media rows for 460 exercises, each with attribution and licence", () => {
    expect(one("SELECT count(*) FROM exercise_library_media")).toBe(919);
    expect(one("SELECT count(DISTINCT exercise_library_item_id) FROM exercise_library_media")).toBe(460);
    expect(
      one("SELECT count(*) FROM exercise_library_media WHERE trim(coalesce(attribution, '')) = '' OR trim(coalesce(licence, '')) = ''"),
    ).toBe(0);
    const keys = q("SELECT storage_key FROM exercise_library_media").map((r) => String(r[0]));
    expect(keys.filter((key) => !MEDIA_KEY.test(key))).toEqual([]);
  });

  it("gives every exercise a YouTube search link and at least one step", () => {
    expect(
      one("SELECT count(*) FROM exercise_library_items WHERE ownership = 'global' AND trim(coalesce(youtube_search_url, '')) = ''"),
    ).toBe(0);
    expect(
      one(
        `SELECT count(*) FROM exercise_library_items e WHERE e.ownership = 'global' AND NOT EXISTS (
           SELECT 1 FROM exercise_library_instructions i WHERE i.exercise_library_item_id = e.id AND i.kind = 'step')`,
      ),
    ).toBe(0);
    expect(one("SELECT count(*) FROM exercise_library_instructions")).toBe(14037);
  });

  it("indexes the new exercises for search", () => {
    const hits = q(
      `SELECT e.slug FROM exercise_search_fts s JOIN exercise_library_items e ON e.id = s.exercise_id
       WHERE exercise_search_fts MATCH 'farmer*'`,
    ).map((r) => String(r[0]));
    expect(hits).toContain("farmer-s-carry");
  });

  it("reports no foreign key violations with the current demo seed", () => {
    expect(one("SELECT count(*) FROM users")).toBeGreaterThan(0);
    expect(foreignKeyViolations(handle.sqlite)).toEqual([]);
  });
});
