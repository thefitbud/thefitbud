/**
 * Split a seed SQL file into chunks of at most `maxBytes` (UTF-8), only between statements
 * (task I2d). Statement boundaries follow src/test-support/sql-split.ts. Each chunk runs as its
 * own `wrangler d1 execute`, so leading PRAGMA statements (e.g. defer_foreign_keys) are repeated
 * at the top of every later chunk. Leading comment-only fragments stay in the first chunk.
 */
import { splitSqlStatements } from "../../src/test-support/sql-split.js";

export const MAX_CHUNK_BYTES = 5 * 1024 * 1024;

function withoutComments(statement: string): string {
  return statement
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim();
}

/** A leading PRAGMA, or a comment-only fragment (a ';' inside a header comment ends one). */
function isLead(statement: string): boolean {
  const code = withoutComments(statement);
  return code === "" || /^PRAGMA\b/i.test(code);
}

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/** Chunks in file order; a file that fits is returned as one chunk of its statements. */
export function chunkSqlStatements(sql: string, maxBytes = MAX_CHUNK_BYTES): string[] {
  const statements = splitSqlStatements(sql);
  let lead = 0;
  while (lead < statements.length && isLead(statements[lead]!)) lead += 1;
  // The first chunk keeps the whole lead in order; later chunks repeat only its PRAGMAs.
  const leadText = statements.slice(0, lead).map((s) => `${s}\n`).join("");
  const header = statements
    .slice(0, lead)
    .filter((s) => withoutComments(s) !== "")
    .map((s) => `${s}\n`)
    .join("");
  const body = statements.slice(lead);

  const headerBytes = bytes(leadText);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentBytes = headerBytes;
  for (const statement of body) {
    const piece = `${statement}\n`;
    const pieceBytes = bytes(piece);
    if (headerBytes + pieceBytes > maxBytes) {
      throw new Error(`a single statement is ${pieceBytes} bytes, over the ${maxBytes}-byte chunk limit`);
    }
    if (current.length > 0 && currentBytes + pieceBytes > maxBytes) {
      chunks.push((chunks.length === 0 ? leadText : header) + current.join(""));
      current = [];
      currentBytes = bytes(header);
    }
    current.push(piece);
    currentBytes += pieceBytes;
  }
  if (current.length > 0 || leadText) {
    chunks.push((chunks.length === 0 ? leadText : header) + current.join(""));
  }
  return chunks;
}
