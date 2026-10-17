import { z } from "zod";

export const configFlagsSchema = z.object({
  wa_otp: z.boolean(),
  wa_automation: z.boolean(),
  steps_enabled: z.boolean(),
});

export const configResponseSchema = z.object({
  flags: configFlagsSchema,
  supportEmail: z.string().email(),
});

export type ConfigResponse = z.infer<typeof configResponseSchema>;
