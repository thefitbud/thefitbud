import { z } from "zod";
import { accountStateSchema, isoDateTimeSchema } from "./identity.js";

/**
 * W6 Z6-14 (D-W6-7, D-W6-8, D-W6-31): account deletion archives the account for
 * 6 calendar months; signing in again and confirming reactivates it.
 */

/** Kept from the Z5-4 scaffold; the scaffold export test still names it (D-W6-15). */
export type W6AccountContract = Record<string, never>;

/** Error codes of the account lane (upper case, D-W6-31). */
export const accountErrorCodeSchema = z.enum([
  "ACTIVE_CLIENTS",
  "ACCOUNT_ARCHIVED",
  "RECENT_SIGN_IN_REQUIRED",
  "ACCOUNT_DELETED",
]);
export type AccountErrorCode = z.infer<typeof accountErrorCodeSchema>;

/** `details` of a 403 `ACCOUNT_ARCHIVED` error, returned by every blocked route. */
export const accountArchivedErrorDetailsSchema = z.object({
  accountState: z.literal("archived"),
  purgeAfter: isoDateTimeSchema,
});
export type AccountArchivedErrorDetails = z.infer<
  typeof accountArchivedErrorDetailsSchema
>;

/** POST /account/deletion. No body: the proof is a sign-in within the last 5 minutes. */
export const accountDeletionResponseSchema = z.object({
  accountState: z.literal("archived"),
  archivedAt: isoDateTimeSchema,
  purgeAfter: isoDateTimeSchema,
});
export type AccountDeletionResponse = z.infer<typeof accountDeletionResponseSchema>;

/** GET /account/status. Both dates are set exactly when the account is archived. */
export const accountStatusResponseSchema = z.object({
  accountState: accountStateSchema,
  archivedAt: isoDateTimeSchema.nullable(),
  purgeAfter: isoDateTimeSchema.nullable(),
});
export type AccountStatusResponse = z.infer<typeof accountStatusResponseSchema>;

/** POST /account/reactivation. Coaching relationships stay ended. */
export const accountReactivationResponseSchema = z.object({
  accountState: z.literal("active"),
});
export type AccountReactivationResponse = z.infer<
  typeof accountReactivationResponseSchema
>;
