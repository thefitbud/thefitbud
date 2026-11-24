import { and, eq, gt, lt, or, type SQL, type SQLWrapper } from "drizzle-orm";

/**
 * Opaque cursor pagination helpers.
 * Cursor format is an implementation detail and must not be constructed by clients.
 */
export type CursorPayload = {
  /** Sort key used for ordering (ISO timestamp or comparable string). */
  k: string;
  /** Tie-breaker id. */
  id: string;
};

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return bytesToBase64Url(new TextEncoder().encode(json));
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = new TextDecoder().decode(base64UrlToBytes(cursor));
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (typeof parsed.k !== "string" || typeof parsed.id !== "string") {
      return null;
    }
    return { k: parsed.k, id: parsed.id };
  } catch {
    return null;
  }
}

export function buildPage<T extends { id: string }>(
  items: T[],
  limit: number,
  sortKey: (item: T) => string,
): { items: T[]; nextCursor: string | null } {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;
  const last = pageItems[pageItems.length - 1];
  return {
    items: pageItems,
    nextCursor:
      hasMore && last
        ? encodeCursor({ k: sortKey(last), id: last.id })
        : null,
  };
}

/**
 * Z14-20: a cursor whose sort key has several parts (for example
 * `localDate` then `createdAt`). The parts are packed into `k` as a JSON
 * array; `decodeKeysetCursor` returns null unless the cursor carries exactly
 * `parts` strings, so a tampered or foreign cursor is rejected.
 */
export function encodeKeysetCursor(parts: string[], id: string): string {
  return encodeCursor({ k: JSON.stringify(parts), id });
}

export function decodeKeysetCursor(
  cursor: string,
  parts: number,
): { values: string[]; id: string } | null {
  const payload = decodeCursor(cursor);
  if (!payload || payload.id.length === 0) return null;
  try {
    const values = JSON.parse(payload.k) as unknown;
    if (
      !Array.isArray(values) ||
      values.length !== parts ||
      !values.every((value) => typeof value === "string")
    ) {
      return null;
    }
    return { values: values as string[], id: payload.id };
  } catch {
    return null;
  }
}

export type KeysetColumn = { column: SQLWrapper; direction: "asc" | "desc" };

/**
 * Rows strictly after the cursor row in the order given by `columns` followed
 * by `id` (same direction as the last column). Built as
 * `(c1 > v1) OR (c1 = v1 AND c2 > v2) OR … OR (c1 = v1 AND … AND id > vid)`
 * with `<` for descending columns, so a row added between pages never causes
 * a duplicate or a gap.
 */
export function keysetAfter(
  columns: KeysetColumn[],
  idColumn: SQLWrapper,
  cursor: { values: string[]; id: string },
): SQL {
  const all: Array<KeysetColumn & { value: string }> = [
    ...columns.map((col, index) => ({ ...col, value: cursor.values[index]! })),
    {
      column: idColumn,
      direction: columns[columns.length - 1]?.direction ?? "asc",
      value: cursor.id,
    },
  ];
  const branches = all.map((col, index) => {
    const equalPrefix = all
      .slice(0, index)
      .map((prior) => eq(prior.column as never, prior.value));
    const step =
      col.direction === "asc"
        ? gt(col.column as never, col.value)
        : lt(col.column as never, col.value);
    return equalPrefix.length > 0 ? and(...equalPrefix, step)! : step;
  });
  return or(...branches)!;
}

/** Page slice + next cursor for a multi-part keyset (see `buildPage`). */
export function buildKeysetPage<T>(
  rows: T[],
  limit: number,
  keyOf: (row: T) => { values: string[]; id: string },
): { rows: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  if (!hasMore || last === undefined) return { rows: pageRows, nextCursor: null };
  const key = keyOf(last);
  return { rows: pageRows, nextCursor: encodeKeysetCursor(key.values, key.id) };
}

/**
 * Optional page size for lists that stay unpaged without `limit` (Z14-20,
 * D-W14-26). Returns null when neither `limit` nor `cursor` is present (the
 * caller then answers exactly as before). Same clamp as `GET /clients`:
 * a non-numeric value falls back to 30, then 1–50.
 */
export function optionalPageLimit(
  limitParam: string | undefined,
  cursorParam: string | undefined,
): number | null {
  if (limitParam === undefined && !cursorParam) return null;
  return Math.min(Math.max(Number.parseInt(limitParam ?? "30", 10) || 30, 1), 50);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLength);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
