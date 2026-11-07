import { z } from "zod";

/**
 * Standard check-in question keys (Z6-6, D-W6-41). A trainer form may include
 * each key at most once; questions without a key are custom and never charted.
 * v1 forms carry no keys and keep working.
 */
export const CHECKIN_STANDARD_KEYS = [
  "weight",
  "waist",
  "hips",
  "chest",
  "arm",
  "thigh",
  "photo_front",
  "photo_side",
  "photo_back",
  "energy",
  "sleep_quality",
  "stress",
  "hunger",
  "notes",
] as const;

export const checkinStandardKeySchema = z.enum(CHECKIN_STANDARD_KEYS);
export type CheckinStandardKey = z.infer<typeof checkinStandardKeySchema>;

/** Z5-4 scaffold placeholder, still referenced by `w6-scaffold.test.ts`. Z6-7 removes it with that reference. */
export type W6CheckinFormV2Contract = Record<string, never>;
