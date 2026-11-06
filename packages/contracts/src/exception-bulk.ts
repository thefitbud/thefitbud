// W6 Z6-10: bulk Resolve for one client's compatible exceptions, with a 5 s undo.
import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  exceptionStatusSchema,
  type ExceptionType,
} from "./exception.js";

/**
 * Z5-4 placeholder type, kept so the scaffold export check still compiles.
 * The real schemas are below.
 */
export type W6ExceptionBulkContract = Record<string, never>;

/**
 * D11 (locked): bulk only for compatible coaching-configuration exceptions,
 * that is missed workout, missed meal and missed log. Everything else
 * (meal changes, and anything that is not an exception at all such as
 * pain/safety asks or renewals) is handled one at a time.
 */
export const BULK_RESOLVABLE_EXCEPTION_TYPES = [
  "missed_workout",
  "skipped_workout",
  "overdue_meal",
  "skipped_meal",
  "meal_logged_later",
  "overdue_checkin",
] as const satisfies readonly ExceptionType[];

export function isBulkResolvableExceptionType(type: ExceptionType): boolean {
  return (BULK_RESOLVABLE_EXCEPTION_TYPES as readonly string[]).includes(type);
}

/** Bulk resolve undo window (D11 / SPB): 5 seconds from the server commit. */
export const BULK_RESOLVE_UNDO_WINDOW_MS = 5_000;

/** Largest selection one call accepts. */
export const BULK_RESOLVE_MAX_ITEMS = 50;

export const bulkResolveOutcomeSchema = z.enum([
  "talked",
  "plan_adjusted",
  "no_action",
  "other",
]);
export type BulkResolveOutcome = z.infer<typeof bulkResolveOutcomeSchema>;

export const bulkResolveExceptionsRequestSchema = z.object({
  relationshipId: uuidSchema,
  exceptionIds: z
    .array(uuidSchema)
    .min(1)
    .max(BULK_RESOLVE_MAX_ITEMS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Exception ids must be unique.",
    }),
  outcome: bulkResolveOutcomeSchema,
  note: z.string().trim().max(2000).nullable().optional(),
});
export type BulkResolveExceptionsRequest = z.infer<
  typeof bulkResolveExceptionsRequestSchema
>;

/**
 * Why an item was not resolved. `not_found` covers ids that are not this
 * client's exceptions (another client, another trainer, or not an exception);
 * nothing about such ids is disclosed.
 */
export const bulkResolveSkipReasonSchema = z.enum([
  "not_found",
  "incompatible_type",
  "already_resolved",
]);
export type BulkResolveSkipReason = z.infer<typeof bulkResolveSkipReasonSchema>;

export const bulkResolveItemResultSchema = z.discriminatedUnion("status", [
  z.object({ id: uuidSchema, status: z.literal("resolved") }),
  z.object({
    id: uuidSchema,
    status: z.literal("skipped"),
    reason: bulkResolveSkipReasonSchema,
  }),
]);
export type BulkResolveItemResult = z.infer<typeof bulkResolveItemResultSchema>;

export const bulkResolveExceptionsResponseSchema = z.object({
  /** Null when nothing was resolved (there is nothing to undo). */
  bulkId: uuidSchema.nullable(),
  relationshipId: uuidSchema,
  resolvedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  /** One result per requested id, in request order. */
  items: z.array(bulkResolveItemResultSchema),
  resolvedAt: isoDateTimeSchema.nullable(),
  undoExpiresAt: isoDateTimeSchema.nullable(),
});
export type BulkResolveExceptionsResponse = z.infer<
  typeof bulkResolveExceptionsResponseSchema
>;

export const bulkUndoRequestSchema = z.object({
  bulkId: uuidSchema,
});
export type BulkUndoRequest = z.infer<typeof bulkUndoRequestSchema>;

export const bulkUndoItemResultSchema = z.object({
  id: uuidSchema,
  /** The status the exception had before the bulk resolve. */
  status: exceptionStatusSchema,
});
export type BulkUndoItemResult = z.infer<typeof bulkUndoItemResultSchema>;

export const bulkUndoResponseSchema = z.object({
  bulkId: uuidSchema,
  relationshipId: uuidSchema,
  restoredCount: z.number().int().nonnegative(),
  items: z.array(bulkUndoItemResultSchema),
});
export type BulkUndoResponse = z.infer<typeof bulkUndoResponseSchema>;
