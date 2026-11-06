import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { resolveSetLoad } from "../domain/load-parser.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { createMemoryDb, yieldToEventLoop } from "../test-support/memory-db.js";

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

type SqliteLike = {
  exec: (sql: string) => Array<{ values: unknown[][] }>;
  run: (sql: string, params?: unknown[]) => void;
};

/**
 * Labels the backfill must read exactly like `parseLoadLabel` (Z6-1): every
 * case in load-parser.test.ts plus a few edge values.
 */
const LOAD_LABELS: Array<string | null> = [
  "40 kg", "60kg", "40 KG", "40 Kg", "40 kgs", "40KGS", "  40   kg  ", "40\tkg",
  "40\nkg", "42.5 kg", "42,5 kg", "22.25 kg", "2,25kg", "12.5 kilos", "20 kilo",
  "100 kilograms", "1 kilogram", "0 kg", "1250 kg", "9999.99 kg", "37.5 kg", "21.25 kg",
  "90 lb", "90 lbs", "90LBS", "45 pounds", "1 pound", "22.5 lb", "100,5 lb", "0.25 lb",
  "500 lb", "333.33 lb", "Bodyweight", "bodyweight", "BW", "bw", "Body weight", " BW ",
  "BW+10", "BW + 10", "bw+10kg", "BW + 7.5 kg", "Bodyweight + 20 kg", "BW+2,5 KGS",
  "BW + 25 lb", "RPE 7", "easy", "Moderate", "Light band", "40", "40.5", "2x20 kg",
  "20 kg each", "20 kg/hand", "40-50 kg", "40, 45 kg", "40,45,50 kg", "1,000 kg",
  "4 0 kg", "40 .5 kg", "42.5.0 kg", "42.555 kg", ".5 kg", "40. kg", "-5 kg", "+10 kg",
  "12345 kg", "40 kgkg", "kg", "BW-10", "BW+", "BW+easy", "BW++10", "BW+10 reps",
  "Body-weight", "40 ｋｇ", "40 kg", "40 KG", "", "   ", null,
];

function insertSetRow(
  sqlite: SqliteLike,
  id: string,
  prescribedLabel: string | null,
  actualLabel: string | null,
): void {
  sqlite.run(
    `INSERT INTO set_executions (
      id, exercise_execution_id, set_target_id, "order", status, prescribed_reps,
      prescribed_load_label, actual_reps, actual_load_label, completed_at, created_at, updated_at
    ) VALUES (?, 'exercise-execution-1', ?, 1, ?, 10, ?, ?, ?, '2026-10-20T07:30:00.000Z', '2026-10-20T07:00:00.000Z', '2026-10-20T07:30:00.000Z')`,
    [
      id,
      `target-${id}`,
      actualLabel == null ? "pending" : "completed",
      prescribedLabel,
      actualLabel == null ? null : 9,
      actualLabel,
    ],
  );
}

type SetLoadRow = {
  id: string;
  prescribedLabel: string | null;
  actualLabel: string | null;
  prescribedKg: number | null;
  actualKg: number | null;
  kind: string;
  updatedAt: string;
};

function setLoadRows(sqlite: SqliteLike): SetLoadRow[] {
  const values =
    sqlite.exec(
      "SELECT id, prescribed_load_label, actual_load_label, prescribed_load_kg, actual_load_kg, load_kind, updated_at FROM set_executions ORDER BY id",
    )[0]?.values ?? [];
  return values.map((row) => ({
    id: String(row[0]),
    prescribedLabel: row[1] == null ? null : String(row[1]),
    actualLabel: row[2] == null ? null : String(row[2]),
    prescribedKg: row[3] == null ? null : Number(row[3]),
    actualKg: row[4] == null ? null : Number(row[4]),
    kind: String(row[5]),
    updatedAt: String(row[6]),
  }));
}

function tableRowCounts(sqlite: SqliteLike): Record<string, number> {
  const tables =
    sqlite.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'food_search_fts%' ORDER BY name",
    )[0]?.values ?? [];
  const counts: Record<string, number> = {};
  for (const [name] of tables) {
    const table = String(name);
    counts[table] = Number(
      sqlite.exec(`SELECT COUNT(*) FROM "${table}"`)[0]?.values[0]?.[0] ?? 0,
    );
  }
  return counts;
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
  it("places 0030 to 0035 in order after 0029, with 0035 last", async () => {
    const journal = JSON.parse(
      readFileSync(join(drizzleDir, "meta/_journal.json"), "utf8"),
    ) as JournalEntry[];
    const tags = journal.map((entry) => entry.tag);
    const previous = tags.indexOf("0029_checkin_form_global_fields");
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(tags[previous + 1]).toBe("0030_perf_indexes");
    expect(tags[previous + 2]).toBe("0031_library_schema");
    expect(tags[previous + 3]).toBe("0032_meal_compliance_local_date");
    expect(tags[previous + 4]).toBe("0033_reminder_attempt_marker");
    expect(tags[previous + 5]).toBe("0034_remove_configured_status");
    expect(tags[previous + 6]).toBe("0035_numeric_set_load");
    expect(tags.at(-1)).toBe("0035_numeric_set_load");
    expect(journal[previous + 1]?.idx).toBe(journal[previous]!.idx + 1);
    expect(journal[previous + 1]?.idx).toBe(30);
    expect(journal[previous + 2]?.idx).toBe(31);
    expect(journal[previous + 3]?.idx).toBe(32);
    expect(journal[previous + 4]?.idx).toBe(33);
    expect(journal[previous + 5]?.idx).toBe(34);
    expect(journal[previous + 6]?.idx).toBe(35);

    const files = migrationSqlFiles();
    const previousFile = files.indexOf("0029_checkin_form_global_fields.sql");
    expect(files[previousFile + 1]).toBe("0030_perf_indexes.sql");
    expect(files[previousFile + 2]).toBe("0031_library_schema.sql");
    expect(files[previousFile + 3]).toBe("0032_meal_compliance_local_date.sql");
    expect(files[previousFile + 4]).toBe("0033_reminder_attempt_marker.sql");
    expect(files[previousFile + 5]).toBe("0034_remove_configured_status.sql");
    expect(files[previousFile + 6]).toBe("0035_numeric_set_load.sql");
    expect(files.at(-1)).toBe("0035_numeric_set_load.sql");
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
    const removeConfiguredSql = readFileSync(
      join(drizzleDir, "0034_remove_configured_status.sql"),
      "utf8",
    );
    expect(removeConfiguredSql).toContain(
      "UPDATE `coaching_configurations`\nSET `status` = 'draft'\nWHERE `status` = 'configured';",
    );
    expect(removeConfiguredSql).toContain(
      "DROP INDEX `coaching_configurations_one_open_uidx`;",
    );
    expect(removeConfiguredSql).toContain("WHERE `status` = 'draft';");
    expect(removeConfiguredSql).not.toMatch(/CREATE TABLE/i);
    expect(removeConfiguredSql).not.toMatch(/ALTER TABLE/i);

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
      // 0035 (Z6-1): numeric set loads next to the labels, which stay.
      expect(tableColumns(handle.sqlite, "set_executions")).toEqual(
        expect.arrayContaining([
          "prescribed_load_label",
          "actual_load_label",
          "prescribed_load_kg",
          "actual_load_kg",
          "load_kind",
        ]),
      );
      const leftover =
        handle.sqlite.exec(
          "SELECT name FROM sqlite_master WHERE name = '_z6_1_load_backfill'",
        )[0]?.values ?? [];
      expect(leftover).toEqual([]);
      // 0033 (X4i): the at-most-once attempt marker, nullable and not backfilled.
      expect(tableColumns(handle.sqlite, "notification_deliveries")).toContain(
        "attempt_started_at",
      );
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
      expect(tableColumns(handle.sqlite, "coaching_configurations")).toContain(
        "configured_at",
      );
      const openIndex = String(
        handle.sqlite.exec(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'coaching_configurations_one_open_uidx'",
        )[0]?.values[0]?.[0] ?? "",
      );
      expect(openIndex.toLowerCase()).toContain("'draft'");
      expect(openIndex.toLowerCase()).not.toContain("configured");
    } finally {
      handle.close();
    }
  }, 60_000);

  it("records 0035 in the drizzle snapshot chain after 0034", () => {
    const previous = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0034_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0035_snapshot.json"), "utf8"),
    ) as {
      id: string;
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean; default?: string }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.id).not.toBe(previous.id);
    const sets = snapshot.tables.set_executions!;
    expect(sets.columns.prescribed_load_kg).toMatchObject({ type: "real", notNull: false });
    expect(sets.columns.actual_load_kg).toMatchObject({ type: "real", notNull: false });
    expect(sets.columns.load_kind).toMatchObject({
      type: "text",
      notNull: true,
      default: "'text'",
    });
    expect(sets.columns.prescribed_load_label).toBeDefined();
    expect(sets.columns.actual_load_label).toBeDefined();
    expect(sets.checkConstraints.set_executions_load_kind_chk?.value).toContain(
      "'bodyweight_plus'",
    );
  });

  it("backfills numeric set loads exactly like the load parser when 0035 applies", async () => {
    const handle = await createMemoryDb({
      foreignKeys: false,
      through: "0034_remove_configured_status.sql",
    });
    try {
      expect(tableColumns(handle.sqlite, "set_executions")).not.toContain("load_kind");
      const pairs: Array<[string | null, string | null]> = [];
      // Each label as the prescribed side of a pending set, and as the logged side.
      for (const label of LOAD_LABELS) {
        pairs.push([label, null]);
        pairs.push(["40 kg", label]);
        pairs.push([label, "Bodyweight"]);
      }
      pairs.push([null, null], ["Bodyweight", "BW+10"], ["40 kg", "42.5 kg"], ["90 lb", "  "]);
      pairs.forEach(([prescribed, actual], index) => {
        insertSetRow(handle.sqlite, `set-${String(index).padStart(4, "0")}`, prescribed, actual);
      });

      handle.applyMigrationsFrom("0035_numeric_set_load.sql");

      const after = setLoadRows(handle.sqlite);
      expect(after).toHaveLength(pairs.length);
      for (const row of after) {
        const [prescribed, actual] = pairs[Number(row.id.slice(4))]!;
        // Labels and updated_at are untouched.
        expect(row.prescribedLabel).toBe(prescribed);
        expect(row.actualLabel).toBe(actual);
        expect(row.updatedAt).toBe("2026-10-20T07:30:00.000Z");
        const expected = resolveSetLoad({
          prescribedLoadLabel: prescribed,
          actualLoadLabel: actual,
        });
        expect(
          { prescribedKg: row.prescribedKg, actualKg: row.actualKg, kind: row.kind },
          `labels ${JSON.stringify([prescribed, actual])}`,
        ).toEqual({
          prescribedKg: expected.prescribedLoadKg,
          actualKg: expected.actualLoadKg,
          kind: expected.loadKind,
        });
      }
      // Spot checks against the spec's rules, independent of the parser.
      const byLabels = (prescribed: string | null, actual: string | null) =>
        after[pairs.findIndex(([p, a]) => p === prescribed && a === actual)]!;
      expect(byLabels("40 kg", "42.5 kg")).toMatchObject({
        prescribedKg: 40,
        actualKg: 42.5,
        kind: "kg",
      });
      expect(byLabels("90 lb", null)).toMatchObject({
        prescribedKg: 40.82,
        actualKg: null,
        kind: "kg",
      });
      expect(byLabels("Bodyweight", "BW+10")).toMatchObject({
        prescribedKg: null,
        actualKg: 10,
        kind: "bodyweight_plus",
      });
      expect(byLabels("40 kg", "Bodyweight")).toMatchObject({
        prescribedKg: 40,
        actualKg: null,
        kind: "bodyweight",
      });
      expect(byLabels("90 lb", "  ")).toMatchObject({
        prescribedKg: 40.82,
        actualKg: null,
        kind: "kg",
      });
      expect(byLabels("42,5 kg", null)).toMatchObject({ prescribedKg: 42.5, kind: "kg" });
      expect(byLabels("40KGS", null)).toMatchObject({ prescribedKg: 40, kind: "kg" });
      expect(byLabels("RPE 7", null)).toMatchObject({ prescribedKg: null, kind: "text" });
      expect(byLabels("40", null)).toMatchObject({ prescribedKg: null, kind: "text" });
      expect(byLabels(null, null)).toMatchObject({
        prescribedKg: null,
        actualKg: null,
        kind: "text",
      });

      const leftover =
        handle.sqlite.exec(
          "SELECT name FROM sqlite_master WHERE name = '_z6_1_load_backfill'",
        )[0]?.values ?? [];
      expect(leftover).toEqual([]);
      // Rows written later default to text (Z6-15 fills them on save), and the
      // CHECK rejects unknown or missing kinds.
      insertSetRow(handle.sqlite, "set-new", "40 kg", null);
      expect(setLoadRows(handle.sqlite).find((row) => row.id === "set-new")).toMatchObject({
        prescribedKg: null,
        kind: "text",
      });
      expect(() =>
        handle.sqlite.run("UPDATE set_executions SET load_kind = 'lb' WHERE id = 'set-new'"),
      ).toThrow();
      expect(() =>
        handle.sqlite.run("UPDATE set_executions SET load_kind = NULL WHERE id = 'set-new'"),
      ).toThrow();
    } finally {
      handle.close();
    }
  });

  it(
    "backfills seeded set loads exactly as the demo seed writes them, with row counts unchanged",
    async () => {
      // The demo seed now writes the 0035 columns itself (D-W6-14), so it cannot be loaded
      // before 0035. Seed on the full chain, blank the load columns back to the column
      // defaults (the state of every pre-0035 row), then run 0035's backfill statements.
      const handle = await createMemoryDb({ foreignKeys: true, librarySeed: true });
      try {
        const passwordHash = await hashPassword("FitBud-demo-2026");
        const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
        handle.sqlite.exec(
          buildDemoSeedSql({
            referenceInstant: new Date().toISOString(),
            passwordHash,
            libraryIndex,
          }),
        );
        await yieldToEventLoop();
        const seeded = setLoadRows(handle.sqlite);
        expect(seeded.length).toBeGreaterThan(0);
        handle.sqlite.run(
          "UPDATE set_executions SET prescribed_load_kg = NULL, actual_load_kg = NULL, load_kind = 'text'",
        );
        const countsBefore = tableRowCounts(handle.sqlite);

        const backfillSql = readFileSync(
          join(drizzleDir, "0035_numeric_set_load.sql"),
          "utf8",
        )
          // The test adapter splits on ";" without reading comments, so drop comment lines too.
          .replace(/^--.*\n/gm, "")
          .replace(/^ALTER TABLE[^;]*;\n/gm, "");
        expect(backfillSql).not.toMatch(/ALTER TABLE/);
        handle.sqlite.exec(backfillSql);
        await yieldToEventLoop();

        expect(tableRowCounts(handle.sqlite)).toEqual(countsBefore);
        assertNoForeignKeyViolations(handle.sqlite);

        const rows = setLoadRows(handle.sqlite);
        // The migration backfill and the seed's own write agree row for row.
        expect(rows).toEqual(seeded);
        expect(rows).toHaveLength(countsBefore.set_executions!);
        const kgLabel = /^(\d+(?:\.\d+)?) kg$/;
        let kgLabels = 0;
        for (const row of rows) {
          const prescribed = kgLabel.exec(row.prescribedLabel ?? "");
          const actual = kgLabel.exec(row.actualLabel ?? "");
          if (prescribed) {
            kgLabels += 1;
            expect(row.prescribedKg, row.id).toBe(Number(prescribed[1]));
          }
          if (actual) {
            kgLabels += 1;
            expect(row.actualKg, row.id).toBe(Number(actual[1]));
          }
          const expected = resolveSetLoad({
            prescribedLoadLabel: row.prescribedLabel,
            actualLoadLabel: row.actualLabel,
          });
          expect(
            { prescribedKg: row.prescribedKg, actualKg: row.actualKg, kind: row.kind },
            row.id,
          ).toEqual({
            prescribedKg: expected.prescribedLoadKg,
            actualKg: expected.actualLoadKg,
            kind: expected.loadKind,
          });
        }
        expect(kgLabels).toBeGreaterThan(0);
        const kinds = new Set(rows.map((row) => row.kind));
        expect(kinds.has("kg")).toBe(true);
        expect(kinds.has("bodyweight")).toBe(true);
      } finally {
        handle.close();
      }
    },
    120_000,
  );

  it("rewrites configured coaching rows to draft and opens only drafts", async () => {
    const handle = await createMemoryDb({
      foreignKeys: false,
      through: "0033_reminder_attempt_marker.sql",
    });
    try {
      const insert = (
        id: string,
        relationshipId: string,
        status: string,
        configuredAt: string | null,
      ) => {
        handle.sqlite.run(
          `INSERT INTO coaching_configurations (
            id, coaching_relationship_id, status, version_number, record_version,
            configured_at, created_at, updated_at
          ) VALUES (?, ?, ?, 1, 0, ?, '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')`,
          [id, relationshipId, status, configuredAt],
        );
      };
      insert("cfg-active", "rel-active", "active", "2026-09-01T00:00:00.000Z");
      insert("cfg-draft", "rel-draft", "draft", null);
      insert("cfg-open", "rel-open", "configured", "2026-10-02T00:00:00.000Z");

      handle.applyMigrationsFrom("0034_remove_configured_status.sql");

      const rows =
        handle.sqlite.exec(
          "SELECT id, status, configured_at FROM coaching_configurations ORDER BY id",
        )[0]?.values ?? [];
      expect(rows).toEqual([
        ["cfg-active", "active", "2026-09-01T00:00:00.000Z"],
        ["cfg-draft", "draft", null],
        ["cfg-open", "draft", "2026-10-02T00:00:00.000Z"],
      ]);
      expect(tableColumns(handle.sqlite, "coaching_configurations")).toContain(
        "configured_at",
      );
      const openIndex = String(
        handle.sqlite.exec(
          "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'coaching_configurations_one_open_uidx'",
        )[0]?.values[0]?.[0] ?? "",
      );
      expect(openIndex.toLowerCase()).toContain("'draft'");
      expect(openIndex.toLowerCase()).not.toContain("configured");
      expect(() => insert("cfg-open-2", "rel-open", "draft", null)).toThrow();
    } finally {
      handle.close();
    }
  });

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
        expect(foodCount).toBe(1243);
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
