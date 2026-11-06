import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { hashPassword } from "../auth/password.js";
import { resolveSetLoad } from "../domain/load-parser.js";
import { buildDemoSeedSql } from "../seed/demo/build.js";
import { loadDemoLibraryIndex } from "../seed/demo/personas.js";
import { assertNoForeignKeyViolations } from "../test-support/foreign-key-check.js";
import { createMemoryDb, yieldToEventLoop } from "../test-support/memory-db.js";
import {
  logEditEvents,
  mealCompliance,
  measurements,
  notificationPreferences,
  notifications,
  workoutExecutions,
} from "./schema.js";

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

/**
 * Drops `DELETE FROM <table>;` statements for tables a later migration creates, so the
 * current demo seed (whose wipe lists every table) still loads on a partly migrated DB.
 */
function withoutDeletesFromMissingTables(sqlite: SqliteLike, seedSql: string): string {
  const existing = new Set(
    (
      sqlite.exec("SELECT name FROM sqlite_master WHERE type = 'table'")[0]?.values ?? []
    ).map((row) => String(row[0])),
  );
  return seedSql.replace(/^DELETE FROM ([a-z_0-9]+);[ \t]*$/gm, (statement, table: string) =>
    existing.has(table) ? statement : "",
  );
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

/** payment_records columns in table order (0036, Z6-3). */
const PAYMENT_RECORD_COLUMNS = [
  "id",
  "coaching_relationship_id",
  "subscription_version_id",
  "amount_paise",
  "due_on",
  "paid_on",
  "status",
  "method",
  "note",
  "created_by",
  "created_at",
  "updated_at",
];

/** daily_steps columns in table order (0037, Z6-4). */
const DAILY_STEPS_COLUMNS = [
  "id",
  "coaching_relationship_id",
  "local_date",
  "steps",
  "source",
  "synced_at",
];

/** Columns 0039 (Z6-18) appends to workout_executions, meal_compliance and measurements. */
const LOG_AUTHORSHIP_COLUMNS = [
  "logged_by_role",
  "logged_by_user_id",
  "last_edited_by_role",
  "last_edited_by_user_id",
  "last_edited_at",
];

/** log_edit_events columns in table order (0039, Z6-18). */
const LOG_EDIT_EVENTS_COLUMNS = [
  "id",
  "coaching_relationship_id",
  "trainee_user_id",
  "actor_user_id",
  "actor_role",
  "entity_type",
  "entity_id",
  "action",
  "before_json",
  "after_json",
  "created_at",
];

/** Column names that would let a payment table hold a collection or a session count (D-W6-5). */
const NOT_TRACKING_ONLY =
  /session|gateway|invoice|transaction|razorpay|stripe|checkout|refund|order|link|receipt|card|vpa|upi_id|collect|remaining|used|included|reference/i;

type SubscriptionPaymentFields = {
  amount: number | string | null;
  type: string | null;
  mode: string | null;
};

type PaymentRow = {
  relationship: string;
  subscriptionVersion: string;
  amount: number;
  dueOn: string;
  paidOn: string | null;
  status: string;
  method: string | null;
};

/** One trainer coaching two trainees, each with one subscription version (pre-0036 columns only). */
function insertPaymentFixtures(sqlite: SqliteLike): void {
  const at = "2026-10-01T04:30:00.000Z";
  for (const id of ["trainer-rahul", "trainee-asha", "trainee-vikram"]) {
    sqlite.run(
      "INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at) VALUES (?, ?, 'active', 'Asia/Kolkata', ?, ?)",
      [id, `firebase-${id}`, at, at],
    );
  }
  for (const [relationship, trainee] of [
    ["rel-asha", "trainee-asha"],
    ["rel-vikram", "trainee-vikram"],
  ] as const) {
    sqlite.run(
      "INSERT INTO coaching_relationships (id, trainer_user_id, trainee_user_id, status, started_at, created_at, updated_at) VALUES (?, 'trainer-rahul', ?, 'active', ?, ?, ?)",
      [relationship, trainee, at, at, at],
    );
    sqlite.run(
      "INSERT INTO subscription_versions (id, coaching_relationship_id, version_number, plan_name, payment_frequency, starts_on, renews_on, created_at) VALUES (?, ?, 1, 'Fat loss 12 weeks', 'monthly', '2026-10-01', '2026-11-01', ?)",
      [relationship.replace("rel-", "sv-"), relationship, at],
    );
  }
}

describe("migration chain and seeds", () => {
  it("places 0030 to 0039 in order after 0029, with 0039 last", async () => {
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
    expect(tags[previous + 7]).toBe("0036_payment_tracking");
    expect(tags[previous + 8]).toBe("0037_daily_steps");
    expect(tags[previous + 9]).toBe("0038_archived_account_state");
    expect(tags[previous + 10]).toBe("0039_log_authorship");
    expect(tags.at(-1)).toBe("0039_log_authorship");
    expect(journal[previous + 1]?.idx).toBe(journal[previous]!.idx + 1);
    expect(journal[previous + 1]?.idx).toBe(30);
    expect(journal[previous + 2]?.idx).toBe(31);
    expect(journal[previous + 3]?.idx).toBe(32);
    expect(journal[previous + 4]?.idx).toBe(33);
    expect(journal[previous + 5]?.idx).toBe(34);
    expect(journal[previous + 6]?.idx).toBe(35);
    expect(journal[previous + 7]?.idx).toBe(36);
    expect(journal[previous + 8]?.idx).toBe(37);
    expect(journal[previous + 9]?.idx).toBe(38);
    expect(journal[previous + 10]?.idx).toBe(39);

    const files = migrationSqlFiles();
    const previousFile = files.indexOf("0029_checkin_form_global_fields.sql");
    expect(files[previousFile + 1]).toBe("0030_perf_indexes.sql");
    expect(files[previousFile + 2]).toBe("0031_library_schema.sql");
    expect(files[previousFile + 3]).toBe("0032_meal_compliance_local_date.sql");
    expect(files[previousFile + 4]).toBe("0033_reminder_attempt_marker.sql");
    expect(files[previousFile + 5]).toBe("0034_remove_configured_status.sql");
    expect(files[previousFile + 6]).toBe("0035_numeric_set_load.sql");
    expect(files[previousFile + 7]).toBe("0036_payment_tracking.sql");
    expect(files[previousFile + 8]).toBe("0037_daily_steps.sql");
    expect(files[previousFile + 9]).toBe("0038_archived_account_state.sql");
    expect(files[previousFile + 10]).toBe("0039_log_authorship.sql");
    expect(files.at(-1)).toBe("0039_log_authorship.sql");
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

  it("keeps 0036 additive: no table rebuild, drop or backfill", () => {
    const paymentSql = readFileSync(join(drizzleDir, "0036_payment_tracking.sql"), "utf8");
    expect(paymentSql).not.toMatch(/DROP\s+(TABLE|INDEX)/i);
    expect(paymentSql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b|RENAME/i);
    expect(paymentSql).not.toMatch(/CREATE TABLE `?__new/i);
    const created = [...paymentSql.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map((m) => m[1]);
    expect(created).toEqual(["payment_records"]);
    const altered = [...paymentSql.matchAll(/ALTER TABLE `([a-z_]+)` ADD COLUMN `([a-z_]+)`/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    expect(altered).toEqual([
      "subscription_versions.amount_paise",
      "subscription_versions.subscription_type",
      "subscription_versions.coaching_mode",
    ]);
  });

  it("records 0036 in the drizzle snapshot chain after 0035", () => {
    const previous = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0035_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0036_snapshot.json"), "utf8"),
    ) as {
      id: string;
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean }>;
          indexes: Record<string, { columns: string[]; isUnique: boolean }>;
          foreignKeys: Record<string, { tableTo: string; columnsFrom: string[]; columnsTo: string[] }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.id).not.toBe(previous.id);
    const subscriptions = snapshot.tables.subscription_versions!;
    expect(subscriptions.columns.amount_paise).toMatchObject({ type: "integer", notNull: false });
    expect(subscriptions.columns.subscription_type).toMatchObject({ type: "text", notNull: false });
    expect(subscriptions.columns.coaching_mode).toMatchObject({ type: "text", notNull: false });
    expect(Object.keys(subscriptions.checkConstraints).sort()).toEqual([
      "subscription_versions_amount_paise_chk",
      "subscription_versions_coaching_mode_chk",
      "subscription_versions_subscription_type_chk",
    ]);
    expect(subscriptions.indexes.subscription_versions_relationship_id_uidx).toMatchObject({
      columns: ["coaching_relationship_id", "id"],
      isUnique: true,
    });
    const payments = snapshot.tables.payment_records!;
    expect(Object.keys(payments.columns)).toEqual(PAYMENT_RECORD_COLUMNS);
    expect(payments.indexes.payment_records_relationship_due_idx).toMatchObject({
      columns: ["coaching_relationship_id", "due_on"],
      isUnique: false,
    });
    expect(payments.foreignKeys.payment_records_subscription_version_fk).toMatchObject({
      tableTo: "subscription_versions",
      columnsFrom: ["coaching_relationship_id", "subscription_version_id"],
      columnsTo: ["coaching_relationship_id", "id"],
    });
    expect(Object.keys(payments.checkConstraints).sort()).toEqual([
      "payment_records_amount_paise_chk",
      "payment_records_due_on_chk",
      "payment_records_method_chk",
      "payment_records_paid_on_chk",
      "payment_records_status_chk",
    ]);
  });

  it("adds tracking-only subscription fields and payment records whose CHECKs reject invalid values", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      expect(tableColumns(handle.sqlite, "subscription_versions")).toEqual([
        "id",
        "coaching_relationship_id",
        "version_number",
        "plan_name",
        "payment_frequency",
        "starts_on",
        "renews_on",
        "created_at",
        "amount_paise",
        "subscription_type",
        "coaching_mode",
      ]);
      expect(tableColumns(handle.sqlite, "payment_records")).toEqual(PAYMENT_RECORD_COLUMNS);
      // D-W6-5: nothing can hold a session count, gateway reference, invoice or collection.
      for (const table of ["subscription_versions", "payment_records"]) {
        for (const column of tableColumns(handle.sqlite, table)) {
          expect(column, `${table}.${column}`).not.toMatch(NOT_TRACKING_ONLY);
        }
      }
      expect(indexColumns(handle.sqlite, "payment_records_relationship_due_idx")).toEqual([
        "coaching_relationship_id",
        "due_on",
      ]);
      expect(indexColumns(handle.sqlite, "subscription_versions_relationship_id_uidx")).toEqual([
        "coaching_relationship_id",
        "id",
      ]);
      const fks = (
        handle.sqlite.exec(
          `SELECT "table", "from", "to" FROM pragma_foreign_key_list('payment_records') ORDER BY id, seq`,
        )[0]?.values ?? []
      ).map((row) => row.map(String).join(":"));
      expect(fks.sort()).toEqual(
        [
          "coaching_relationships:coaching_relationship_id:id",
          "subscription_versions:coaching_relationship_id:coaching_relationship_id",
          "subscription_versions:subscription_version_id:id",
          "users:created_by:id",
        ].sort(),
      );

      insertPaymentFixtures(handle.sqlite);
      const insertSubscription = (id: string, values: SubscriptionPaymentFields) => {
        handle.sqlite.run(
          `INSERT INTO subscription_versions (
            id, coaching_relationship_id, version_number, plan_name, payment_frequency,
            starts_on, renews_on, created_at, amount_paise, subscription_type, coaching_mode
          ) VALUES (?, 'rel-asha', ?, 'Strength 12 weeks', 'monthly', '2026-10-01', '2026-11-01', '2026-10-01T04:30:00.000Z', ?, ?, ?)`,
          [id, Number(id.replace(/\D/g, "")) + 10, values.amount, values.type, values.mode],
        );
      };
      // Valid: all NULL (pre-0036 shape), each allowed type and mode, zero for a free plan.
      insertSubscription("sub-1", { amount: null, type: null, mode: null });
      insertSubscription("sub-2", { amount: 450_000, type: "custom", mode: "in_person" });
      insertSubscription("sub-3", { amount: 0, type: "yearly", mode: "hybrid" });
      insertSubscription("sub-4", { amount: 120_000, type: "weekly", mode: "online" });
      insertSubscription("sub-5", { amount: 300_000, type: "quarterly", mode: null });
      const rejectedSubscriptions: SubscriptionPaymentFields[] = [
        { amount: -1, type: null, mode: null },
        { amount: 4500.5, type: null, mode: null },
        { amount: "4500 rupees", type: null, mode: null },
        { amount: null, type: "per_session", mode: null },
        { amount: null, type: "Monthly", mode: null },
        { amount: null, type: "", mode: null },
        { amount: null, type: null, mode: "remote" },
        { amount: null, type: null, mode: "in-person" },
      ];
      rejectedSubscriptions.forEach((values, index) => {
        expect(
          () => insertSubscription(`sub-bad-${index + 20}`, values),
          JSON.stringify(values),
        ).toThrow(/CHECK constraint failed/);
      });

      const insertPayment = (id: string, overrides: Partial<PaymentRow> = {}) => {
        const row: PaymentRow = {
          relationship: "rel-asha",
          subscriptionVersion: "sv-asha",
          amount: 450_000,
          dueOn: "2026-11-01",
          paidOn: null,
          status: "unpaid",
          method: null,
          ...overrides,
        };
        handle.sqlite.run(
          `INSERT INTO payment_records (
            id, coaching_relationship_id, subscription_version_id, amount_paise, due_on,
            paid_on, status, method, note, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'trainer-rahul', '2026-10-21T05:00:00.000Z', '2026-10-21T05:00:00.000Z')`,
          [
            id,
            row.relationship,
            row.subscriptionVersion,
            row.amount,
            row.dueOn,
            row.paidOn,
            row.status,
            row.method,
          ],
        );
      };
      insertPayment("pay-unpaid");
      insertPayment("pay-cash", { status: "paid", paidOn: "2026-10-30", method: "cash" });
      insertPayment("pay-upi", { status: "paid", paidOn: "2026-10-31", method: "upi" });
      insertPayment("pay-bank", { status: "paid", paidOn: "2026-11-01", method: "bank" });
      insertPayment("pay-no-method", { status: "paid", paidOn: "2026-11-02" });
      const rejectedPayments: Array<[Partial<PaymentRow>, RegExp]> = [
        [{ status: "pending" }, /CHECK constraint failed/],
        [{ status: "paid" }, /CHECK constraint failed/],
        [{ status: "unpaid", paidOn: "2026-10-30" }, /CHECK constraint failed/],
        [{ status: "unpaid", method: "cash" }, /CHECK constraint failed/],
        [{ status: "paid", paidOn: "2026-10-30", method: "card" }, /CHECK constraint failed/],
        [{ status: "paid", paidOn: "2026-10-30", method: "razorpay" }, /CHECK constraint failed/],
        [{ status: "paid", paidOn: "30 Oct 2026", method: "upi" }, /CHECK constraint failed/],
        [{ amount: 0 }, /CHECK constraint failed/],
        [{ amount: -45_000 }, /CHECK constraint failed/],
        [{ amount: 4500.5 }, /CHECK constraint failed/],
        [{ dueOn: "Sun 1 Nov" }, /CHECK constraint failed/],
        [{ dueOn: "2026-11-01T00:00:00.000Z" }, /CHECK constraint failed/],
        // The subscription version must belong to the same relationship.
        [{ subscriptionVersion: "sv-vikram" }, /FOREIGN KEY constraint failed/],
        [{ subscriptionVersion: "sv-missing" }, /FOREIGN KEY constraint failed/],
        [{ relationship: "rel-vikram" }, /FOREIGN KEY constraint failed/],
      ];
      rejectedPayments.forEach(([overrides, error], index) => {
        let thrown: unknown;
        try {
          insertPayment(`pay-bad-${index}`, overrides);
        } catch (caught) {
          thrown = caught;
        }
        expect(thrown, JSON.stringify(overrides)).toBeInstanceOf(Error);
        expect(String(thrown), JSON.stringify(overrides)).toMatch(error);
      });
      const kept =
        handle.sqlite.exec("SELECT id FROM payment_records ORDER BY id")[0]?.values ?? [];
      expect(kept.map((row) => String(row[0]))).toEqual([
        "pay-bank",
        "pay-cash",
        "pay-no-method",
        "pay-unpaid",
        "pay-upi",
      ]);
    } finally {
      handle.close();
    }
  }, 60_000);

  it(
    "applies 0036 to a seeded database with row counts unchanged and no invented amounts",
    async () => {
      const handle = await createMemoryDb({
        foreignKeys: true,
        librarySeed: true,
        through: "0035_numeric_set_load.sql",
      });
      try {
        expect(tableColumns(handle.sqlite, "subscription_versions")).not.toContain("amount_paise");
        const passwordHash = await hashPassword("FitBud-demo-2026");
        const libraryIndex = loadDemoLibraryIndex(handle.sqlite);
        handle.sqlite.exec(
          withoutDeletesFromMissingTables(
            handle.sqlite,
            buildDemoSeedSql({
              referenceInstant: new Date().toISOString(),
              passwordHash,
              libraryIndex,
            }),
          ),
        );
        await yieldToEventLoop();
        const subscriptionSql =
          "SELECT id, coaching_relationship_id, version_number, plan_name, payment_frequency, starts_on, renews_on, created_at FROM subscription_versions ORDER BY id";
        const subscriptionsBefore = handle.sqlite.exec(subscriptionSql)[0]?.values ?? [];
        expect(subscriptionsBefore.length).toBeGreaterThan(0);
        const countsBefore = tableRowCounts(handle.sqlite);
        expect(countsBefore.payment_records).toBeUndefined();

        handle.applyMigrationsFrom("0036_payment_tracking.sql");
        await yieldToEventLoop();

        expect(tableRowCounts(handle.sqlite)).toEqual({
          ...countsBefore,
          payment_records: 0,
          daily_steps: 0,
          log_edit_events: 0,
        });
        assertNoForeignKeyViolations(handle.sqlite);
        expect(handle.sqlite.exec(subscriptionSql)[0]?.values ?? []).toEqual(subscriptionsBefore);
        const invented =
          handle.sqlite.exec(
            "SELECT id FROM subscription_versions WHERE amount_paise IS NOT NULL OR subscription_type IS NOT NULL OR coaching_mode IS NOT NULL",
          )[0]?.values ?? [];
        expect(invented).toEqual([]);

        // A seeded subscription version takes a payment only on its own relationship.
        const [versionId, relationshipId] = subscriptionsBefore[0]!.map(String) as [string, string];
        const trainerId = String(
          handle.sqlite.exec(
            `SELECT trainer_user_id FROM coaching_relationships WHERE id = '${relationshipId}'`,
          )[0]?.values[0]?.[0],
        );
        const otherRelationship = handle.sqlite.exec(
          `SELECT id FROM coaching_relationships WHERE id <> '${relationshipId}' LIMIT 1`,
        )[0]?.values[0]?.[0];
        expect(otherRelationship).toBeDefined();
        const insertPayment = (id: string, relationship: string) =>
          handle.sqlite.run(
            `INSERT INTO payment_records (
              id, coaching_relationship_id, subscription_version_id, amount_paise, due_on,
              paid_on, status, method, note, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, 250000, '2026-11-01', '2026-11-01', 'paid', 'upi', NULL, ?, '2026-11-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z')`,
            [id, relationship, versionId, trainerId],
          );
        insertPayment("pay-seeded", relationshipId);
        expect(() => insertPayment("pay-cross", String(otherRelationship))).toThrow(
          /FOREIGN KEY constraint failed/,
        );
        assertNoForeignKeyViolations(handle.sqlite);
      } finally {
        handle.close();
      }
    },
    120_000,
  );

  it("loads a seed that wipes a later table onto a database migrated only part way", async () => {
    const handle = await createMemoryDb({
      foreignKeys: true,
      through: "0035_numeric_set_load.sql",
    });
    try {
      expect(tableColumns(handle.sqlite, "payment_records")).toEqual([]);
      const seedSql =
        "DELETE FROM payment_records;\nDELETE FROM daily_steps;\nDELETE FROM coaching_relationships;\n";
      expect(() => handle.sqlite.exec(seedSql)).toThrow(/no such table/);
      const filtered = withoutDeletesFromMissingTables(handle.sqlite, seedSql);
      expect(filtered).not.toContain("payment_records");
      expect(filtered).not.toContain("daily_steps");
      expect(filtered).toContain("DELETE FROM coaching_relationships;");
      expect(() => handle.sqlite.exec(filtered)).not.toThrow();
      // Once the table exists the statement is kept.
      handle.applyMigrationsFrom("0036_payment_tracking.sql");
      expect(withoutDeletesFromMissingTables(handle.sqlite, seedSql)).toContain(
        "DELETE FROM payment_records;",
      );
    } finally {
      handle.close();
    }
  }, 60_000);

  it("keeps 0037 additive: no table rebuild, drop or backfill", () => {
    const stepsSql = readFileSync(join(drizzleDir, "0037_daily_steps.sql"), "utf8");
    expect(stepsSql).not.toMatch(/DROP\s+(TABLE|INDEX)/i);
    expect(stepsSql.replace(/^--.*$/gm, "").replace(/ON DELETE CASCADE/g, "")).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b|RENAME/i);
    expect(stepsSql).not.toMatch(/CREATE TABLE `?__new/i);
    expect([...stepsSql.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map((m) => m[1])).toEqual([
      "daily_steps",
    ]);
    expect(
      [...stepsSql.matchAll(/ALTER TABLE `([a-z_]+)` ADD COLUMN `([a-z_]+)`/g)].map(
        (m) => `${m[1]}.${m[2]}`,
      ),
    ).toEqual(["coaching_configurations.steps_target"]);
  });

  it("records 0037 in the drizzle snapshot chain after 0036", () => {
    const previous = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0036_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0037_snapshot.json"), "utf8"),
    ) as {
      id: string;
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean; default?: number }>;
          indexes: Record<string, { columns: string[]; isUnique: boolean }>;
          foreignKeys: Record<string, { tableTo: string; onDelete: string }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.id).not.toBe(previous.id);
    expect(snapshot.tables.coaching_configurations!.columns.steps_target).toMatchObject({
      type: "integer",
      notNull: true,
      default: 8000,
    });
    const steps = snapshot.tables.daily_steps!;
    expect(Object.keys(steps.columns)).toEqual(DAILY_STEPS_COLUMNS);
    expect(steps.indexes.daily_steps_relationship_date_uidx).toMatchObject({
      columns: ["coaching_relationship_id", "local_date"],
      isUnique: true,
    });
    expect(Object.values(steps.foreignKeys)).toMatchObject([
      { tableTo: "coaching_relationships", onDelete: "cascade" },
    ]);
    expect(Object.keys(steps.checkConstraints).sort()).toEqual([
      "daily_steps_local_date_chk",
      "daily_steps_source_chk",
      "daily_steps_steps_chk",
    ]);
  });

  it("stores one row of steps per client per day, bounded, from a known source, and cascades with the relationship", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      expect(tableColumns(handle.sqlite, "daily_steps")).toEqual(DAILY_STEPS_COLUMNS);
      expect(indexColumns(handle.sqlite, "daily_steps_relationship_date_uidx")).toEqual([
        "coaching_relationship_id",
        "local_date",
      ]);
      insertPaymentFixtures(handle.sqlite);
      const at = "2026-10-21T05:00:00.000Z";
      const insertSteps = (
        id: string,
        relationship: string,
        localDate: string,
        steps: number | string,
        source: string,
      ) =>
        handle.sqlite.run(
          "INSERT INTO daily_steps (id, coaching_relationship_id, local_date, steps, source, synced_at) VALUES (?, ?, ?, ?, ?, ?)",
          [id, relationship, localDate, steps, source, at],
        );

      insertSteps("st-1", "rel-asha", "2026-10-20", 8000, "apple_health");
      insertSteps("st-2", "rel-asha", "2026-10-21", 0, "health_connect");
      insertSteps("st-3", "rel-asha", "2026-10-22", 200_000, "manual");
      // The same civil day is allowed for a different client.
      insertSteps("st-4", "rel-vikram", "2026-10-20", 5200, "apple_health");

      // One row per client per day, whatever the source or count.
      expect(() => insertSteps("st-dup", "rel-asha", "2026-10-20", 9000, "manual")).toThrow(
        /UNIQUE constraint failed/,
      );
      const rejected: Array<[string, number | string, string]> = [
        ["2026-10-23", -1, "manual"],
        ["2026-10-23", 200_001, "manual"],
        ["2026-10-23", 8000.5, "manual"],
        ["2026-10-23", "lots", "manual"],
        ["2026-10-23", 8000, "fitbit"],
        ["2026-10-23", 8000, "Manual"],
        ["2026-10-23", 8000, ""],
        ["Fri 23 Oct", 8000, "manual"],
        ["2026-10-23T00:00:00.000Z", 8000, "manual"],
      ];
      rejected.forEach(([localDate, steps, source], index) => {
        expect(
          () => insertSteps(`st-bad-${index}`, "rel-asha", localDate, steps, source),
          JSON.stringify([localDate, steps, source]),
        ).toThrow(/CHECK constraint failed/);
      });
      expect(() => insertSteps("st-orphan", "rel-missing", "2026-10-20", 1, "manual")).toThrow(
        /FOREIGN KEY constraint failed/,
      );

      // A relationship holding step rows can still be removed, as the demo wipe and the
      // QA reset do: its steps go with it and the other client's stay.
      handle.sqlite.run("DELETE FROM subscription_versions WHERE coaching_relationship_id = 'rel-asha'");
      handle.sqlite.run("DELETE FROM coaching_relationships WHERE id = 'rel-asha'");
      expect(
        (handle.sqlite.exec("SELECT id FROM daily_steps ORDER BY id")[0]?.values ?? []).map((r) =>
          String(r[0]),
        ),
      ).toEqual(["st-4"]);
      assertNoForeignKeyViolations(handle.sqlite);
    } finally {
      handle.close();
    }
  }, 60_000);

  it(
    "applies 0037 to a seeded database: every configuration reads 8000, row counts unchanged",
    async () => {
      const handle = await createMemoryDb({
        foreignKeys: true,
        librarySeed: true,
        through: "0036_payment_tracking.sql",
      });
      try {
        expect(tableColumns(handle.sqlite, "coaching_configurations")).not.toContain(
          "steps_target",
        );
        const passwordHash = await hashPassword("FitBud-demo-2026");
        handle.sqlite.exec(
          withoutDeletesFromMissingTables(
            handle.sqlite,
            buildDemoSeedSql({
              referenceInstant: new Date().toISOString(),
              passwordHash,
              libraryIndex: loadDemoLibraryIndex(handle.sqlite),
            }),
          ),
        );
        await yieldToEventLoop();
        const configurationSql =
          "SELECT id, coaching_relationship_id, status, version_number, goal_short, updated_at FROM coaching_configurations ORDER BY id";
        const configurationsBefore = handle.sqlite.exec(configurationSql)[0]?.values ?? [];
        expect(configurationsBefore.length).toBeGreaterThan(0);
        const countsBefore = tableRowCounts(handle.sqlite);
        expect(countsBefore.daily_steps).toBeUndefined();

        handle.applyMigrationsFrom("0037_daily_steps.sql");
        await yieldToEventLoop();

        expect(tableRowCounts(handle.sqlite)).toEqual({
          ...countsBefore,
          daily_steps: 0,
          log_edit_events: 0,
        });
        assertNoForeignKeyViolations(handle.sqlite);
        expect(handle.sqlite.exec(configurationSql)[0]?.values ?? []).toEqual(configurationsBefore);
        const targets = handle.sqlite.exec(
          "SELECT DISTINCT steps_target, typeof(steps_target) FROM coaching_configurations",
        )[0]?.values;
        expect(targets).toEqual([[8000, "integer"]]);

        // A new configuration that names no target also reads 8000.
        const relationshipId = String(configurationsBefore[0]![1]);
        handle.sqlite.run(
          "INSERT INTO coaching_configurations (id, coaching_relationship_id, status, version_number, created_at, updated_at) VALUES ('cfg-new', ?, 'superseded', 99, '2026-11-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z')",
          [relationshipId],
        );
        expect(
          handle.sqlite.exec("SELECT steps_target FROM coaching_configurations WHERE id = 'cfg-new'")[0]
            ?.values[0]?.[0],
        ).toBe(8000);

        // A seeded relationship takes step rows, and a row is removable with no fallout.
        handle.sqlite.run(
          "INSERT INTO daily_steps (id, coaching_relationship_id, local_date, steps, source, synced_at) VALUES ('st-seeded', ?, '2026-11-01', 7000, 'manual', '2026-11-01T05:00:00.000Z')",
          [relationshipId],
        );
        assertNoForeignKeyViolations(handle.sqlite);
      } finally {
        handle.close();
      }
    },
    120_000,
  );

  it("keeps 0038 additive: no table rebuild, drop or backfill", () => {
    const archiveSql = readFileSync(join(drizzleDir, "0038_archived_account_state.sql"), "utf8");
    const code = archiveSql.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/DROP\s+(TABLE|INDEX)|\bUPDATE\b|\bDELETE\b|\bINSERT\b|RENAME|PRAGMA/i);
    expect(code).not.toMatch(/CREATE TABLE/i);
    expect(
      [...code.matchAll(/ALTER TABLE `([a-z_]+)` ADD COLUMN `([a-z_]+)`/g)].map(
        (m) => `${m[1]}.${m[2]}`,
      ),
    ).toEqual(["users.archived_at", "users.purge_after"]);
  });

  it("records 0038 in the drizzle snapshot chain after 0037", () => {
    const previous = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0037_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0038_snapshot.json"), "utf8"),
    ) as {
      id: string;
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean }>;
          indexes: Record<string, { columns: string[]; isUnique: boolean }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.id).not.toBe(previous.id);
    const users = snapshot.tables.users!;
    expect(users.columns.archived_at).toMatchObject({ type: "text", notNull: false });
    expect(users.columns.purge_after).toMatchObject({ type: "text", notNull: false });
    expect(users.indexes.users_purge_after_idx).toMatchObject({
      columns: ["purge_after"],
      isUnique: false,
    });
    expect(Object.keys(users.checkConstraints).sort()).toEqual([
      "users_archived_at_chk",
      "users_purge_after_chk",
    ]);
  });

  it("accepts archived accounts with both dates and rejects every other combination", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      expect(tableColumns(handle.sqlite, "users")).toEqual([
        "id",
        "firebase_uid",
        "account_state",
        "timezone",
        "created_at",
        "updated_at",
        "archived_at",
        "purge_after",
      ]);
      expect(indexColumns(handle.sqlite, "users_purge_after_idx")).toEqual(["purge_after"]);
      const at = "2026-11-01T05:00:00.000Z";
      const purge = "2027-05-01T05:00:00.000Z";
      const insertUser = (
        id: string,
        state: string,
        archivedAt: string | null,
        purgeAfter: string | null,
      ) =>
        handle.sqlite.run(
          "INSERT INTO users (id, firebase_uid, account_state, timezone, created_at, updated_at, archived_at, purge_after) VALUES (?, ?, ?, 'Asia/Kolkata', ?, ?, ?, ?)",
          [id, `firebase-${id}`, state, at, at, archivedAt, purgeAfter],
        );

      insertUser("u-active", "active", null, null);
      insertUser("u-disabled", "disabled", null, null);
      insertUser("u-archived", "archived", at, purge);
      expect(
        (handle.sqlite.exec("SELECT id, account_state, archived_at, purge_after FROM users ORDER BY id")[0]
          ?.values ?? []),
      ).toEqual([
        ["u-active", "active", null, null],
        ["u-archived", "archived", at, purge],
        ["u-disabled", "disabled", null, null],
      ]);

      const rejected: Array<[string, string | null, string | null]> = [
        ["archived", null, null],
        ["archived", at, null],
        ["archived", null, purge],
        ["active", at, purge],
        ["active", at, null],
        ["active", null, purge],
        ["disabled", at, purge],
      ];
      rejected.forEach(([state, archivedAt, purgeAfter], index) => {
        expect(
          () => insertUser(`u-bad-${index}`, state, archivedAt, purgeAfter),
          JSON.stringify([state, archivedAt, purgeAfter]),
        ).toThrow(/CHECK constraint failed/);
      });

      // Archiving and reactivating move the state and both dates together.
      expect(() =>
        handle.sqlite.run("UPDATE users SET account_state = 'archived' WHERE id = 'u-active'"),
      ).toThrow(/CHECK constraint failed/);
      handle.sqlite.run(
        "UPDATE users SET account_state = 'archived', archived_at = ?, purge_after = ? WHERE id = 'u-active'",
        [at, purge],
      );
      expect(() =>
        handle.sqlite.run("UPDATE users SET account_state = 'active' WHERE id = 'u-active'"),
      ).toThrow(/CHECK constraint failed/);
      handle.sqlite.run(
        "UPDATE users SET account_state = 'active', archived_at = NULL, purge_after = NULL WHERE id = 'u-active'",
      );
      assertNoForeignKeyViolations(handle.sqlite);
    } finally {
      handle.close();
    }
  }, 60_000);

  it(
    "applies 0038 to a seeded database: every user stays active with NULL dates, row counts unchanged, foreign keys clean",
    async () => {
      const handle = await createMemoryDb({
        foreignKeys: true,
        librarySeed: true,
        through: "0037_daily_steps.sql",
      });
      try {
        expect(tableColumns(handle.sqlite, "users")).not.toContain("archived_at");
        const passwordHash = await hashPassword("FitBud-demo-2026");
        handle.sqlite.exec(
          withoutDeletesFromMissingTables(
            handle.sqlite,
            buildDemoSeedSql({
              referenceInstant: new Date().toISOString(),
              passwordHash,
              libraryIndex: loadDemoLibraryIndex(handle.sqlite),
            }),
          ),
        );
        await yieldToEventLoop();
        const usersSql =
          "SELECT id, firebase_uid, account_state, timezone, created_at, updated_at FROM users ORDER BY id";
        const usersBefore = handle.sqlite.exec(usersSql)[0]?.values ?? [];
        expect(usersBefore.length).toBeGreaterThan(0);
        const countsBefore = tableRowCounts(handle.sqlite);

        handle.applyMigrationsFrom("0038_archived_account_state.sql");
        await yieldToEventLoop();

        expect(tableRowCounts(handle.sqlite)).toEqual({ ...countsBefore, log_edit_events: 0 });
        assertNoForeignKeyViolations(handle.sqlite);
        expect(handle.sqlite.exec(usersSql)[0]?.values ?? []).toEqual(usersBefore);
        expect(
          handle.sqlite.exec(
            "SELECT DISTINCT account_state, archived_at, purge_after FROM users",
          )[0]?.values,
        ).toEqual([["active", null, null]]);
        expect(indexColumns(handle.sqlite, "users_purge_after_idx")).toEqual(["purge_after"]);
      } finally {
        handle.close();
      }
    },
    120_000,
  );

  it("keeps 0039 additive: no table rebuild, drop or backfill", () => {
    const sqlText = readFileSync(join(drizzleDir, "0039_log_authorship.sql"), "utf8");
    const code = sqlText.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/DROP\s+(TABLE|INDEX)|\bUPDATE\b|\bDELETE\b(?! CASCADE)|\bINSERT\b|RENAME|PRAGMA/i);
    expect(code).not.toMatch(/CREATE TABLE `?__new/i);
    expect([...code.matchAll(/CREATE TABLE `([a-z_]+)`/g)].map((m) => m[1])).toEqual([
      "log_edit_events",
    ]);
    const added = [...code.matchAll(/ALTER TABLE `([a-z_]+)` ADD COLUMN `([a-z_]+)`/g)].map(
      (m) => `${m[1]}.${m[2]}`,
    );
    expect(added).toEqual([
      ...["workout_executions", "meal_compliance", "measurements"].flatMap((table) =>
        LOG_AUTHORSHIP_COLUMNS.map((column) => `${table}.${column}`),
      ),
      "notification_preferences.coach_log_updates",
    ]);
    // notification_type has no CHECK, so the new type needs no constraint change.
    expect(code).not.toMatch(/notification_type/);
  });

  it("records 0039 in the drizzle snapshot chain after 0038", () => {
    const previous = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0038_snapshot.json"), "utf8"),
    ) as { id: string };
    const snapshot = JSON.parse(
      readFileSync(join(drizzleDir, "meta/0039_snapshot.json"), "utf8"),
    ) as {
      id: string;
      prevId: string;
      tables: Record<
        string,
        {
          columns: Record<string, { type: string; notNull: boolean; default?: unknown }>;
          indexes: Record<string, { columns: string[]; isUnique: boolean }>;
          foreignKeys: Record<string, { tableTo: string; onDelete: string }>;
          checkConstraints: Record<string, { value: string }>;
        }
      >;
    };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.id).not.toBe(previous.id);
    for (const table of ["workout_executions", "meal_compliance", "measurements"]) {
      const entry = snapshot.tables[table]!;
      expect(entry.columns.logged_by_role).toMatchObject({
        type: "text",
        notNull: true,
        default: "'trainee'",
      });
      expect(entry.columns.last_edited_by_role).toMatchObject({ type: "text", notNull: false });
      expect(entry.foreignKeys[`${table}_logged_by_user_id_users_id_fk`]).toMatchObject({
        tableTo: "users",
        onDelete: "no action",
      });
      expect(entry.foreignKeys[`${table}_last_edited_by_user_id_users_id_fk`]).toMatchObject({
        tableTo: "users",
        onDelete: "no action",
      });
      expect(Object.keys(entry.checkConstraints).sort()).toEqual([
        `${table}_last_edited_by_role_chk`,
        `${table}_logged_by_role_chk`,
      ]);
    }
    expect(
      snapshot.tables.notification_preferences!.columns.coach_log_updates,
    ).toMatchObject({ type: "integer", notNull: true, default: true });
    const events = snapshot.tables.log_edit_events!;
    expect(Object.keys(events.columns)).toEqual(LOG_EDIT_EVENTS_COLUMNS);
    expect(events.indexes.log_edit_events_relationship_created_idx).toMatchObject({
      columns: ["coaching_relationship_id", "created_at"],
      isUnique: false,
    });
    expect(
      Object.values(events.foreignKeys).map((fk) => `${fk.tableTo}:${fk.onDelete}`).sort(),
    ).toEqual(["coaching_relationships:cascade", "users:no action", "users:no action"]);
    expect(Object.keys(events.checkConstraints).sort()).toEqual([
      "log_edit_events_action_chk",
      "log_edit_events_actor_role_chk",
      "log_edit_events_before_json_chk",
      "log_edit_events_entity_type_chk",
    ]);
  });

  it("matches schema.ts: the new columns, table, index and defaults are in the migrated database", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      const byName = <T extends { name: string }>(rows: T[]) =>
        [...rows].sort((a, b) => (a.name < b.name ? -1 : 1));
      const described = (table: string) =>
        (
          handle.sqlite.exec(
            `SELECT name, "notnull", dflt_value FROM pragma_table_info('${table}')`,
          )[0]?.values ?? []
        ).map((row) => ({ name: String(row[0]), notNull: row[1] === 1, dflt: row[2] }));
      const fromSchema = (table: Parameters<typeof getTableConfig>[0]) =>
        getTableConfig(table).columns.map((column) => ({
          name: column.name,
          notNull: column.notNull,
        }));
      const tables = [
        ["workout_executions", workoutExecutions],
        ["meal_compliance", mealCompliance],
        ["measurements", measurements],
        ["notification_preferences", notificationPreferences],
        ["log_edit_events", logEditEvents],
      ] as const;
      for (const [name, table] of tables) {
        expect(
          byName(
            described(name).map(({ name: column, notNull }) => ({ name: column, notNull })),
          ),
          name,
        ).toEqual(byName(fromSchema(table)));
      }
      for (const table of ["workout_executions", "meal_compliance", "measurements"]) {
        const columns = tableColumns(handle.sqlite, table);
        expect(columns.slice(-LOG_AUTHORSHIP_COLUMNS.length), table).toEqual(
          LOG_AUTHORSHIP_COLUMNS,
        );
        expect(described(table).find((c) => c.name === "logged_by_role")).toMatchObject({
          notNull: true,
          dflt: "'trainee'",
        });
      }
      expect(
        described("notification_preferences").find((c) => c.name === "coach_log_updates"),
      ).toMatchObject({ notNull: true, dflt: "1" });
      expect(tableColumns(handle.sqlite, "log_edit_events")).toEqual(LOG_EDIT_EVENTS_COLUMNS);
      expect(indexColumns(handle.sqlite, "log_edit_events_relationship_created_idx")).toEqual([
        "coaching_relationship_id",
        "created_at",
      ]);
      const foreignKeys = (
        handle.sqlite.exec(
          "SELECT \"from\", \"table\", on_delete FROM pragma_foreign_key_list('log_edit_events') ORDER BY \"from\"",
        )[0]?.values ?? []
      ).map((row) => row.map(String));
      expect(foreignKeys).toEqual([
        ["actor_user_id", "users", "NO ACTION"],
        ["coaching_relationship_id", "coaching_relationships", "CASCADE"],
        ["trainee_user_id", "users", "NO ACTION"],
      ]);
      // schema.ts and SQL agree on the notification type list's new member.
      const types = getTableConfig(notifications).columns.find(
        (column) => column.name === "notification_type",
      )!.enumValues;
      expect(types).toContain("coach_log_updated");
    } finally {
      handle.close();
    }
  }, 60_000);

  it("defaults new log rows to trainee-logged, rejects unknown roles, and defaults coach updates on", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      insertPaymentFixtures(handle.sqlite);
      const at = "2026-11-02T05:00:00.000Z";
      const insertMeasurement = (id: string, extra = "", values: unknown[] = []) =>
        handle.sqlite.run(
          `INSERT INTO measurements (id, coaching_relationship_id, trainee_user_id, type, value, unit, observed_at, source, created_at, updated_at${extra ? `, ${extra.split("=")[0]}` : ""}) VALUES (?, 'rel-asha', 'trainee-asha', 'body_weight_kg', 71.5, 'kg', ?, 'trainee_entry', ?, ?${extra ? ", ?" : ""})`,
          [id, at, at, at, ...values],
        );
      insertMeasurement("m-default");
      insertMeasurement("m-coach", "logged_by_role=?", ["coach"]);
      expect(
        handle.sqlite.exec(
          "SELECT id, logged_by_role, logged_by_user_id, last_edited_by_role, last_edited_by_user_id, last_edited_at FROM measurements ORDER BY id",
        )[0]?.values,
      ).toEqual([
        ["m-coach", "coach", null, null, null, null],
        ["m-default", "trainee", null, null, null, null],
      ]);
      expect(() =>
        handle.sqlite.run("UPDATE measurements SET logged_by_role = 'admin' WHERE id = 'm-default'"),
      ).toThrow(/CHECK constraint failed/);
      expect(() =>
        handle.sqlite.run("UPDATE measurements SET logged_by_role = NULL WHERE id = 'm-default'"),
      ).toThrow(/NOT NULL constraint failed/);
      expect(() =>
        handle.sqlite.run(
          "UPDATE measurements SET last_edited_by_role = 'admin' WHERE id = 'm-default'",
        ),
      ).toThrow(/CHECK constraint failed/);
      handle.sqlite.run(
        "UPDATE measurements SET last_edited_by_role = 'coach', last_edited_by_user_id = 'trainer-rahul', last_edited_at = ? WHERE id = 'm-default'",
        [at],
      );
      expect(() =>
        handle.sqlite.run(
          "UPDATE measurements SET last_edited_by_user_id = 'user-missing' WHERE id = 'm-default'",
        ),
      ).toThrow(/FOREIGN KEY constraint failed/);

      // The same CHECKs guard workout and meal rows (inserted with FKs off: only the
      // role columns are under test).
      const loose = await createMemoryDb({ foreignKeys: false });
      try {
        loose.sqlite.run(
          "INSERT INTO workout_executions (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, status, started_at, created_at, updated_at) VALUES ('w1', 'a', 'r', 'p', 't', 'completed', ?, ?, ?)",
          [at, at, at],
        );
        loose.sqlite.run(
          "INSERT INTO meal_compliance (id, assignment_id, coaching_relationship_id, plan_version_id, trainee_user_id, outcome, logged_at, created_at, updated_at) VALUES ('c1', 'a', 'r', 'p', 't', 'confirmed', ?, ?, ?)",
          [at, at, at],
        );
        for (const [table, id] of [
          ["workout_executions", "w1"],
          ["meal_compliance", "c1"],
        ] as const) {
          expect(
            loose.sqlite.exec(`SELECT logged_by_role FROM ${table} WHERE id = '${id}'`)[0]?.values,
          ).toEqual([["trainee"]]);
          expect(() =>
            loose.sqlite.run(`UPDATE ${table} SET logged_by_role = 'admin' WHERE id = '${id}'`),
          ).toThrow(/CHECK constraint failed/);
          expect(() =>
            loose.sqlite.run(
              `UPDATE ${table} SET last_edited_by_role = 'admin' WHERE id = '${id}'`,
            ),
          ).toThrow(/CHECK constraint failed/);
          loose.sqlite.run(
            `UPDATE ${table} SET last_edited_by_role = 'coach' WHERE id = '${id}'`,
          );
        }
      } finally {
        loose.close();
      }

      // A new preference row names no coach_log_updates and reads on.
      handle.sqlite.run(
        "INSERT INTO notification_preferences (user_id, created_at, updated_at) VALUES ('trainee-asha', ?, ?)",
        [at, at],
      );
      expect(
        handle.sqlite.exec(
          "SELECT coach_log_updates, typeof(coach_log_updates) FROM notification_preferences",
        )[0]?.values,
      ).toEqual([[1, "integer"]]);
      assertNoForeignKeyViolations(handle.sqlite);
    } finally {
      handle.close();
    }
  }, 60_000);

  it("stores log edit events with before and after, checks their enums, and cascades with the relationship", async () => {
    const handle = await createMemoryDb({ foreignKeys: true });
    try {
      insertPaymentFixtures(handle.sqlite);
      const at = "2026-11-02T05:00:00.000Z";
      const insertEvent = (
        id: string,
        overrides: Partial<Record<string, string | null>> = {},
      ) => {
        const row: Record<string, string | null> = {
          id,
          coaching_relationship_id: "rel-asha",
          trainee_user_id: "trainee-asha",
          actor_user_id: "trainer-rahul",
          actor_role: "coach",
          entity_type: "measurement",
          entity_id: "m-1",
          action: "edit",
          before_json: '{"value":71.5}',
          after_json: '{"value":70.9}',
          created_at: at,
          ...overrides,
        };
        const columns = Object.keys(row);
        handle.sqlite.run(
          `INSERT INTO log_edit_events (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
          columns.map((column) => row[column]),
        );
      };
      insertEvent("ev-edit");
      insertEvent("ev-create", { action: "create", before_json: null, entity_type: "workout_execution" });
      insertEvent("ev-other", { coaching_relationship_id: "rel-vikram", trainee_user_id: "trainee-vikram" });
      for (const entity of ["workout_execution", "meal_compliance", "measurement"]) {
        insertEvent(`ev-${entity}`, { entity_type: entity });
      }
      insertEvent("ev-trainee", { actor_role: "trainee", actor_user_id: "trainee-asha" });

      const rejected: Array<[string, Record<string, string | null>]> = [
        ["actor role", { actor_role: "admin" }],
        ["entity type", { entity_type: "checkin" }],
        ["action", { action: "delete" }],
        ["edit without before", { action: "edit", before_json: null }],
        ["create with before", { action: "create", before_json: "{}" }],
      ];
      rejected.forEach(([label, overrides], index) => {
        expect(() => insertEvent(`ev-bad-${index}`, overrides), label).toThrow(
          /CHECK constraint failed/,
        );
      });
      expect(() => insertEvent("ev-null-after", { after_json: null })).toThrow(
        /NOT NULL constraint failed/,
      );
      expect(() => insertEvent("ev-no-rel", { coaching_relationship_id: "rel-missing" })).toThrow(
        /FOREIGN KEY constraint failed/,
      );
      expect(() => insertEvent("ev-no-actor", { actor_user_id: "user-missing" })).toThrow(
        /FOREIGN KEY constraint failed/,
      );

      // Removing a relationship, as the demo wipe and the QA reset do, takes its
      // events with it and leaves the other client's.
      handle.sqlite.run("DELETE FROM subscription_versions WHERE coaching_relationship_id = 'rel-asha'");
      handle.sqlite.run("DELETE FROM coaching_relationships WHERE id = 'rel-asha'");
      expect(
        (handle.sqlite.exec("SELECT id FROM log_edit_events ORDER BY id")[0]?.values ?? []).map(
          (row) => String(row[0]),
        ),
      ).toEqual(["ev-other"]);
      assertNoForeignKeyViolations(handle.sqlite);
    } finally {
      handle.close();
    }
  }, 60_000);

  it(
    "applies 0039 to a seeded database: every entry reads trainee-logged, coach updates on, row counts unchanged, foreign keys clean",
    async () => {
      const handle = await createMemoryDb({
        foreignKeys: true,
        librarySeed: true,
        through: "0038_archived_account_state.sql",
      });
      try {
        expect(tableColumns(handle.sqlite, "measurements")).not.toContain("logged_by_role");
        const passwordHash = await hashPassword("FitBud-demo-2026");
        handle.sqlite.exec(
          withoutDeletesFromMissingTables(
            handle.sqlite,
            buildDemoSeedSql({
              referenceInstant: new Date().toISOString(),
              passwordHash,
              libraryIndex: loadDemoLibraryIndex(handle.sqlite),
            }),
          ),
        );
        await yieldToEventLoop();
        const logTables = ["workout_executions", "meal_compliance", "measurements"];
        const contentSql = (table: string) =>
          `SELECT * FROM ${table} ORDER BY id`;
        const before = Object.fromEntries(
          logTables.map((table) => [table, handle.sqlite.exec(contentSql(table))[0]?.values ?? []]),
        );
        for (const table of logTables) {
          expect(before[table]!.length, table).toBeGreaterThan(0);
        }
        const preferencesBefore =
          handle.sqlite.exec("SELECT * FROM notification_preferences ORDER BY user_id")[0]?.values ?? [];
        expect(preferencesBefore.length).toBeGreaterThan(0);
        const countsBefore = tableRowCounts(handle.sqlite);
        expect(countsBefore.log_edit_events).toBeUndefined();

        handle.applyMigrationsFrom("0039_log_authorship.sql");
        await yieldToEventLoop();

        expect(tableRowCounts(handle.sqlite)).toEqual({ ...countsBefore, log_edit_events: 0 });
        assertNoForeignKeyViolations(handle.sqlite);
        for (const table of logTables) {
          expect(
            handle.sqlite.exec(
              `SELECT DISTINCT logged_by_role, logged_by_user_id, last_edited_by_role, last_edited_by_user_id, last_edited_at FROM ${table}`,
            )[0]?.values,
            table,
          ).toEqual([["trainee", null, null, null, null]]);
          // Old columns are untouched: the row prefix equals the pre-migration row.
          const width = before[table]![0]!.length;
          const after = (handle.sqlite.exec(contentSql(table))[0]?.values ?? []).map((row) =>
            row.slice(0, width),
          );
          expect(after, table).toEqual(before[table]);
        }
        expect(
          handle.sqlite.exec(
            "SELECT DISTINCT coach_log_updates, typeof(coach_log_updates) FROM notification_preferences",
          )[0]?.values,
        ).toEqual([[1, "integer"]]);
        const preferencesAfter = (
          handle.sqlite.exec("SELECT * FROM notification_preferences ORDER BY user_id")[0]?.values ?? []
        ).map((row) => row.slice(0, -1));
        expect(preferencesAfter).toEqual(preferencesBefore);
      } finally {
        handle.close();
      }
    },
    120_000,
  );

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
          withoutDeletesFromMissingTables(
            handle.sqlite,
            buildDemoSeedSql({
              referenceInstant: new Date().toISOString(),
              passwordHash,
              libraryIndex,
            }),
          ),
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
