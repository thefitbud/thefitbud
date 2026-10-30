/**
 * Foreign-key violation rows, shaped like sql.js `exec` values.
 *
 * Use `SELECT * FROM pragma_foreign_key_check`. The sql.js-compat adapter in
 * memory-db runs statements that start with `PRAGMA` through `DatabaseSync.exec`,
 * which returns no rows. `exec("PRAGMA foreign_key_check")` is therefore always
 * empty, and an assertion on that result cannot fail.
 */
export const FOREIGN_KEY_CHECK_SQL = "SELECT * FROM pragma_foreign_key_check";

type SqlExec = {
  exec: (sql: string) => Array<{ values: unknown[][] }>;
};

export function foreignKeyViolations(sqlite: SqlExec): unknown[][] {
  return sqlite.exec(FOREIGN_KEY_CHECK_SQL)[0]?.values ?? [];
}

/** Throws when `pragma_foreign_key_check` reports any row. */
export function assertNoForeignKeyViolations(sqlite: SqlExec): void {
  const violations = foreignKeyViolations(sqlite);
  if (violations.length > 0) {
    throw new Error(
      `foreign_key_check reported ${violations.length} violation(s): ${JSON.stringify(violations)}`,
    );
  }
}
