import { z } from "zod";
import { foodLibraryServingSchema } from "./template.js";
import { cursorPageSchema, uuidSchema } from "./identity.js";

export const traineeFoodServingSchema = foodLibraryServingSchema.extend({
  isDefault: z.boolean(),
});

export const traineeFoodDetailSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  energyKcalScaled: z.number().int().nonnegative().nullable(),
  proteinScaled: z.number().int().nonnegative().nullable(),
  carbsScaled: z.number().int().nonnegative().nullable(),
  fatScaled: z.number().int().nonnegative().nullable(),
  defaultServingId: uuidSchema.nullable(),
  servings: z.array(traineeFoodServingSchema).max(12),
});
export type TraineeFoodDetail = z.infer<typeof traineeFoodDetailSchema>;

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
