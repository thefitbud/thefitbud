// W6 Z6-8: client settings (basic details read, subscription edit, payment records).
// Z6-8b: the trainer-owned client name and contact phone (PATCH /basic).
//
// Tracking only (D-W6-5, PLAN-v2 D-P2-12): FitBud records what a client owes and
// whether the trainer marked it paid. No collection, gateway, invoice or session
// count field exists here, and none may be added.
import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  paymentFrequencySchema,
  renewalStateSchema,
} from "./subscription.js";
import { localDateSchema } from "./workout.js";

/** Kept so the Z5-4 scaffold export check keeps compiling (D-W6-15). */
export type W6ClientSettingsContract = Record<string, never>;

/** A YYYY-MM-DD civil date that exists on the calendar (no 2026-02-30). */
export const calendarDateSchema = localDateSchema.refine(
  (value) => {
    const [y, m, d] = value.split("-").map(Number) as [number, number, number];
    const date = new Date(Date.UTC(y, m - 1, d));
    return (
      date.getUTCFullYear() === y &&
      date.getUTCMonth() === m - 1 &&
      date.getUTCDate() === d
    );
  },
  { message: "Expected a real calendar date" },
);

export const subscriptionTypeSchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);
export type SubscriptionType = z.infer<typeof subscriptionTypeSchema>;

export const coachingModeSchema = z.enum(["online", "in_person", "hybrid"]);
export type CoachingMode = z.infer<typeof coachingModeSchema>;

export const paymentStatusSchema = z.enum(["paid", "unpaid"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentMethodSchema = z.enum(["cash", "upi", "bank"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Largest amount accepted, in paise (₹1 crore). Keeps values in a safe integer range. */
export const CLIENT_SETTINGS_MAX_AMOUNT_PAISE = 1_000_000_000;

/** Subscription amount: ≥ 0 (a free plan is allowed; D-W6-22). */
const subscriptionAmountPaiseSchema = z
  .number()
  .int()
  .min(0)
  .max(CLIENT_SETTINGS_MAX_AMOUNT_PAISE);

/** Payment amount: > 0 (a ₹0 payment records nothing; D-W6-22). */
const paymentAmountPaiseSchema = z
  .number()
  .int()
  .min(1)
  .max(CLIENT_SETTINGS_MAX_AMOUNT_PAISE);

const paymentNoteSchema = z.string().trim().max(500);

export const clientSettingsSubscriptionSchema = z.object({
  id: uuidSchema,
  versionNumber: z.number().int().positive(),
  planName: z.string().min(1).max(120),
  paymentFrequency: paymentFrequencySchema,
  startsOn: localDateSchema,
  renewsOn: localDateSchema,
  /** Derived in the trainer's timezone. */
  renewalState: renewalStateSchema,
  /** Null on versions saved before amounts were tracked; never invented. */
  amountPaise: z.number().int().nonnegative().nullable(),
  subscriptionType: subscriptionTypeSchema.nullable(),
  coachingMode: coachingModeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type ClientSettingsSubscription = z.infer<
  typeof clientSettingsSubscriptionSchema
>;

export const paymentRecordSchema = z.object({
  id: uuidSchema,
  relationshipId: uuidSchema,
  subscriptionVersionId: uuidSchema,
  amountPaise: z.number().int().positive(),
  dueOn: localDateSchema,
  /** Set exactly when the status is paid. */
  paidOn: localDateSchema.nullable(),
  status: paymentStatusSchema,
  /** Set exactly when the status is paid. */
  method: paymentMethodSchema.nullable(),
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PaymentRecord = z.infer<typeof paymentRecordSchema>;

export const clientSettingsBasicsSchema = z.object({
  /** The client's own profile name (read only here). */
  displayName: z.string(),
  /** The client's sign-in phone as stored at sign-up (read only); null when none. */
  phoneE164: z.string().nullable(),
  /**
   * Z6-8b (D-W6-42): the name this trainer set for the client on this
   * relationship; null when not set. Never shown to the client.
   */
  clientDisplayName: z.string().nullable(),
  /**
   * Z6-8b (D-W6-42): the contact phone this trainer keeps for the client, as
   * `+<digits>`; null when not set. Separate from the sign-in phone.
   */
  contactPhoneE164: z.string().nullable(),
});
export type ClientSettingsBasics = z.infer<typeof clientSettingsBasicsSchema>;

/** Same bound as display names elsewhere (trainer profile, plan names). */
export const CLIENT_DISPLAY_NAME_MAX_LENGTH = 120;

/**
 * PATCH /client-settings/relationships/:id/basic (Z6-8b, D-W6-42). Changes only
 * the trainer-owned name and contact phone on the relationship; the client's
 * profile name and sign-in phone never change. Each field is optional, `null`
 * clears it, and at least one must be sent. The phone follows the trainer
 * profile's WhatsApp rule: the server normalises it and stores `+<digits>`.
 * There is no goal field: the goal stays in Coaching setup.
 */
export const updateClientBasicsRequestSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1)
      .max(CLIENT_DISPLAY_NAME_MAX_LENGTH)
      .nullable()
      .optional(),
    contactPhone: z.string().trim().min(8).max(20).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.displayName !== undefined || value.contactPhone !== undefined,
    { message: "Nothing to update" },
  );
export type UpdateClientBasicsRequest = z.infer<
  typeof updateClientBasicsRequestSchema
>;

export const clientSettingsResponseSchema = z.object({
  relationshipId: uuidSchema,
  relationshipStatus: z.enum(["active", "ended"]),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  /** True when the relationship has ended: every write answers 409. */
  readOnly: z.boolean(),
  basics: clientSettingsBasicsSchema,
  /** The newest subscription version, or null before one is saved. */
  subscription: clientSettingsSubscriptionSchema.nullable(),
  /** Every payment record, newest due date first. */
  payments: z.array(paymentRecordSchema),
});
export type ClientSettingsResponse = z.infer<typeof clientSettingsResponseSchema>;

/**
 * PUT /client-settings/relationships/:id/subscription. Always creates version
 * `expectedVersion + 1`; earlier versions are never edited. Amount, type and mode
 * are sent explicitly (null for "not set") so nothing is carried over silently.
 */
export const putClientSubscriptionRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    planName: z.string().trim().min(1).max(120),
    paymentFrequency: paymentFrequencySchema,
    startsOn: calendarDateSchema,
    renewsOn: calendarDateSchema,
    amountPaise: subscriptionAmountPaiseSchema.nullable(),
    subscriptionType: subscriptionTypeSchema.nullable(),
    coachingMode: coachingModeSchema.nullable(),
  })
  .strict()
  .refine((value) => value.renewsOn > value.startsOn, {
    message: "Renewal date must be after the start date",
    path: ["renewsOn"],
  });
export type PutClientSubscriptionRequest = z.infer<
  typeof putClientSubscriptionRequestSchema
>;

/**
 * POST /client-settings/relationships/:id/payments. The record is tied to the
 * newest subscription version. A paid record needs `paidOn` and `method`; an
 * unpaid one carries neither.
 */
export const createPaymentRecordRequestSchema = z
  .object({
    amountPaise: paymentAmountPaiseSchema,
    dueOn: calendarDateSchema,
    status: paymentStatusSchema,
    paidOn: calendarDateSchema.nullable().optional(),
    method: paymentMethodSchema.nullable().optional(),
    note: paymentNoteSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "paid") {
      if (!value.paidOn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paidOn"],
          message: "A paid record needs the paid date",
        });
      }
      if (!value.method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["method"],
          message: "A paid record needs a method",
        });
      }
    } else {
      if (value.paidOn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paidOn"],
          message: "An unpaid record has no paid date",
        });
      }
      if (value.method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["method"],
          message: "An unpaid record has no method",
        });
      }
    }
  });
export type CreatePaymentRecordRequest = z.infer<
  typeof createPaymentRecordRequestSchema
>;

/**
 * PATCH /client-settings/relationships/:id/payments/:paymentId. Only status,
 * paid date, method and note change. Going back to unpaid clears the paid date
 * and method (D-W6-22); marking paid needs both (sent now or already stored).
 */
export const updatePaymentRecordRequestSchema = z
  .object({
    status: paymentStatusSchema.optional(),
    paidOn: calendarDateSchema.nullable().optional(),
    method: paymentMethodSchema.nullable().optional(),
    note: paymentNoteSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update",
  })
  .superRefine((value, ctx) => {
    if (value.status === "unpaid") {
      if (value.paidOn) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["paidOn"],
          message: "An unpaid record has no paid date",
        });
      }
      if (value.method) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["method"],
          message: "An unpaid record has no method",
        });
      }
    }
  });
export type UpdatePaymentRecordRequest = z.infer<
  typeof updatePaymentRecordRequestSchema
>;
