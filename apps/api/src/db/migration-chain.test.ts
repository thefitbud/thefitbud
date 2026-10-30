import { createHash } from "node:crypto";
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

/** sha256 of the hand-written 0031 file. Locks the migration byte-for-byte. */
const LIBRARY_SCHEMA_SQL_SHA256 =
  "e40e54da306a1a6efc2a0a49edf7f664deb5c3e9f3ea0ebb5828d60e343b065a";

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

function tableColumns(
  sqlite: { exec: (sql: string) => Array<{ values: unknown[][] }> },
  table: string,
): string[] {
  const rows =
    sqlite.exec(`SELECT name FROM pragma_table_info('${table}')`)[0]?.values ?? [];
  return rows.map((row) => String(row[0]));
}

describe("migration chain and seeds", () => {
  it("places 0030 after 0029, 0031 after 0030, and 0032 after 0031", async () => {
    const journal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as JournalEntry[];
    const tags = journal.map((entry) => entry.tag);
    const previous = tags.indexOf("0029_checkin_form_global_fields");
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(tags[previous + 1]).toBe("0030_perf_indexes");
    expect(tags[previous + 2]).toBe("0031_library_schema");
    expect(tags[previous + 3]).toBe("0032_meal_compliance_local_date");
    expect(tags.at(-1)).toBe("0032_meal_compliance_local_date");
    expect(journal[previous + 1]?.idx).toBe(journal[previous]!.idx + 1);
    expect(journal[previous + 1]?.idx).toBe(30);
    expect(journal[previous + 2]?.idx).toBe(31);
    expect(journal[previous + 3]?.idx).toBe(32);

    const files = migrationSqlFiles();
    const previousFile = files.indexOf("0029_checkin_form_global_fields.sql");
    expect(files[previousFile + 1]).toBe("0030_perf_indexes.sql");
    expect(files[previousFile + 2]).toBe("0031_library_schema.sql");
    expect(files[previousFile + 3]).toBe("0032_meal_compliance_local_date.sql");
    expect(files.at(-1)).toBe("0032_meal_compliance_local_date.sql");
    expect(readFileSync(join(drizzleDir, "0030_perf_indexes.sql"), "utf8")).toBe(
      PERF_INDEXES_SQL,
    );
    const librarySchemaSql = readFileSync(
      join(drizzleDir, "0031_library_schema.sql"),
      "utf8",
    );
    expect(createHash("sha256").update(librarySchemaSql).digest("hex")).toBe(
      LIBRARY_SCHEMA_SQL_SHA256,
    );
    expect(librarySchemaSql).toContain(
      "'cup','Cup','household',150000000,'FitBud decision: 1 cup = 150 ml'",
    );
    expect(librarySchemaSql).toContain(
      "'glass','Glass','household',250000000,'FitBud decision: 1 glass = 250 ml'",
    );
    expect(librarySchemaSql).toContain(
      "'katori','Katori','household',150000000,'FitBud decision: 1 katori = 150 g/ml'",
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
      expect(tableColumns(handle.sqlite, "meal_compliance")).toContain("local_date");
      expect(
        indexColumns(handle.sqlite, "meal_compliance_relationship_local_date_idx"),
      ).toEqual(["coaching_relationship_id", "local_date"]);
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

      const foodColumns = tableColumns(handle.sqlite, "food_library_items");
      expect(foodColumns).toEqual(
        expect.arrayContaining([
          "name_norm",
          "main_ingredients_json",
          "description_provenance_json",
          "instructions",
          "density_g_per_ml_scaled",
          "density_source",
          "density_assumed",
          "source_reason",
          "source_refs_json",
          "review_confidence_scaled",
          "low_confidence",
          "review_flags_json",
          "legacy_id",
        ]),
      );
      const servingColumns = tableColumns(handle.sqlite, "food_library_servings");
      expect(servingColumns).toEqual(
        expect.arrayContaining([
          "amount_scaled",
          "amount_unit",
          "grams_scaled",
          "descriptor",
        ]),
      );
      const exerciseColumns = tableColumns(handle.sqlite, "exercise_library_items");
      expect(exerciseColumns).toEqual(
        expect.arrayContaining([
          "name_norm",
          "name_source",
          "description",
          "description_provenance",
          "youtube_search_url",
          "steps_source",
          "steps_licence_json",
          "steps_review_required",
          "coaching_provenance",
          "needs_human_review",
          "review_flags_json",
          "origin",
        ]),
      );
      const mediaColumns = tableColumns(handle.sqlite, "exercise_library_media");
      expect(mediaColumns).toEqual(
        expect.arrayContaining([
          "source_title",
          "source_url",
          "author",
          "licence_url",
          "match_confidence",
          "modified",
        ]),
      );
      expect(tableColumns(handle.sqlite, "exercise_library_links")).toEqual([
        "id",
        "exercise_library_item_id",
        "kind",
        "url",
        "label",
        "seed_version",
      ]);
      expect(indexColumns(handle.sqlite, "food_library_name_norm_idx")).toEqual([
        "name_norm",
      ]);
      expect(indexColumns(handle.sqlite, "food_library_type_state_idx")).toEqual([
        "food_type",
        "cooking_state",
      ]);
      expect(indexColumns(handle.sqlite, "food_library_low_conf_idx")).toEqual([
        "low_confidence",
      ]);
      expect(
        indexColumns(handle.sqlite, "food_library_servings_one_default_uidx"),
      ).toEqual(["food_library_item_id"]);
      expect(indexColumns(handle.sqlite, "exercise_library_name_norm_idx")).toEqual([
        "name_norm",
      ]);
      expect(indexColumns(handle.sqlite, "exercise_library_aliases_norm_idx")).toEqual([
        "alias_norm",
      ]);
      expect(indexColumns(handle.sqlite, "exercise_library_equipment_code_idx")).toEqual(
        ["equipment_code"],
      );
      expect(
        indexColumns(handle.sqlite, "exercise_library_instructions_ex_idx"),
      ).toEqual(["exercise_library_item_id", "kind", "position"]);
      expect(indexColumns(handle.sqlite, "exercise_library_links_uidx")).toEqual([
        "exercise_library_item_id",
        "kind",
        "url",
      ]);

      const units = handle.sqlite.exec(
        "SELECT code, typical_grams_scaled FROM serving_units WHERE code IN ('cup', 'glass', 'katori') ORDER BY code",
      )[0]?.values ?? [];
      expect(units).toEqual([
        ["cup", 150_000_000],
        ["glass", 250_000_000],
        ["katori", 150_000_000],
      ]);
      const sources =
        handle.sqlite.exec(
          "SELECT id FROM library_sources WHERE id IN ('wger', 'wikimedia_commons', 'user_csv') ORDER BY id",
        )[0]?.values ?? [];
      expect(sources).toEqual([["user_csv"], ["wger"], ["wikimedia_commons"]]);
    } finally {
      handle.close();
    }
  }, 60_000);

  it("backfills meal_compliance.local_date from the assignment when 0032 applies", async () => {
    const handle = await createMemoryDb({
      foreignKeys: false,
      through: "0031_library_schema.sql",
    });
    try {
      expect(tableColumns(handle.sqlite, "meal_compliance")).not.toContain("local_date");
      const insertAssignment = (id: string, localDate: string) => {
        handle.sqlite.run(
          `INSERT INTO meal_assignments (
            id, coaching_relationship_id, plan_id, plan_version_id, meal_prescription_id,
            meal_name, meal_prescription_json, local_date, window_starts_at, window_ends_at,
            photo_required, schedule_status, created_at, updated_at
          ) VALUES (?, 'rel', 'plan', 'version', ?, 'Lunch', '{}', ?, '2026-10-01T00:00:00.000Z', '2026-10-01T12:00:00.000Z', 0, 'scheduled', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
          [id, id, localDate],
        );
      };
      const insertCompliance = (id: string, assignmentId: string) => {
        handle.sqlite.run(
          `INSERT INTO meal_compliance (
            id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id,
            outcome, record_version, logged_at, created_at, updated_at
          ) VALUES (?, ?, 'rel', 'version', 'trainee', 'confirmed', 0, '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z', '2026-10-01T08:00:00.000Z')`,
          [id, assignmentId],
        );
      };
      insertAssignment("assignment-oct", "2026-10-20");
      insertAssignment("assignment-sep", "2026-09-01");
      insertCompliance("compliance-oct", "assignment-oct");
      insertCompliance("compliance-sep", "assignment-sep");
      insertCompliance("compliance-orphan", "missing-assignment");

      handle.applyMigrationsFrom("0032_meal_compliance_local_date.sql");

      const rows =
        handle.sqlite.exec(
          "SELECT id, local_date FROM meal_compliance ORDER BY id",
        )[0]?.values ?? [];
      expect(rows).toEqual([
        ["compliance-oct", "2026-10-20"],
        ["compliance-orphan", null],
        ["compliance-sep", "2026-09-01"],
      ]);
      expect(
        indexColumns(handle.sqlite, "meal_compliance_relationship_local_date_idx"),
      ).toEqual(["coaching_relationship_id", "local_date"]);
    } finally {
      handle.close();
    }
  });

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
