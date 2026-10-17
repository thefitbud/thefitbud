import { describe, expect, it } from "vitest";
import { hashPassword } from "../../auth/password.js";
import { buildDemoSeedSql } from "./build.js";
import { DEMO_ACCOUNTS, DEMO_PASSWORD_PLAINTEXT } from "./spec.js";
import { createMemoryDb } from "../../test-support/memory-db.js";
import { demoUuid } from "./ids.js";

describe("demo seed", () => {
  it(
    "applies twice with stable counts and valid foreign keys",
    async () => {
      const passwordHash = await hashPassword(DEMO_PASSWORD_PLAINTEXT);
      const sql = buildDemoSeedSql({
        referenceInstant: new Date().toISOString(),
        passwordHash,
      });
      const first = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        first.sqlite.exec(sql);
        const fk = first.sqlite.exec("PRAGMA foreign_key_check");
        expect(fk[0]?.values ?? []).toEqual([]);
        const users1 =
          first.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        first.sqlite.exec(sql);
        const users2 =
          first.sqlite.exec("SELECT COUNT(*) FROM users")[0]?.values[0]?.[0];
        expect(users2).toBe(users1);
      } finally {
        first.close();
      }
    },
    120_000,
  );

  it("covers every declarative demo state marker", () => {
    for (const account of DEMO_ACCOUNTS) {
      expect(account.state.length).toBeGreaterThan(0);
      if (account.role === "trainee" && account.trainerEmail) {
        expect(demoUuid("user", account.email)).toMatch(
          /^[0-9a-f-]{36}$/i,
        );
      }
    }
  });
});
