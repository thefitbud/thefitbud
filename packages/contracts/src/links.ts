import { z } from "zod";
import { roleSchema } from "./identity.js";

export const linkKindSchema = z.enum([
  "meal",
  "workout",
  "checkin",
  "exception",
  "ask",
  "plan",
  "client",
  "today",
  "note",
  "reactivate",
]);

export const linkResolveResponseSchema = z.object({
  role: roleSchema,
  route: z.string(),
  available: z.boolean(),
  reason: z
    .enum(["not_found", "not_yours", "ended", "superseded", "expired"])
    .optional(),
});
export type LinkResolveResponse = z.infer<typeof linkResolveResponseSchema>;
