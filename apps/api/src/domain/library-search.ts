import { sql } from "drizzle-orm";

export function buildFtsPrefixQuery(raw: string): string | null {
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) {
    return null;
  }
  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(" ");
}

export function foodFtsMatchClause(matchQuery: string) {
  return sql`food_search_fts MATCH ${matchQuery}`;
}

export function exerciseFtsMatchClause(matchQuery: string) {
  return sql`exercise_search_fts MATCH ${matchQuery}`;
}
