import { z } from "zod";

/** Product roles supported in the MVP. */
export const roleSchema = z.enum(["trainer", "trainee"]);
export type Role = z.infer<typeof roleSchema>;

/** Surfaces that may select a role. */
export const surfaceSchema = z.enum(["trainer_web", "mobile"]);
export type Surface = z.infer<typeof surfaceSchema>;

export const accountStateSchema = z.enum(["active", "disabled"]);
export type AccountState = z.infer<typeof accountStateSchema>;

export const uuidSchema = z.string().uuid();

export const isoDateTimeSchema = z.string().datetime({ offset: true });

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export const apiDataEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  });

export const cursorPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("fitbud-api"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const meResponseSchema = z.object({
  userId: uuidSchema,
  firebaseUid: z.string().min(1),
  accountState: accountStateSchema,
  timezone: z.string().min(1),
  permittedRoles: z.array(roleSchema).min(1),
  selectedRole: roleSchema.nullable(),
  surface: surfaceSchema,
  trainerProfileId: uuidSchema.nullable(),
  traineeProfileId: uuidSchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const createWebSessionRequestSchema = z.object({
  idToken: z.string().min(1),
  timezone: z.string().min(1).optional(),
});
export type CreateWebSessionRequest = z.infer<typeof createWebSessionRequestSchema>;

export const createWebSessionResponseSchema = z.object({
  userId: uuidSchema,
  expiresAt: isoDateTimeSchema,
});
export type CreateWebSessionResponse = z.infer<typeof createWebSessionResponseSchema>;

export const selectRoleRequestSchema = z.object({
  role: roleSchema,
});
export type SelectRoleRequest = z.infer<typeof selectRoleRequestSchema>;
