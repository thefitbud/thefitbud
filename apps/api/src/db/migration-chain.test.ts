import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { createMemoryDb } from "../test-support/memory-db.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

const PERF_INDEXES_SQL = `-- Performance indexes from local trace analysis (Oct 22, 2026)
CREATE INDEX IF NOT EXISTS \`notifications_relationship_created_idx\` ON \`notifications\` (\`coaching_relationship_id\`, \`created_at\`);
CREATE INDEX IF NOT EXISTS \`meal_compliance_relationship_logged_idx\` ON \`meal_compliance\` (\`coaching_relationship_id\`, \`logged_at\`);
CREATE INDEX IF NOT EXISTS \`workout_executions_relationship_completed_idx\` ON \`workout_executions\` (\`coaching_relationship_id\`, \`completed_at\`);
CREATE INDEX IF NOT EXISTS \`checkins_relationship_submitted_idx\` ON \`checkins\` (\`coaching_relationship_id\`, \`submitted_at\`);
CREATE INDEX IF NOT EXISTS \`exceptions_relationship_status_detected_idx\` ON \`exceptions\` (\`coaching_relationship_id\`, \`status\`, \`detected_at\`);
DROP INDEX IF EXISTS \`exceptions_relationship_status_idx\`;
`;

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

function migrationSqlFiles(): string[] {
  return readdirSync(drizzleDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function indexColumns(
  sqlite: { exec: (sql: string) => Array<{ values: unknown[][] }> },
  indexName: string,
): string[] {
  const rows =
    sqlite.exec(
      `SELECT name FROM pragma_index_info('${indexName}') ORDER BY seqno`,
    )[0]?.values ?? [];
  return rows.map((row) => String(row[0]));
}

describe("migration chain and seeds", () => {
  it("places 0030_perf_indexes immediately after 0029 and creates the trace indexes", async () => {
    const journal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as JournalEntry[];
    const tags = journal.map((entry) => entry.tag);
    const previous = tags.indexOf("0029_checkin_form_global_fields");
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(tags[previous + 1]).toBe("0030_perf_indexes");
    expect(tags.at(-1)).toBe("0030_perf_indexes");
    expect(journal[previous + 1]?.idx).toBe(journal[previous]!.idx + 1);
    expect(journal[previous + 1]?.idx).toBe(30);

    const files = migrationSqlFiles();
    const previousFile = files.indexOf("0029_checkin_form_global_fields.sql");
    expect(files[previousFile + 1]).toBe("0030_perf_indexes.sql");
    expect(files.at(-1)).toBe("0030_perf_indexes.sql");
    expect(readFileSync(join(drizzleDir, "0030_perf_indexes.sql"), "utf8")).toBe(
      PERF_INDEXES_SQL,
    );

    const handle = await createMemoryDb();
    try {
      expect(indexColumns(handle.sqlite, "notifications_relationship_created_idx")).toEqual([
        "coaching_relationship_id",
        "created_at",
      ]);
      expect(indexColumns(handle.sqlite, "meal_compliance_relationship_logged_idx")).toEqual([
        "coaching_relationship_id",
        "logged_at",
      ]);
      expect(
        indexColumns(handle.sqlite, "workout_executions_relationship_completed_idx"),
      ).toEqual(["coaching_relationship_id", "completed_at"]);
      expect(indexColumns(handle.sqlite, "checkins_relationship_submitted_idx")).toEqual([
        "coaching_relationship_id",
        "submitted_at",
      ]);
      expect(
        indexColumns(handle.sqlite, "exceptions_relationship_status_detected_idx"),
      ).toEqual(["coaching_relationship_id", "status", "detected_at"]);
      const dropped =
        handle.sqlite.exec(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'exceptions_relationship_status_idx'",
        )[0]?.values ?? [];
      expect(dropped).toEqual([]);
    } finally {
      handle.close();
    }
  }, 60_000);

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
        assertNoForeignKeyViolations(handle.sqlite);

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
