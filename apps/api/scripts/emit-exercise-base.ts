#!/usr/bin/env node
/**
 * Emit seed/library/sql/03b_exercise_base.sql from the locked exercise base (task I2c).
 *
 * Input (read-only): seed/library/incoming/exercise-base-2026.10.21-v3/exercises.json and
 * exercise_library_instructions.sql. Output is deterministic: the same input gives the same bytes.
 * 03b loads after 03_exercises.sql. It replaces the 353 exercises 03 seeds (same ids and slugs)
 * and adds the rest, so the library holds every exercise in the base.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
export const BASE_DIR = path.join(
  apiRoot,
  "seed",
  "library",
  "incoming",
  "exercise-base-2026.10.21-v3",
);
export const OUTPUT_FILE = path.join(apiRoot, "seed", "library", "sql", "03b_exercise_base.sql");

export type BaseMedia = {
  kind: string;
  frame: string | null;
  file: string;
  source: string;
  source_ref: string | null;
  source_title: string | null;
  source_url: string | null;
  author: string | null;
  licence: string;
  licence_url: string | null;
  attribution: string;
  match_confidence: string | null;
  /** false, true, or a note on how the drawing was changed. */
  modified: boolean | string | null;
};

export type BaseExercise = {
  id: string;
  slug: string;
  name: string;
  name_source: string | null;
  description: string | null;
  description_provenance: string | null;
  youtube_search_url: string;
  category: string;
  movement_pattern: string;
  logging_type: string;
  setting: string | null;
  level: string | null;
  mechanic: string | null;
  force: string | null;
  laterality: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
  equipment: string[];
  steps: string[];
  steps_source: string | null;
  steps_licence: Record<string, unknown> | null;
  steps_review_required: boolean;
  coaching_provenance: string | null;
  safety_note: string | null;
  source: string | null;
  source_ref: string | null;
  source_name: string | null;
  review: { verdict: string | null } | null;
  review_flags: string[] | null;
  needs_human_review: boolean;
  origin: string | null;
  aliases: Array<{
    alias: string;
    alias_norm: string;
    lang: string;
    provenance: string;
    confidence: string;
  }>;
  relations: Array<{ kind: string; target_id: string; method: string; confidence: string }>;
  media: BaseMedia[];
};

export type ExerciseBase = { version: string; generated_at: string; count: number; exercises: BaseExercise[] };

type SqlValue = string | number | null;

/** SQL literal: NULL, a number, or a single-quoted string with quotes doubled. */
export function sqlLiteral(value: SqlValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replace(/'/g, "''")}'`;
}

function insert(table: string, row: Record<string, SqlValue>, conflict: string): string {
  const columns = Object.keys(row).map((c) => `\`${c}\``).join(", ");
  const values = Object.values(row).map(sqlLiteral).join(", ");
  return `INSERT${conflict === "OR REPLACE" ? " OR REPLACE" : ""} INTO \`${table}\` (${columns}) VALUES (${values})${conflict === "OR REPLACE" ? "" : ` ${conflict}`};`;
}

/** RFC 4122 v5 (SHA-1) UUID, so child row ids are stable across runs. */
export function uuidV5(name: string, namespace = URL_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
const ID_PREFIX = "https://thefitbud.com/library/exercise-base";

/** `exercises/<slug>/<n>.<ext>` for the n-th (1-based) media entry; the extension is the source file's. */
export function mediaStorageKey(slug: string, n: number, file: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`exercise slug "${slug}" is not [a-z0-9-]+`);
  }
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!/^(jpg|jpeg|png|webp|gif|mp4)$/.test(ext)) {
    throw new Error(`unsupported media extension "${ext}" for ${slug}`);
  }
  return `exercises/${slug}/${n}.${ext}`;
}

/** The base's `generated_at` (with offset) as the UTC instant the API stores. */
function utcInstant(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`invalid generated_at "${value}"`);
  return new Date(ms).toISOString();
}

const CHILD_TABLES = [
  "exercise_library_muscles",
  "exercise_library_equipment",
  "exercise_library_aliases",
  "exercise_library_instructions",
  "exercise_library_relations",
  "exercise_library_media",
];

/**
 * Builds the 03b SQL. `instructionsSql` is the base's exercise_library_instructions.sql
 * (one INSERT per line, stable ids); its statements are kept as they are.
 */
export function buildExerciseBaseSql(base: ExerciseBase, instructionsSql: string): string {
  if (base.exercises.length !== base.count) {
    throw new Error(`exercise base lists ${base.exercises.length} exercises but count is ${base.count}`);
  }
  const ids = new Set(base.exercises.map((e) => e.id));
  const stamp = utcInstant(base.generated_at);
  const out: string[] = [
    `-- FitBud exercise base ${base.version} (${base.count} exercises). Generated by scripts/emit-exercise-base.ts`,
    `-- from seed/library/incoming/exercise-base-${base.version}/ — do not edit, re-run the script.`,
    "-- Loads after 03_exercises.sql: same ids and slugs for its 353 exercises, replaced in place.",
    "PRAGMA defer_foreign_keys = true;",
    "",
    "-- exercises (global). created_at survives the replace, updated_at is generated_at of the base.",
  ];
  for (const e of base.exercises) {
    if (e.steps.length === 0) throw new Error(`${e.slug} has no steps`);
    if (!e.youtube_search_url) throw new Error(`${e.slug} has no youtube_search_url`);
    const row: Record<string, SqlValue> = {
      id: e.id,
      ownership: "global",
      trainer_user_id: null,
      name: e.name,
      name_norm: e.name.trim().toLowerCase(),
      name_source: e.name_source,
      description: e.description,
      description_provenance: e.description_provenance,
      instructions: e.steps.map((step, i) => `${i + 1}. ${step}`).join("\n"),
      primary_muscles_json: JSON.stringify(e.primary_muscles),
      secondary_muscles_json: JSON.stringify(e.secondary_muscles),
      equipment_json: JSON.stringify(e.equipment),
      difficulty: e.level,
      status: "active",
      slug: e.slug,
      category_code: e.category,
      movement_pattern_code: e.movement_pattern,
      logging_type_code: e.logging_type,
      setting: e.setting,
      mechanic: e.mechanic,
      force: e.force,
      laterality: e.laterality,
      safety_note: e.safety_note,
      source_id: e.source,
      source_ref: e.source_ref,
      source_name: e.source_name,
      review_status: e.review?.verdict ?? null,
      youtube_search_url: e.youtube_search_url,
      steps_source: e.steps_source,
      steps_licence_json: e.steps_licence ? JSON.stringify(e.steps_licence) : null,
      steps_review_required: e.steps_review_required ? 1 : 0,
      coaching_provenance: e.coaching_provenance,
      needs_human_review: e.needs_human_review ? 1 : 0,
      review_flags_json: JSON.stringify(e.review_flags ?? []),
      origin: e.origin,
      seed_version: base.version,
      created_at: null,
      updated_at: stamp,
    };
    const sql = insert("exercise_library_items", row, "OR REPLACE").replace(
      `, NULL, ${sqlLiteral(stamp)});`,
      `, COALESCE((SELECT \`created_at\` FROM \`exercise_library_items\` WHERE \`id\` = ${sqlLiteral(e.id)}), ${sqlLiteral(stamp)}), ${sqlLiteral(stamp)});`,
    );
    out.push(sql);
  }

  out.push("", "-- child rows: cleared per exercise, then written from the base.");
  for (const e of base.exercises) {
    for (const table of CHILD_TABLES) {
      out.push(`DELETE FROM \`${table}\` WHERE \`exercise_library_item_id\` = ${sqlLiteral(e.id)};`);
    }
  }
  for (const e of base.exercises) {
    for (const [role, muscles] of [
      ["primary", e.primary_muscles],
      ["secondary", e.secondary_muscles],
    ] as const) {
      for (const muscle of muscles) {
        out.push(
          insert(
            "exercise_library_muscles",
            { exercise_library_item_id: e.id, muscle_code: muscle, role },
            "ON CONFLICT(`exercise_library_item_id`, `muscle_code`) DO NOTHING",
          ),
        );
      }
    }
    for (const equipment of e.equipment) {
      out.push(
        insert(
          "exercise_library_equipment",
          { exercise_library_item_id: e.id, equipment_code: equipment },
          "ON CONFLICT DO NOTHING",
        ),
      );
    }
    for (const a of e.aliases) {
      out.push(
        insert(
          "exercise_library_aliases",
          {
            id: uuidV5(`${ID_PREFIX}/alias/${e.id}/${a.lang}/${a.alias_norm}`),
            exercise_library_item_id: e.id,
            alias: a.alias,
            alias_norm: a.alias_norm,
            lang: a.lang,
            provenance: a.provenance,
            confidence: a.confidence,
            seed_version: base.version,
          },
          "ON CONFLICT DO NOTHING",
        ),
      );
    }
    e.media.forEach((m, index) => {
      const n = index + 1;
      out.push(
        insert(
          "exercise_library_media",
          {
            id: uuidV5(`${ID_PREFIX}/media/${e.id}/${n}`),
            exercise_library_item_id: e.id,
            kind: m.kind,
            frame: m.frame,
            storage_key: mediaStorageKey(e.slug, n, m.file),
            source_id: m.source,
            source_ref: m.source_ref,
            source_title: m.source_title,
            source_url: m.source_url,
            author: m.author,
            licence: m.licence,
            licence_url: m.licence_url,
            attribution: m.attribution,
            match_confidence: m.match_confidence,
            modified: m.modified ? 1 : 0,
            sort_order: index,
          },
          "ON CONFLICT(`id`) DO NOTHING",
        ),
      );
    });
  }
  out.push("", "-- relations (every target is in the base).");
  for (const e of base.exercises) {
    for (const r of e.relations) {
      if (!ids.has(r.target_id)) throw new Error(`${e.slug} relates to unknown exercise ${r.target_id}`);
      out.push(
        insert(
          "exercise_library_relations",
          {
            exercise_library_item_id: e.id,
            related_exercise_id: r.target_id,
            kind: r.kind,
            method: r.method,
            confidence: r.confidence,
          },
          "ON CONFLICT DO NOTHING",
        ),
      );
    }
  }

  const instructionLines = instructionsSql
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !line.startsWith("--"));
  for (const line of instructionLines) {
    if (!line.startsWith("INSERT OR REPLACE INTO `exercise_library_instructions`") || !line.endsWith(");")) {
      throw new Error(`unexpected line in exercise_library_instructions.sql: ${line.slice(0, 80)}`);
    }
  }
  out.push("", `-- steps, cues and mistakes: ${instructionLines.length} rows from exercise_library_instructions.sql.`);
  out.push(...instructionLines);
  return `${out.join("\n")}\n`;
}

export function readExerciseBase(dir = BASE_DIR): { base: ExerciseBase; instructionsSql: string } {
  return {
    base: JSON.parse(readFileSync(path.join(dir, "exercises.json"), "utf8")) as ExerciseBase,
    instructionsSql: readFileSync(path.join(dir, "exercise_library_instructions.sql"), "utf8"),
  };
}

function main(): void {
  const { base, instructionsSql } = readExerciseBase();
  const sql = buildExerciseBaseSql(base, instructionsSql);
  writeFileSync(OUTPUT_FILE, sql);
  console.log(`Wrote ${path.relative(apiRoot, OUTPUT_FILE)}: ${base.count} exercises (${base.version}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
