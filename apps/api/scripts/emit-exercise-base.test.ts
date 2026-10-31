import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../src/test-support/sql-split.js";
import {
  buildExerciseBaseSql,
  mediaStorageKey,
  OUTPUT_FILE,
  readExerciseBase,
  sqlLiteral,
  uuidV5,
} from "./emit-exercise-base.js";

const MEDIA_KEY = /^exercises\/[a-z0-9-]+\/[0-9]+\.(jpg|jpeg|png|webp|gif|mp4)$/;
const { base, instructionsSql } = readExerciseBase();

describe("emit-exercise-base (I2c)", () => {
  it("is deterministic and the committed 03b is the current output", () => {
    const first = buildExerciseBaseSql(base, instructionsSql);
    const second = buildExerciseBaseSql(structuredClone(base), instructionsSql);
    expect(second).toBe(first);
    expect(readFileSync(OUTPUT_FILE, "utf8")).toBe(first);
  });

  it("writes comments the statement splitter cannot misread (no quote or ';' in a comment line)", () => {
    const sql = buildExerciseBaseSql(base, instructionsSql);
    const comments = sql.split("\n").filter((line) => line.startsWith("--"));
    expect(comments.length).toBeGreaterThan(0);
    expect(comments.filter((line) => /['";]/.test(line))).toEqual([]);
    const expected = 1 + base.count * (1 + 6) + // PRAGMA (with header), items, child deletes
      base.exercises.reduce(
        (n, e) => n + e.primary_muscles.length + e.secondary_muscles.length + e.equipment.length + e.aliases.length + e.media.length + e.relations.length,
        0,
      ) + 14037;
    expect(splitSqlStatements(sql)).toHaveLength(expected);
  });

  it("keys the n-th media entry exercises/<slug>/<n>.<ext>", () => {
    expect(mediaStorageKey("bench-press-barbell", 1, "media/bench-press-barbell/everkinetic-0042-start.png")).toBe(
      "exercises/bench-press-barbell/1.png",
    );
    expect(mediaStorageKey("bench-press-barbell", 2, "media/x/y.JPG")).toBe("exercises/bench-press-barbell/2.jpg");
    expect(() => mediaStorageKey("bench-press-barbell", 1, "media/x/y.svg")).toThrow(/unsupported media extension/);
  });

  it("writes one media key per source media entry, all in the key format", () => {
    const sql = buildExerciseBaseSql(base, instructionsSql);
    const keys = [...sql.matchAll(/'(exercises\/[^']+)'/g)].map((m) => m[1]!);
    expect(keys).toHaveLength(base.exercises.reduce((n, e) => n + e.media.length, 0));
    expect(keys.filter((key) => !MEDIA_KEY.test(key))).toEqual([]);
    expect(new Set(keys).size).toBe(keys.length);
    const benchPress = base.exercises.find((e) => e.slug === "bench-press-barbell")!;
    expect(benchPress.media.map((m, i) => mediaStorageKey(benchPress.slug, i + 1, m.file))).toEqual([
      "exercises/bench-press-barbell/1.png",
      "exercises/bench-press-barbell/2.png",
    ]);
  });

  it("refuses a slug that is not safe in a storage key", () => {
    for (const slug of ["farmer's-walk", "Bench-Press", "../media", "push up", "a/b"]) {
      expect(() => mediaStorageKey(slug, 1, "x.png"), slug).toThrow(/not \[a-z0-9-\]\+/);
    }
  });

  it("escapes quotes, so names like Farmer's Walk load as written", () => {
    expect(sqlLiteral("Farmer's Walk")).toBe("'Farmer''s Walk'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(0)).toBe("0");
    const sql = buildExerciseBaseSql(base, instructionsSql);
    const db = new DatabaseSync(":memory:");
    try {
      const statement = splitSqlStatements(sql).find(
        (st) => st.startsWith("INSERT OR REPLACE INTO `exercise_library_items`") && st.includes("'farmer-s-carry'"),
      )!;
      db.exec("CREATE TABLE exercise_library_items (id text PRIMARY KEY, ownership, trainer_user_id, name, name_norm, name_source, description, description_provenance, instructions, primary_muscles_json, secondary_muscles_json, equipment_json, difficulty, status, slug, category_code, movement_pattern_code, logging_type_code, setting, mechanic, force, laterality, safety_note, source_id, source_ref, source_name, review_status, youtube_search_url, steps_source, steps_licence_json, steps_review_required, coaching_provenance, needs_human_review, review_flags_json, origin, seed_version, created_at, updated_at)");
      db.exec(statement);
      const row = db.prepare("SELECT name, slug, created_at FROM exercise_library_items").get() as Record<string, string>;
      expect(row).toEqual({ name: "Farmer's Walk", slug: "farmer-s-carry", created_at: "2026-10-20T18:30:00.000Z" });
    } finally {
      db.close();
    }
  });

  it("derives stable RFC 4122 v5 ids", () => {
    // Python: uuid.uuid5(uuid.NAMESPACE_URL, "https://thefitbud.com")
    expect(uuidV5("https://thefitbud.com")).toBe("86b94276-b586-5954-ac0a-9369c98f3f06");
    expect(uuidV5("a")).toBe(uuidV5("a"));
    expect(uuidV5("a")).not.toBe(uuidV5("b"));
  });

  it("rejects a base whose count does not match its exercises", () => {
    expect(() => buildExerciseBaseSql({ ...base, count: base.count + 1 }, instructionsSql)).toThrow(/count is/);
  });
});
