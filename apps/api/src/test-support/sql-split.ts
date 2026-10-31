/**
 * Split SQL into complete statements (same semantics as sqlite3.complete_statement).
 *
 * Scans each line once, carrying quote state across lines, so splitting is linear in
 * the input size (the full demo seed is ~37 MB with very long multi-line statements).
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let parts: string[] = [];
  const state: QuoteState = { inSingle: false, inDouble: false };
  for (const line of sql.split(/\r?\n/)) {
    const chunk = `${line}\n`;
    parts.push(chunk);
    if (scanForStatementEnd(chunk, state)) {
      const trimmed = parts.join("").trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      parts = [];
      state.inSingle = false;
      state.inDouble = false;
    }
  }
  const tail = parts.join("").trim();
  if (tail.length > 0) {
    statements.push(tail);
  }
  return statements;
}

type QuoteState = { inSingle: boolean; inDouble: boolean };

/** Advances quote state over `chunk`; true once a `;` outside quotes is seen. */
function scanForStatementEnd(chunk: string, state: QuoteState): boolean {
  for (let i = 0; i < chunk.length; i += 1) {
    const ch = chunk[i];
    if (state.inSingle) {
      if (ch === "'" && chunk[i + 1] === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        state.inSingle = false;
      }
      continue;
    }
    if (state.inDouble) {
      if (ch === '"') {
        state.inDouble = false;
      }
      continue;
    }
    if (ch === "'") {
      state.inSingle = true;
      continue;
    }
    if (ch === '"') {
      state.inDouble = true;
      continue;
    }
    if (ch === ";") {
      return true;
    }
  }
  return false;
}
