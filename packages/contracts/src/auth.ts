import { z } from "zod";

export const authLoginRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(64),
});

/** `firebase_id_token` responses also carry `refreshToken` and `expiresIn` (seconds). */
export const authTokenKindSchema = z.enum(["test_id_token", "firebase_id_token"]);

const sessionTokenFields = {
  token: z.string(),
  tokenKind: authTokenKindSchema,
  refreshToken: z.string().optional(),
  expiresIn: z.number().int().positive().optional(),
};

export const authTokenResponseSchema = z.object({
  ...sessionTokenFields,
  userId: z.string().uuid(),
});

export const authRefreshRequestSchema = z.object({
  refreshToken: z.string().min(1).max(4096),
});

export const authRefreshResponseSchema = z.object({
  token: z.string(),
  tokenKind: z.literal("firebase_id_token"),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});

export const authOtpStartRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  purpose: z.enum(["login", "reset", "invite"]),
  invitationToken: z.string().optional(),
});

export const authOtpStartResponseSchema = z.object({
  sent: z.literal(true),
  channels: z.array(z.enum(["email", "whatsapp"])),
});

export const authOtpVerifyRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().length(6),
  purpose: z.enum(["login", "reset", "invite"]),
});

export const authOtpVerifyResponseSchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("login"),
    ...sessionTokenFields,
    userId: z.string().uuid(),
  }),
  z.object({
    purpose: z.literal("reset"),
    resetProof: z.string(),
  }),
  z.object({
    purpose: z.literal("invite"),
    otpProof: z.string(),
  }),
]);

export const authPasswordResetRequestSchema = z.object({
  resetProof: z.string().min(10),
  newPassword: z.string().min(8).max(64),
});

export const authPasswordSetRequestSchema = z.object({
  currentPassword: z.string().min(8).max(64).optional(),
  newPassword: z.string().min(8).max(64),
});

export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthTokenKind = z.infer<typeof authTokenKindSchema>;
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>;
export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>;
export type AuthOtpStartRequest = z.infer<typeof authOtpStartRequestSchema>;
export type AuthOtpStartResponse = z.infer<typeof authOtpStartResponseSchema>;
export type AuthOtpVerifyRequest = z.infer<typeof authOtpVerifyRequestSchema>;
export type AuthOtpVerifyResponse = z.infer<typeof authOtpVerifyResponseSchema>;
export type AuthPasswordResetRequest = z.infer<
  typeof authPasswordResetRequestSchema
>;
export type AuthPasswordSetRequest = z.infer<typeof authPasswordSetRequestSchema>;
