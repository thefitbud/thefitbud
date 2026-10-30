import { describe, expect, it } from "vitest";
import { createMemoryDb } from "./memory-db.js";
import {
  assertNoForeignKeyViolations,
  foreignKeyViolations,
} from "./foreign-key-check.js";

const ORPHAN_USER_ID = "00000000-0000-4000-8000-000000000099";

describe("foreign key check assertions", () => {
  it("passes on a database with no foreign key violations", async () => {
    const handle = await createMemoryDb({
      foreignKeys: true,
      through: "0000_identity.sql",
    });
    try {
      expect(foreignKeyViolations(handle.sqlite)).toEqual([]);
      assertNoForeignKeyViolations(handle.sqlite);
    } finally {
      handle.close();
    }
  });

  it("fails the assertion when a foreign key is deliberately broken", async () => {
    const handle = await createMemoryDb({
      foreignKeys: false,
      through: "0000_identity.sql",
    });
    try {
      handle.sqlite.exec(
        `INSERT INTO user_roles (id, user_id, role, created_at)
         VALUES (
           '11111111-1111-4111-8111-111111111111',
           '${ORPHAN_USER_ID}',
           'trainee',
           '2026-01-01T00:00:00.000Z'
         )`,
      );

      const violations = foreignKeyViolations(handle.sqlite);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.[0]).toBe("user_roles");
      expect(violations[0]?.[2]).toBe("users");

      expect(() => assertNoForeignKeyViolations(handle.sqlite)).toThrow(
        /foreign_key_check reported 1 violation/,
      );
    } finally {
      handle.close();
    }
  });
});
