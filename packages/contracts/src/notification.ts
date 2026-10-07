import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const deviceTokenPlatformSchema = z.enum(["ios", "android", "web"]);
export type DeviceTokenPlatform = z.infer<typeof deviceTokenPlatformSchema>;
export const devicePlatformSchema = deviceTokenPlatformSchema;
export type DevicePlatform = DeviceTokenPlatform;

export const deviceTokenProviderSchema = z.enum(["fcm"]);
export type DeviceTokenProvider = z.infer<typeof deviceTokenProviderSchema>;

export const deviceTokenStatusSchema = z.enum(["active", "revoked"]);
export type DeviceTokenStatus = z.infer<typeof deviceTokenStatusSchema>;

export const deviceTokenSchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  platform: deviceTokenPlatformSchema,
  provider: deviceTokenProviderSchema,
  status: deviceTokenStatusSchema,
  token: z.string().min(8).max(4096),
  installationId: z.string().min(1).max(128),
  lastSeenAt: isoDateTimeSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type DeviceToken = z.infer<typeof deviceTokenSchema>;

export const registerDeviceTokenRequestSchema = z.object({
  token: z.string().min(8).max(4096),
  platform: deviceTokenPlatformSchema,
  provider: deviceTokenProviderSchema.default("fcm"),
  installationId: z.string().min(1).max(128),
});
export type RegisterDeviceTokenRequest = z.infer<
  typeof registerDeviceTokenRequestSchema
>;

export const registerDeviceTokenResponseSchema = z.object({
  deviceToken: deviceTokenSchema,
});
export type RegisterDeviceTokenResponse = z.infer<
  typeof registerDeviceTokenResponseSchema
>;

export const removeDeviceTokenRequestSchema = z
  .object({
    token: z.string().min(8).max(4096).optional(),
    deviceTokenId: uuidSchema.optional(),
    installationId: z.string().min(1).max(128).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.token || value.deviceTokenId || value.installationId),
    { message: "Provide token, deviceTokenId, or installationId." },
  );
export type RemoveDeviceTokenRequest = z.infer<
  typeof removeDeviceTokenRequestSchema
>;

export const notificationTypeSchema = z.enum([
  "workout_reminder",
  "meal_reminder",
  "checkin_reminder",
]);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const notificationCategorySchema = notificationTypeSchema;
export type NotificationCategory = NotificationType;
export const reminderTypeSchema = notificationTypeSchema;
export type ReminderType = NotificationType;

export const notificationPreferencesSchema = z.object({
  userId: uuidSchema,
  pushEnabled: z.boolean(),
  categories: z.object({
    workoutReminder: z.boolean(),
    mealReminder: z.boolean(),
    checkinReminder: z.boolean(),
  }),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  updatedAt: isoDateTimeSchema,
});
export type NotificationPreferences = z.infer<
  typeof notificationPreferencesSchema
>;

export const updateNotificationPreferencesRequestSchema = z.object({
  pushEnabled: z.boolean().optional(),
  categories: z
    .object({
      workoutReminder: z.boolean().optional(),
      mealReminder: z.boolean().optional(),
      checkinReminder: z.boolean().optional(),
    })
    .optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
});
export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>;

export const reminderRuleSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  reminderType: reminderTypeSchema,
  enabled: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ReminderRule = z.infer<typeof reminderRuleSchema>;

export const reminderRulesResponseSchema = z.object({
  items: z.array(reminderRuleSchema),
});
export type ReminderRulesResponse = z.infer<typeof reminderRulesResponseSchema>;

export const updateReminderRulesRequestSchema = z.object({
  rules: z
    .array(
      z.object({
        reminderType: reminderTypeSchema,
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(3),
});
export type UpdateReminderRulesRequest = z.infer<
  typeof updateReminderRulesRequestSchema
>;

export const notificationStateSchema = z.enum([
  "pending",
  "queued",
  "delivered",
  "read",
  "failed",
  "suppressed",
]);
export type NotificationState = z.infer<typeof notificationStateSchema>;

export const notificationDomainEntityTypeSchema = z.enum([
  "workout_assignment",
  "meal_assignment",
  "checkin",
]);
export type NotificationDomainEntityType = z.infer<
  typeof notificationDomainEntityTypeSchema
>;

export const SAFE_PUSH_PAYLOAD_KEYS = [
  "notificationId",
  "notificationType",
  "domainEntityType",
  "domainEntityId",
  "createdAt",
] as const;

export const pushPayloadSchema = z
  .object({
    notificationId: uuidSchema,
    notificationType: notificationTypeSchema,
    domainEntityType: notificationDomainEntityTypeSchema,
    domainEntityId: uuidSchema,
    createdAt: isoDateTimeSchema,
  })
  .strict();
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  recipientUserId: uuidSchema,
  coachingRelationshipId: uuidSchema.nullable(),
  /** Alias for notificationType — product-facing list field. */
  type: notificationTypeSchema,
  notificationType: notificationTypeSchema,
  domainEntityType: notificationDomainEntityTypeSchema,
  domainEntityId: uuidSchema,
  state: notificationStateSchema,
  dedupeKey: z.string().min(1).max(256),
  createdAt: isoDateTimeSchema,
  readAt: isoDateTimeSchema.nullable(),
  routing: pushPayloadSchema,
});
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationRecord = Notification;

export const notificationListResponseSchema = z.object({
  items: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});
export type NotificationListResponse = z.infer<
  typeof notificationListResponseSchema
>;

export const notificationDeliveryProviderStatusSchema = z.enum([
  "queued",
  "accepted",
  "failed",
  "skipped",
]);
export type NotificationDeliveryProviderStatus = z.infer<
  typeof notificationDeliveryProviderStatusSchema
>;
export const notificationDeliveryStatusSchema =
  notificationDeliveryProviderStatusSchema;
export type NotificationDeliveryStatus = NotificationDeliveryProviderStatus;

export const notificationDeliverySchema = z.object({
  id: uuidSchema,
  notificationId: uuidSchema,
  deviceTokenId: uuidSchema.nullable(),
  channel: z.literal("push"),
  providerStatus: notificationDeliveryProviderStatusSchema,
  providerMessageId: z.string().nullable(),
  failureCategory: z.string().nullable(),
  attemptNumber: z.number().int().positive(),
  acceptedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type NotificationDelivery = z.infer<typeof notificationDeliverySchema>;

export const reminderQueueMessageSchema = z.object({
  notificationId: uuidSchema,
  deliveryId: uuidSchema,
});
export type ReminderQueueMessage = z.infer<typeof reminderQueueMessageSchema>;

export const evaluateRemindersResponseSchema = z.object({
  evaluatedAt: isoDateTimeSchema,
  notificationsCreated: z.number().int().nonnegative(),
  notificationsDeduped: z.number().int().nonnegative(),
  deliveriesEnqueued: z.number().int().nonnegative(),
  suppressed: z.number().int().nonnegative(),
});
export type EvaluateRemindersResponse = z.infer<
  typeof evaluateRemindersResponseSchema
>;
