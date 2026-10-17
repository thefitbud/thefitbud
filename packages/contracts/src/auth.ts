import { z } from "zod";
import { isoDateTimeSchema } from "./identity.js";

export const authLoginRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(8).max(64),
});

export const authTokenResponseSchema = z.object({
  token: z.string(),
  tokenKind: z.enum(["test_id_token", "firebase_custom_token"]),
  userId: z.string().uuid(),
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
    token: z.string(),
    tokenKind: z.enum(["test_id_token", "firebase_custom_token"]),
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
export type AuthTokenResponse = z.infer<typeof authTokenResponseSchema>;
