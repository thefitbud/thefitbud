import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { createMemoryDb } from "../test-support/memory-db.js";

describe("migration chain and seeds", () => {
  it(
    "applies migrations, library seed, and demo seed with valid foreign keys",
    async () => {
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        const passwordHash = await hashPassword("FitBud-demo-2026");
        const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
        const demoSql = buildDemoSeedSql({
          referenceInstant: new Date().toISOString(),
          passwordHash,
          libraryIndex,
        });
        handle.sqlite.exec(demoSql);
        const fk = handle.sqlite.exec("PRAGMA foreign_key_check");
        expect(fk[0]?.values ?? []).toEqual([]);

        const foodCount =
          handle.sqlite.exec(
            "SELECT COUNT(*) FROM food_library_items WHERE ownership='global' AND status='active'",
          )[0]?.values[0]?.[0];
        expect(foodCount).toBe(693);
        const exerciseCount =
          handle.sqlite.exec(
            "SELECT COUNT(*) FROM exercise_library_items WHERE ownership='global' AND status='active'",
          )[0]?.values[0]?.[0];
        expect(exerciseCount).toBe(353);

        const roti = handle.sqlite.exec(
          "SELECT food_id FROM food_search_fts WHERE food_search_fts MATCH 'roti*' LIMIT 5",
        );
        expect((roti[0]?.values.length ?? 0) > 0).toBe(true);
        const proteinHindi = handle.sqlite.exec(
          "SELECT food_id FROM food_search_fts WHERE food_search_fts MATCH 'रोटी*' LIMIT 5",
        );
        expect((proteinHindi[0]?.values.length ?? 0) > 0).toBe(true);

        handle.sqlite.exec(demoSql);
        const foodCount2 =
          handle.sqlite.exec(
            "SELECT COUNT(*) FROM food_library_items WHERE ownership='global' AND status='active'",
          )[0]?.values[0]?.[0];
        expect(foodCount2).toBe(foodCount);
      } finally {
        handle.close();
      }
    },
    120_000,
  );
});
