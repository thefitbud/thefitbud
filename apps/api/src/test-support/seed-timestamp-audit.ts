/**
 * Seed timestamp audit (task QS2): scans every ISO timestamp column of every table
 * the demo seed writes and reports values that cannot be true for the seed's
 * reference instant ("now"):
 *
 * - `after_now`: a fact that already happened (created/updated/logged/completed/
 *   sent/resolved...) stamped later than now. Only schedule columns
 *   (`SCHEDULE_COLUMNS`) may lie in the future.
 * - `after_end`: a row of an ended coaching relationship stamped later than its
 *   `ended_at`, apart from schedule columns and the post-end reactivation flow.
 *
 * Rows that already exist before the demo seed runs (migrations + library seed)
 * are not the demo generator's and are skipped by primary key.
 */
import type { SqlJsCompatDatabase } from "./memory-db.js";

/** Columns that describe when something is scheduled, due or expires: may be after now. */
export const SCHEDULE_COLUMNS = new Set([
  "window_starts_at",
  "window_ends_at",
  "expires_at",
  "paused_until",
  "effective_from",
  "effective_to",
  "due_at",
  "locked_until",
]);

/**
 * Rows reached through a parent that carries the relationship. Tables with a
 * `coaching_relationship_id` / `relationship_id` column are resolved directly.
 */
const RELATIONSHIP_VIA: Record<string, string> = {
  coaching_relationships: "t.id",
  plan_versions: "(select p.coaching_relationship_id from plans p where p.id = t.plan_id)",
  workout_expectations: "(select c.coaching_relationship_id from coaching_configurations c where c.id = t.coaching_configuration_id)",
  nutrition_expectations: "(select c.coaching_relationship_id from coaching_configurations c where c.id = t.coaching_configuration_id)",
  tracking_requirements: "(select c.coaching_relationship_id from coaching_configurations c where c.id = t.coaching_configuration_id)",
  exception_actions: "(select e.coaching_relationship_id from exceptions e where e.id = t.exception_id)",
  exercise_executions: "(select w.coaching_relationship_id from workout_executions w where w.id = t.workout_execution_id)",
  set_executions:
    "(select w.coaching_relationship_id from exercise_executions x join workout_executions w on w.id = x.workout_execution_id where x.id = t.exercise_execution_id)",
  notification_deliveries: "(select n.coaching_relationship_id from notifications n where n.id = t.notification_id)",
};

/**
 * After a relationship ends, the trainer may still offer reactivation and the
 * relationship row records the end itself; these describe the end, not activity.
 */
const AFTER_END_ALLOWED = new Set(["reactivation_requests.created_at", "reactivation_requests.resolved_at", "coaching_relationships.reactivated_at"]);

export type TimestampFinding = {
  kind: "after_now" | "after_end";
  table: string;
  column: string;
  value: string;
  limit: string;
  rowKey: string;
  relationshipId?: string;
};

export type TimestampAudit = {
  findings: TimestampFinding[];
  /** `table.column` -> seeded rows holding an ISO timestamp. */
  scannedColumns: Map<string, number>;
  /** Seeded tables holding timestamps whose rows cannot be tied to a relationship. */
  unscopedTables: string[];
};

type Values = unknown[][];
const ISO_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*";

function query(db: SqlJsCompatDatabase, sql: string): Values {
  return (db.exec(sql)[0]?.values ?? []) as Values;
}

function ident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function userTables(db: SqlJsCompatDatabase): string[] {
  return query(
    db,
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations' and sql not like 'CREATE VIRTUAL TABLE%' order by name",
  ).map((r) => String(r[0]));
}

function pkExpr(db: SqlJsCompatDatabase, table: string): string {
  const pk = query(db, `select name from pragma_table_info('${table}') where pk > 0 order by pk`).map((r) => String(r[0]));
  const cols = pk.length ? pk : ["rowid"];
  return cols.map((c) => `coalesce(t.${ident(c)}, '')`).join(" || '|' || ");
}

/** Primary keys of every row present before the demo seed (migrations + library seed). */
export function snapshotRowKeys(db: SqlJsCompatDatabase): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  for (const table of userTables(db)) {
    const rows = query(db, `select ${pkExpr(db, table)} from ${ident(table)} t`);
    if (rows.length) keys.set(table, new Set(rows.map((r) => String(r[0]))));
  }
  return keys;
}

export function auditSeedTimestamps(
  db: SqlJsCompatDatabase,
  options: { now: string; baseRowKeys: Map<string, Set<string>> },
): TimestampAudit {
  const findings: TimestampFinding[] = [];
  const scannedColumns = new Map<string, number>();
  const unscopedTables: string[] = [];
  const nowMs = Date.parse(options.now);
  const ended = new Map(
    query(db, "select id, ended_at from coaching_relationships where ended_at is not null").map((r) => [String(r[0]), String(r[1])]),
  );

  for (const table of userTables(db)) {
    const columns = query(db, `select name from pragma_table_info('${table}')`).map((r) => String(r[0]));
    const relExpr = RELATIONSHIP_VIA[table]
      ?? (columns.includes("coaching_relationship_id") ? "t.coaching_relationship_id" : columns.includes("relationship_id") ? "t.relationship_id" : null);
    const base = options.baseRowKeys.get(table);
    const key = pkExpr(db, table);
    let hasTimestamps = false;
    for (const column of columns) {
      const rows = query(
        db,
        `select ${key}, t.${ident(column)}, ${relExpr ?? "null"} from ${ident(table)} t where typeof(t.${ident(column)}) = 'text' and t.${ident(column)} glob '${ISO_GLOB}'`,
      ).filter((r) => !base?.has(String(r[0])));
      if (!rows.length) continue;
      hasTimestamps = true;
      const name = `${table}.${column}`;
      scannedColumns.set(name, rows.length);
      for (const [rowKey, raw, rel] of rows) {
        const value = String(raw);
        const ms = Date.parse(value);
        if (Number.isNaN(ms)) continue;
        if (!SCHEDULE_COLUMNS.has(column) && ms > nowMs) {
          findings.push({ kind: "after_now", table, column, value, limit: options.now, rowKey: String(rowKey) });
        }
        const endedAt = rel == null ? undefined : ended.get(String(rel));
        if (endedAt && !SCHEDULE_COLUMNS.has(column) && !AFTER_END_ALLOWED.has(name) && ms > Date.parse(endedAt)) {
          findings.push({ kind: "after_end", table, column, value, limit: endedAt, rowKey: String(rowKey), relationshipId: String(rel) });
        }
      }
    }
    if (hasTimestamps && !relExpr) unscopedTables.push(table);
  }
  return { findings, scannedColumns, unscopedTables };
}

export type OrderViolation = { table: string; rowKey: string; earlier: string; later: string; earlierValue: string; laterValue: string };

/**
 * Seeded rows where `earlier` is after `later` (both set). With no pairs given it checks
 * created_at <= updated_at on every seeded table that has both columns.
 */
export function auditTimestampOrder(
  db: SqlJsCompatDatabase,
  options: { baseRowKeys: Map<string, Set<string>>; pairs?: Array<{ table: string; earlier: string; later: string }> },
): { violations: OrderViolation[]; checkedTables: string[] } {
  const pairs = options.pairs
    ?? userTables(db)
      .filter((table) => {
        const columns = query(db, `select name from pragma_table_info('${table}')`).map((r) => String(r[0]));
        return columns.includes("created_at") && columns.includes("updated_at");
      })
      .map((table) => ({ table, earlier: "created_at", later: "updated_at" }));
  const violations: OrderViolation[] = [];
  for (const { table, earlier, later } of pairs) {
    const base = options.baseRowKeys.get(table);
    const e = `t.${ident(earlier)}`, l = `t.${ident(later)}`;
    const rows = query(
      db,
      `select ${pkExpr(db, table)}, ${e}, ${l} from ${ident(table)} t where ${e} is not null and ${l} is not null and julianday(${e}) > julianday(${l})`,
    ).filter((r) => !base?.has(String(r[0])));
    for (const [rowKey, ev, lv] of rows) {
      violations.push({ table, rowKey: String(rowKey), earlier, later, earlierValue: String(ev), laterValue: String(lv) });
    }
  }
  return { violations, checkedTables: [...new Set(pairs.map((p) => p.table))] };
}

/** One line per (kind, table.column): count plus the latest offending example. */
export function summarizeFindings(findings: TimestampFinding[]): string[] {
  const groups = new Map<string, TimestampFinding[]>();
  for (const f of findings) {
    const k = `${f.kind} ${f.table}.${f.column}`;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, list]) => {
      const worst = list.reduce((a, b) => (a.value > b.value ? a : b));
      return `${k}: ${list.length} row(s), e.g. ${worst.rowKey} = ${worst.value} > ${worst.limit}`;
    });
}
