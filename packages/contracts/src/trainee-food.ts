import { z } from "zod";
import { cursorPageSchema, uuidSchema } from "./identity.js";

export const traineeFoodSearchItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  energyKcalScaled: z.number().int().nullable(),
  defaultServingId: uuidSchema.nullable(),
  aliases: z.array(z.object({ lang: z.string(), text: z.string() })).optional(),
});
export type TraineeFoodSearchItem = z.infer<typeof traineeFoodSearchItemSchema>;

export const traineeFoodSearchResponseSchema = cursorPageSchema(
  traineeFoodSearchItemSchema,
);
export type TraineeFoodSearchResponse = z.infer<
  typeof traineeFoodSearchResponseSchema
>;

export const traineeFoodIndexItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  updatedAt: z.string(),
  energyKcalScaled: z.number().int().nullable(),
  defaultServingId: uuidSchema.nullable(),
});
export const traineeFoodIndexResponseSchema = z.object({
  items: z.array(traineeFoodIndexItemSchema),
  since: z.string().nullable(),
});
export type TraineeFoodIndexResponse = z.infer<
  typeof traineeFoodIndexResponseSchema
>;
