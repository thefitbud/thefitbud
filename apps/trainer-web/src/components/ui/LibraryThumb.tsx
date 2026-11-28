import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

/**
 * True once the tile is within ~400 px of the viewport (or any scroll container). Library lists hold
 * dozens of rows; an offscreen `<img loading="lazy">` never starts, so it would sit in the DOM as an
 * unloaded image. Mounting the `<img>` only when it is near keeps every image in the DOM one that is
 * loading or loaded. Without IntersectionObserver (old browsers, jsdom) it is always true.
 */
function useNearViewport(): [(node: HTMLElement | null) => void, boolean] {
  const supported = typeof IntersectionObserver !== "undefined";
  const [near, setNear] = useState(!supported);
  const observer = useRef<IntersectionObserver | null>(null);
  const ref = useCallback((node: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(node);
    observer.current = io;
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, near];
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
  const [tileRef, near] = useNearViewport();
  const showImage = Boolean(path) && failedPath !== path;
  // Not near yet: an empty tile, no `<img>` (and no dumbbell, so nothing flashes when it loads in).
  const pending = showImage && !near;
  return (
    <span
      ref={tileRef}
      className="lib-thumb lib-thumb-photo ui-lib-thumb"
      style={tileStyle}
      aria-hidden="true"
      data-testid="library-thumb-exercise"
      data-thumb={showImage ? "image" : "fallback"}
      data-thumb-state={pending ? "pending" : undefined}
    >
      {pending ? null : showImage && path ? (
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
