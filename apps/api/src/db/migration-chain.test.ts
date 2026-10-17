import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { createMemoryDb } from "../test-support/memory-db.js";

describe("migration chain and seeds", () => {
  it(
    "applies migrations, library seed, and demo seed with valid foreign keys",
    async () => {
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        const passwordHash = await hashPassword("FitBud-demo-2026");
        const demoSql = buildDemoSeedSql({
          referenceInstant: new Date().toISOString(),
          passwordHash,
        });
        handle.sqlite.exec(demoSql);
        const fk = handle.sqlite.exec("PRAGMA foreign_key_check");
        expect(fk[0]?.values ?? []).toEqual([]);
      } finally {
        handle.close();
      }
    },
    120_000,
  );
});
