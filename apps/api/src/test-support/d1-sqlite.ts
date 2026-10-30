import { DatabaseSync, type StatementResultingChanges } from "node:sqlite";

type SqlValue = string | number | bigint | Uint8Array | null;

function toSqlValue(value: unknown): SqlValue {
  if (value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value === null
  ) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  return String(value);
}

type BoundStatement = {
  bind: (...values: unknown[]) => BoundStatement;
  all: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
  first: <T = unknown>(column?: string) => Promise<T | null>;
  run: () => Promise<D1Response>;
  raw: <T = unknown[]>() => Promise<T[]>;
};

function metaFromChanges(meta: StatementResultingChanges): D1Meta {
  return {
    changes: Number(meta.changes),
    last_row_id: Number(meta.lastInsertRowid),
    duration: 0,
    rows_read: 0,
    rows_written: Number(meta.changes),
    changed_db: meta.changes > 0,
    size_after: 0,
  };
}

function prepareBound(stmt: ReturnType<DatabaseSync["prepare"]>): BoundStatement {
  let bound: SqlValue[] = [];
  const self: BoundStatement = {
    bind(...values: unknown[]) {
      bound = values.map(toSqlValue);
      return self;
    },
    async all<T = Record<string, unknown>>() {
      const rows = stmt.all(...bound) as T[];
      return {
        results: rows,
        success: true,
        meta: metaFromChanges({ changes: 0, lastInsertRowid: 0 }),
      } as D1Result<T>;
    },
    async first<T = unknown>(column?: string) {
      const row = stmt.get(...bound) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return null;
      }
      if (column !== undefined) {
        return row[column] as T;
      }
      return row as T;
    },
    async run() {
      const meta = stmt.run(...bound) as StatementResultingChanges;
      return {
        success: true,
        meta: metaFromChanges(meta),
      } as D1Response;
    },
    async raw<T = unknown[]>() {
      stmt.setReturnArrays(true);
      const rows = stmt.all(...bound) as unknown as unknown[][];
      return rows as T[];
    },
  };
  return self;
}

export type D1QueryCounter = {
  count: number;
  reset: () => void;
};

export function wrapD1WithQueryCounter(
  d1: D1Database,
  counter: D1QueryCounter,
): D1Database {
  const prepare = d1.prepare.bind(d1);
  return {
    ...d1,
    prepare(query: string) {
      counter.count += 1;
      return prepare(query);
    },
  } as D1Database;
}

export function createD1Database(sqlite: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query);
      stmt.setReturnArrays(false);
      return prepareBound(stmt);
    },
    async batch<T extends D1PreparedStatement[]>(statements: T) {
      // D1 runs a batch as one SQL transaction: if any statement fails the
      // whole sequence rolls back. Mirror that so tests can prove atomicity.
      const results: D1Result[] = [];
      sqlite.exec("SAVEPOINT d1_batch");
      try {
        for (const statement of statements) {
          const runResult = await (statement as BoundStatement).run();
          results.push({
            success: runResult.success,
            meta: runResult.meta,
            results: [],
          });
        }
      } catch (error) {
        sqlite.exec("ROLLBACK TO d1_batch");
        sqlite.exec("RELEASE d1_batch");
        throw error;
      }
      sqlite.exec("RELEASE d1_batch");
      return results;
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new Uint8Array();
    },
  } as unknown as D1Database;
}
