import { isNetworkFailure, userFacingMessage, type FitBudApiClient } from "@fitbud/api-client";
import type { MealAssignment } from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";
import { invalidateRelationshipDayData, messageFromSyncResults } from "./dataCache";

export class MealSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MealSyncError";
  }
}

/** The meal photo as it goes to the server (D-W14-11): 1600 px long edge, JPEG ~0.7. */
export const MEAL_PHOTO_MAX_EDGE = 1600;
export const MEAL_PHOTO_QUALITY = 0.7;
export const MEAL_PHOTO_CONTENT_TYPE = "image/jpeg";

export type MealPhotoSource = "camera" | "gallery";
export type PickedPhoto = { uri: string; width: number; height: number };

export type MealPhotoFailure = "permission" | "prepare" | "upload" | "attach";

/**
 * A meal photo step that failed. `message` is static trainee-facing copy
 * (AGENTS.md: never the raw error); the cause goes to `reportError`.
 */
export class MealPhotoError extends Error {
  readonly step: MealPhotoFailure;
  /** Set when the upload worked and only the attach failed: a retry skips the upload. */
  mediaAssetId: string | null = null;
  constructor(step: MealPhotoFailure, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "MealPhotoError";
    this.step = step;
  }
}

/** The resize that brings the long edge to 1600 px; null when already small enough. */
export function mealPhotoResize(
  width: number,
  height: number,
): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= MEAL_PHOTO_MAX_EDGE) return null;
  return width >= height
    ? { width: MEAL_PHOTO_MAX_EDGE }
    : { height: MEAL_PHOTO_MAX_EDGE };
}

/**
 * Opens the camera or the gallery. Returns null when the trainee backed out.
 * Throws a `MealPhotoError("permission")` when access was refused.
 */
export async function pickMealPhoto(
  source: MealPhotoSource,
): Promise<PickedPhoto | null> {
  const picker = await import("expo-image-picker");
  const permission =
    source === "camera"
      ? await picker.requestCameraPermissionsAsync()
      : await picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MealPhotoError(
      "permission",
      source === "camera"
        ? "FitBud can't use the camera. Allow it in your phone's settings, or choose from the gallery."
        : "FitBud can't open your photos. Allow it in your phone's settings, or take a photo.",
    );
  }
  const options = { mediaTypes: ["images" as const], quality: 1 };
  const result =
    source === "camera"
      ? await picker.launchCameraAsync(options)
      : await picker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** The prepared JPEG as text, for the device store (a photo waiting to send). */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : -1;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : -1;
    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 3) << 4) | (b < 0 ? 0 : b >> 4)];
    out += b < 0 ? "=" : BASE64_ALPHABET[((b & 15) << 2) | (c < 0 ? 0 : c >> 6)];
    out += c < 0 ? "=" : BASE64_ALPHABET[c & 63];
  }
  return out;
}

export function base64ToBytes(base64: string): Uint8Array {
  const alphabet = BASE64_ALPHABET;
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = alphabet.indexOf(clean[i]!);
    const b = alphabet.indexOf(clean[i + 1]!);
    const c = i + 2 < clean.length ? alphabet.indexOf(clean[i + 2]!) : -1;
    const d = i + 3 < clean.length ? alphabet.indexOf(clean[i + 3]!) : -1;
    out[o++] = (a << 2) | (b >> 4);
    if (c >= 0) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) out[o++] = ((c & 3) << 6) | d;
  }
  return out.slice(0, o);
}

/** Resizes to 1600 px on the long edge and re-encodes as JPEG at ~0.7. */
export async function prepareMealPhoto(
  picked: PickedPhoto,
): Promise<{ uri: string; bytes: Uint8Array }> {
  try {
    const manipulator = await import("expo-image-manipulator");
    const resize = mealPhotoResize(picked.width, picked.height);
    const out = await manipulator.manipulateAsync(
      picked.uri,
      resize ? [{ resize }] : [],
      {
        compress: MEAL_PHOTO_QUALITY,
        format: manipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!out.base64) throw new Error("manipulator returned no data");
    return { uri: out.uri, bytes: base64ToBytes(out.base64) };
  } catch (err) {
    throw new MealPhotoError(
      "prepare",
      "Couldn't get that photo ready. Try another one.",
      err,
    );
  }
}

/** Uploads the prepared photo through the files flow and returns its media asset id. */
export async function uploadMealPhotoFile(
  api: FitBudApiClient,
  relationshipId: string,
  assignmentId: string,
  bytes: Uint8Array,
  /** The photo job's upload key: a retry gets the same media asset back. */
  uploadKey: string = createIdempotencyKey(),
): Promise<string> {
  const target = await api.createUploadTarget(
    {
      coachingRelationshipId: relationshipId,
      mediaType: "meal_photo",
      contentType: MEAL_PHOTO_CONTENT_TYPE,
      originalFilename: `meal-${assignmentId}.jpg`,
    },
    uploadKey,
  );
  await api.uploadMediaContent(
    target.mediaAsset.id,
    bytes,
    MEAL_PHOTO_CONTENT_TYPE,
  );
  return target.mediaAsset.id;
}

/**
 * Uploads the photo and attaches it to the logged entry (Z14-11). The
 * `attachKey` is the job's idempotency key: a retry reuses it. A retry after
 * a successful upload reuses `mediaAssetId` instead of uploading again.
 */
export async function uploadAndAttachMealPhoto(
  api: FitBudApiClient,
  input: {
    relationshipId: string;
    assignmentId: string;
    entryId: string;
    bytes: Uint8Array;
    attachKey: string;
    /** Reused on a retry so the upload target is the same media asset. */
    uploadKey?: string;
    mediaAssetId?: string | null;
    /** Called once the file is up, before the attach: the job keeps the id. */
    onUploaded?: (mediaAssetId: string) => Promise<void> | void;
  },
): Promise<{ mediaAssetId: string }> {
  let mediaAssetId = input.mediaAssetId ?? null;
  if (!mediaAssetId) {
    try {
      mediaAssetId = await uploadMealPhotoFile(
        api,
        input.relationshipId,
        input.assignmentId,
        input.bytes,
        input.uploadKey,
      );
    } catch (err) {
      throw new MealPhotoError("upload", mealPhotoFailureCopy(err), err);
    }
    await input.onUploaded?.(mediaAssetId);
  }
  try {
    await api.attachMealPhoto(
      input.entryId,
      { mediaAssetId },
      input.attachKey,
    );
  } catch (err) {
    const wrapped = new MealPhotoError("attach", mealPhotoFailureCopy(err), err);
    wrapped.mediaAssetId = mediaAssetId;
    throw wrapped;
  }
  return { mediaAssetId };
}

/**
 * What went wrong, in words: a connection problem says so (the photo job
 * then waits instead of failing); anything else is TR-07m3's copy, which
 * also says the meal itself is safe.
 */
export function mealPhotoFailureCopy(err: unknown): string {
  if (isNetworkFailure(err)) return userFacingMessage(err);
  return "Photo didn't upload. Your meal is still logged.";
}

/**
 * Throws the trainee-facing copy for a verdict the caller waited for. Meal
 * logs no longer wait (Z14-2, D-W14-6): `enqueueAndPush` returns once the log
 * is on the phone, `results` is empty, and a refusal reaches the screen
 * through the outbox row (sync status, with the server's message). Kept for
 * a caller that asks for the verdict with `wait`.
 */
function assertSyncOk(
  results: Awaited<ReturnType<typeof enqueueAndPush>>["results"],
  coachName?: string,
) {
  const message = messageFromSyncResults(results, coachName);
  if (message) throw new MealSyncError(message);
}

/**
 * Marks the relationship's day views stale: the screens keep what they show
 * (with the outbox overlay on top) and refresh in the background.
 */
function afterMealMutation(relationshipId: string) {
  invalidateRelationshipDayData(relationshipId);
}

export async function confirmMealAssignment(
  _api: FitBudApiClient,
  sync: SyncEngine,
  relationshipId: string,
  assignment: MealAssignment,
  coachName?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.confirm",
    payload: {
      assignmentId: assignment.id,
      // Display only: the outbox sheet names the meal offline (Z12-41 hand-off).
      mealName: assignment.mealName,
      body: { photoIntent: null },
    },
  });
  assertSyncOk(results, coachName);
  afterMealMutation(relationshipId);
}

export async function skipMealAssignment(
  sync: SyncEngine,
  assignment: MealAssignment,
  notes?: string | null,
  coachName?: string,
  relationshipId?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.skip",
    payload: {
      assignmentId: assignment.id,
      // Display only: the outbox sheet names the meal offline (Z12-41 hand-off).
      mealName: assignment.mealName,
      body: { notes: notes ?? null },
    },
  });
  assertSyncOk(results, coachName);
  if (relationshipId) afterMealMutation(relationshipId);
}

export async function deviateMealAssignment(
  sync: SyncEngine,
  assignment: MealAssignment,
  body: Record<string, unknown>,
  coachName?: string,
  relationshipId?: string,
): Promise<void> {
  const { results } = await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "meal.deviate",
    payload: {
      assignmentId: assignment.id,
      // Display only: the outbox sheet names the meal offline (Z12-41 hand-off).
      mealName: assignment.mealName,
      body,
    },
  });
  assertSyncOk(results, coachName);
  if (relationshipId) afterMealMutation(relationshipId);
}

/** Meal ids whose log is still in the outbox (saved on this phone, not sent). */
export function pendingMealLogIds(
  outbox: ReadonlyArray<{ status: string; operation: string; recordId: string }>,
): Set<string> {
  return new Set(
    outbox
      .filter(
        (row) =>
          (row.status === "pending" || row.status === "in_flight") &&
          (row.operation === "meal.confirm" || row.operation === "meal.skip"),
      )
      .map((row) => row.recordId),
  );
}

/**
 * Day-summary note for confirmed meals the server has not received yet
 * (frame 86): they already count their planned kcal, and the figure is
 * corrected from the server totals after sync. Skipped meals add nothing, so
 * they are not named.
 */
export function plannedUntilSentNote(
  meals: ReadonlyArray<{ id: string; mealName: string; status: string }>,
  pendingIds: ReadonlySet<string>,
): string | null {
  const names = meals
    .filter((m) => pendingIds.has(m.id) && m.status !== "skipped")
    .map((m) => m.mealName);
  if (names.length === 0) return null;
  const who = names.length === 1 ? names[0] : `${names.length} meals`;
  return `${who} ${names.length === 1 ? "is" : "are"} counted as planned until ${names.length === 1 ? "it's" : "they're"} sent`;
}

/** True while this meal's log is still in the outbox (offline or not yet acknowledged). */
export async function isMealLogPending(
  sync: SyncEngine,
  assignmentId: string,
): Promise<boolean> {
  try {
    return pendingMealLogIds(await sync.store.listOutbox()).has(assignmentId);
  } catch {
    return false;
  }
}
