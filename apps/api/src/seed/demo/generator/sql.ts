/** Multi-row INSERT builder (≤200 rows and ≤90 KB per statement; D1 limit is 100 KB). */
import { sqlQuote } from "../ids.js";

export type SqlValue = string | number | boolean | null | undefined;

/** Parents before children (FKs are checked per statement in local SQLite). */
export const TABLE_ORDER = [
  "plan_templates",
  "onboarding_form_templates",
  "onboarding_form_versions",
  "checkin_form_templates",
  "checkin_form_versions",
  "client_invitations",
  "coaching_relationships",
  "onboarding_form_responses",
  "onboarding_reviews",
  "coaching_configurations",
  "workout_expectations",
  "nutrition_expectations",
  "checkin_schedules",
  "tracking_requirements",
  "subscription_versions",
  "plans",
  "plan_versions",
  "meal_assignments",
  "workout_assignments",
  "meal_compliance",
  "workout_executions",
  "exercise_executions",
  "set_executions",
  "checkins",
  "checkin_reviews",
  "measurements",
  "trainer_notes",
  "exceptions",
  "exception_actions",
  "coach_asks",
  "reactivation_requests",
  "meal_time_overrides",
  "trainee_custom_foods",
  "notification_preferences",
  "device_tokens",
  "reminder_rules",
  "reminder_states",
  "notifications",
] as const;
export type SeedTable = (typeof TABLE_ORDER)[number];

function literal(value: SqlValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Demo seed: non-finite number ${value}`);
    return String(value);
  }
  return sqlQuote(value);
}

export class SeedRows {
  private readonly tables = new Map<string, { columns: string[]; rows: string[] }>();
  private readonly counts = new Map<string, number>();

  add(table: SeedTable, record: Record<string, SqlValue>): void {
    let entry = this.tables.get(table);
    if (!entry) {
      entry = { columns: Object.keys(record), rows: [] };
      this.tables.set(table, entry);
    }
    const values = entry.columns.map((column) => {
      if (!(column in record)) throw new Error(`Demo seed: ${table} row missing ${column}`);
      return literal(record[column]);
    });
    if (Object.keys(record).length !== entry.columns.length) {
      throw new Error(`Demo seed: ${table} row has extra columns ${Object.keys(record).join(",")}`);
    }
    entry.rows.push(`(${values.join(", ")})`);
    this.counts.set(table, (this.counts.get(table) ?? 0) + 1);
  }

  rowCounts(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }

  /** One SQL string per table, in TABLE_ORDER. */
  statements(): Array<{ table: string; sql: string }> {
    const out: Array<{ table: string; sql: string }> = [];
    for (const table of TABLE_ORDER) {
      const entry = this.tables.get(table);
      if (!entry) continue;
      const head = `INSERT INTO ${table} (${entry.columns.map((c) => (c === "order" ? '"order"' : c)).join(", ")}) VALUES\n`;
      let chunk: string[] = [];
      let size = head.length;
      const flush = () => {
        if (chunk.length === 0) return;
        out.push({ table, sql: `${head}${chunk.join(",\n")};` });
        chunk = [];
        size = head.length;
      };
      for (const row of entry.rows) {
        if (chunk.length >= 200 || size + row.length > 90_000) flush();
        chunk.push(row);
        size += row.length + 2;
      }
      flush();
    }
    return out;
  }
}
