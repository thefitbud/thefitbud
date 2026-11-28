import { useEffect, useState, type CSSProperties } from "react";
import type { ExerciseLibraryItem } from "@fitbud/contracts";
import { Dumbbell } from "lucide-react";
import { apiClient, resolveApiUrl } from "../../lib/api";

/**
 * Exercise thumbnail (D-W14-49, D-W14-52). Shows the first drawing; with no drawing, or when the
 * image fails to load, one neutral dumbbell line icon on a plain tile, the same for every
 * exercise. Foods have no thumbnail (D-W14-50), so there is no food variant.
 */

const tileStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "var(--card, #fff)",
  color: "var(--ink3)",
  boxShadow: "inset 0 0 0 1px var(--line)",
};

const imgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  display: "block",
};

/** Signed drawing paths by library item id. `null` = looked up, no drawing. */
const thumbCache = new Map<string, string | null>();
const lookups = new Map<string, Promise<void>>();
let reportedFailure = false;

/** A failed image or lookup is silent in the UI; report once per session, never the URL. */
function reportThumbFailure(err?: unknown): void {
  if (reportedFailure) return;
  reportedFailure = true;
  if (import.meta.env.DEV) {
    console.warn("[library-thumb]", err instanceof Error ? err.name : "image-load-failed");
  }
}

/** Remember thumbnails from a library page so plan rows can reuse them without a request. */
export function rememberExerciseThumbnails(items: readonly ExerciseLibraryItem[]): void {
  for (const item of items) thumbCache.set(item.id, item.thumbnailUrl ?? null);
}

function lookupByName(name: string): Promise<void> {
  const existing = lookups.get(name);
  if (existing) return existing;
  const request = apiClient
    .listExerciseLibrary({ q: name, limit: 50 })
    .then((page) => rememberExerciseThumbnails(page.items))
    .catch((err: unknown) => reportThumbFailure(err));
  lookups.set(name, request);
  return request;
}

/**
 * Signed drawing path for a plan exercise. Plan content stores only the library item id, so the
 * first request per name asks the library and every row it returns is cached.
 */
function usePlanExerciseThumbnail(
  libraryItemId: string | undefined,
  name: string,
  enabled: boolean,
): string | null {
  const [, bump] = useState(0);
  const cached = libraryItemId ? thumbCache.get(libraryItemId) : undefined;
  useEffect(() => {
    if (!enabled || !libraryItemId || cached !== undefined) return;
    let live = true;
    void lookupByName(name).then(() => {
      if (live) bump((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [enabled, libraryItemId, name, cached]);
  return cached ?? null;
}

export function LibraryThumb({
  name,
  thumbnailUrl,
  libraryItemId,
}: {
  name: string;
  /** Signed API path from the library item. Leave undefined to resolve it from `libraryItemId`. */
  thumbnailUrl?: string | null;
  /** Library item a plan exercise was added from; used only when `thumbnailUrl` is undefined. */
  libraryItemId?: string;
}) {
  const resolved = usePlanExerciseThumbnail(libraryItemId, name, thumbnailUrl === undefined);
  const path = thumbnailUrl === undefined ? resolved : thumbnailUrl;
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const showImage = Boolean(path) && failedPath !== path;
  return (
    <span
      className="lib-thumb lib-thumb-photo ui-lib-thumb"
      style={tileStyle}
      aria-hidden="true"
      data-testid="library-thumb-exercise"
      data-thumb={showImage ? "image" : "fallback"}
    >
      {showImage && path ? (
        <img
          src={resolveApiUrl(path)}
          alt=""
          loading="lazy"
          decoding="async"
          style={imgStyle}
          onError={() => {
            reportThumbFailure();
            setFailedPath(path);
          }}
        />
      ) : (
        <Dumbbell className="ui-i" size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
    </span>
  );
}
