import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";

export const measurementTypeSchema = z.enum([
  "body_weight_kg",
  "waist_cm",
  "hip_cm",
  "chest_cm",
  "other",
]);
export type MeasurementType = z.infer<typeof measurementTypeSchema>;

export const measurementSourceSchema = z.enum([
  "trainee_entry",
  "checkin",
  "trainer_entry",
]);
export type MeasurementSource = z.infer<typeof measurementSourceSchema>;

export const progressEntryTypeSchema = z.enum([
  "progress_photo",
  "note",
  "milestone",
]);
export type ProgressEntryType = z.infer<typeof progressEntryTypeSchema>;

export const mediaTypeSchema = z.enum([
  "progress_photo",
  "meal_photo",
  "checkin_photo",
  "avatar",
]);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const mediaAssetStatusSchema = z.enum([
  "pending_upload",
  "ready",
  "failed",
]);
export type MediaAssetStatus = z.infer<typeof mediaAssetStatusSchema>;

export const mediaDomainEntityTypeSchema = z.enum([
  "meal_compliance",
  "progress_entry",
  "measurement",
  "checkin",
]);
export type MediaDomainEntityType = z.infer<typeof mediaDomainEntityTypeSchema>;

/** Public media metadata — object keys are never exposed. */
export const mediaAssetSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  uploaderUserId: uuidSchema,
  mediaType: mediaTypeSchema,
  status: mediaAssetStatusSchema,
  contentType: z.string().min(1).max(120),
  byteSize: z.number().int().nonnegative().nullable(),
  originalFilename: z.string().max(255).nullable(),
  domainEntityType: mediaDomainEntityTypeSchema.nullable(),
  domainEntityId: uuidSchema.nullable(),
  recordVersion: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  uploadedAt: isoDateTimeSchema.nullable(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

export const measurementSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  traineeUserId: uuidSchema,
  type: measurementTypeSchema,
  value: z.number().finite(),
  unit: z.string().min(1).max(32),
  observedAt: isoDateTimeSchema,
  source: measurementSourceSchema,
  checkinId: uuidSchema.nullable(),
  mediaAssetId: uuidSchema.nullable(),
  recordVersion: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Measurement = z.infer<typeof measurementSchema>;

export const progressEntrySchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  traineeUserId: uuidSchema,
  entryType: progressEntryTypeSchema,
  title: z.string().max(120).nullable(),
  body: z.string().max(2000).nullable(),
  observedAt: isoDateTimeSchema,
  mediaAssetId: uuidSchema.nullable(),
  recordVersion: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProgressEntry = z.infer<typeof progressEntrySchema>;

export const createMeasurementRequestSchema = z.object({
  /** Optional client-generated id for offline-created measurements. */
  id: uuidSchema.optional(),
  type: measurementTypeSchema,
  value: z.number().finite().positive().max(1000),
  unit: z.string().trim().min(1).max(32),
  observedAt: isoDateTimeSchema.optional(),
  mediaAssetId: uuidSchema.nullable().optional(),
});
export type CreateMeasurementRequest = z.infer<
  typeof createMeasurementRequestSchema
>;

export const createProgressEntryRequestSchema = z.object({
  entryType: progressEntryTypeSchema,
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().max(2000).nullable().optional(),
  observedAt: isoDateTimeSchema.optional(),
  mediaAssetId: uuidSchema.nullable().optional(),
});
export type CreateProgressEntryRequest = z.infer<
  typeof createProgressEntryRequestSchema
>;

export const measurementListResponseSchema = cursorPageSchema(measurementSchema);
export type MeasurementListResponse = z.infer<
  typeof measurementListResponseSchema
>;

export const progressEntryListResponseSchema =
  cursorPageSchema(progressEntrySchema);
export type ProgressEntryListResponse = z.infer<
  typeof progressEntryListResponseSchema
>;

export const createUploadTargetRequestSchema = z.object({
  coachingRelationshipId: uuidSchema,
  mediaType: mediaTypeSchema,
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(10_000_000).optional(),
  originalFilename: z.string().trim().max(255).nullable().optional(),
  domainEntityType: mediaDomainEntityTypeSchema.nullable().optional(),
  domainEntityId: uuidSchema.nullable().optional(),
});
export type CreateUploadTargetRequest = z.infer<
  typeof createUploadTargetRequestSchema
>;

export const createUploadTargetResponseSchema = z.object({
  mediaAsset: mediaAssetSchema,
  /** Time-limited API upload path. Not an R2 object key. */
  uploadUrl: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});
export type CreateUploadTargetResponse = z.infer<
  typeof createUploadTargetResponseSchema
>;

export const confirmUploadRequestSchema = z.object({
  byteSize: z.number().int().nonnegative().max(10_000_000).optional(),
  contentType: z.string().trim().min(1).max(120).optional(),
});
export type ConfirmUploadRequest = z.infer<typeof confirmUploadRequestSchema>;

export const downloadTargetResponseSchema = z.object({
  mediaAsset: mediaAssetSchema,
  /** Time-limited API download path. Not an R2 object key. */
  downloadUrl: z.string().min(1),
  expiresAt: isoDateTimeSchema,
});
export type DownloadTargetResponse = z.infer<
  typeof downloadTargetResponseSchema
>;

export const progressSummarySchema = z.object({
  measurements: z.array(measurementSchema),
  entries: z.array(progressEntrySchema),
  media: z.array(mediaAssetSchema),
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;
