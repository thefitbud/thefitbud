import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb } from "../db/client";
import { exerciseLibraryMedia } from "../db/schema";
import { fail } from "../lib/envelope";
import {
  fileSigningSecret,
  signFileAccessToken,
  verifyFileAccessToken,
} from "../lib/files";
import { mediaKey } from "../lib/media-key";
import { operation, signedFileParameters } from "../openapi/document";
import { optionalAuthMiddleware } from "../middleware/auth";
import type { Env, Variables } from "../types";

/**
 * Library exercise drawings (Z14-48). Library media is global, so any signed-in user may
 * read it. An `<img>` tag cannot send a bearer token, so the exercise payload carries a
 * signed path (`exp` + `sig`, the same scheme as /files/:id/content) next to the credit.
 * The storage key never leaves the API: the row is looked up by id in D1 and only then is
 * the object read from R2.
 */
export const libraryMediaRoutes = new Hono<{
  Bindings: Env;
  Variables: Variables;
}>();

export const LIBRARY_MEDIA_PATH = "/library/exercise-media";
const DAY_SECONDS = 24 * 60 * 60;

/** Domain-separated so a files token can never open a library drawing or the reverse. */
function tokenSubject(mediaId: string): string {
  return `exercise-media:${mediaId}`;
}

/**
 * Signed, relative path for one drawing. The expiry is the end of the next UTC day
 * (24 to 48 hours out), so the URL is identical for every request on the same day and the
 * browser can cache the image.
 */
export async function signedExerciseMediaPath(
  env: Pick<Env, "MEDIA_SIGNING_SECRET" | "ENVIRONMENT">,
  mediaId: string,
  nowMs: number = Date.now(),
): Promise<string> {
  const exp = (Math.floor(nowMs / 1000 / DAY_SECONDS) + 2) * DAY_SECONDS;
  const sig = await signFileAccessToken({
    mediaAssetId: tokenSubject(mediaId),
    expiresAtUnix: exp,
    secret: fileSigningSecret(env.MEDIA_SIGNING_SECRET, env.ENVIRONMENT),
  });
  return `${LIBRARY_MEDIA_PATH}/${mediaId}?exp=${exp}&sig=${sig}`;
}

libraryMediaRoutes.get(
  "/:mediaId",
  operation({
    tag: "Libraries",
    summary: "Downloads a library exercise drawing",
    description:
      "Returns the drawing bytes for a library exercise media id. A session or a signed exp and sig query authorizes the read. The body is not a data envelope.",
    parameters: [...signedFileParameters()],
    binaryResponse: true,
    errors: [
      { status: 404, description: "Drawing not found." },
      { status: 503, description: "File storage is not configured." },
    ],
  }),
  optionalAuthMiddleware,
  async (c) => {
    const mediaId = c.req.param("mediaId");
    const exp = c.req.query("exp");
    const sig = c.req.query("sig");

    let authorized = false;
    if (exp && sig) {
      authorized = await verifyFileAccessToken({
        mediaAssetId: tokenSubject(mediaId),
        expiresAtUnix: Number(exp),
        token: sig,
        secret: fileSigningSecret(c.env.MEDIA_SIGNING_SECRET, c.env.ENVIRONMENT),
      });
    } else {
      authorized = Boolean(c.get("actor")?.selectedRole);
    }
    if (!authorized) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication required.");
    }

    const bucket = c.env.MEDIA;
    if (!bucket) {
      return fail(
        c,
        503,
        "MEDIA_BUCKET_UNAVAILABLE",
        "File storage is not configured.",
      );
    }

    const db = createDb(c.env.DB);
    const rows = await db
      .select({ storageKey: exerciseLibraryMedia.storageKey })
      .from(exerciseLibraryMedia)
      .where(eq(exerciseLibraryMedia.id, mediaId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return fail(c, 404, "LIBRARY_MEDIA_NOT_FOUND", "Drawing not found.");
    }

    const object = await bucket.get(mediaKey(c.env, row.storageKey));
    if (!object) {
      // Id only: the storage key is never logged.
      console.warn("library media object missing", { mediaId });
      return fail(c, 404, "LIBRARY_MEDIA_NOT_FOUND", "Drawing not found.");
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("cache-control", "private, max-age=86400, immutable");
    return new Response(object.body, { headers });
  },
);
