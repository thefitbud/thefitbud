/** Split SQL into complete statements (same semantics as sqlite3.complete_statement). */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  for (const line of sql.split(/\r?\n/)) {
    buf += `${line}\n`;
    if (isCompleteSqlStatement(buf)) {
      const trimmed = buf.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail.length > 0) {
    statements.push(tail);
  }
  return statements;
}

function isCompleteSqlStatement(buffer: string): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < buffer.length; i += 1) {
    const ch = buffer[i];
    if (inSingle) {
      if (ch === "'" && buffer[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      if (ch === '"') {
        inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === ";") {
      return true;
    }
  }
  return false;
}
