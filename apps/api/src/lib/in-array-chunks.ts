/**
 * D1 caps bound parameters per statement at 100. `inArray` lists are split into
 * chunks of at most 90 ids so a filter can carry a few extra parameters.
 */
export const IN_ARRAY_CHUNK_SIZE = 90;

/** Unique ids in first-seen order, split into chunks of at most `size`. */
export function chunkIds<T>(ids: Iterable<T>, size = IN_ARRAY_CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("Chunk size must be a positive integer.");
  }
  const unique = [...new Set(ids)];
  const chunks: T[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/**
 * Runs `query` once per chunk of ids and concatenates the rows in chunk order.
 * No ids means no query.
 */
export async function selectInChunks<T, Row>(
  ids: Iterable<T>,
  query: (chunk: T[]) => Promise<Row[]>,
  size = IN_ARRAY_CHUNK_SIZE,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const chunk of chunkIds(ids, size)) {
    rows.push(...(await query(chunk)));
  }
  return rows;
}
