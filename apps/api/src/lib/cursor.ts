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
