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

/**
 * One default serving of a search or Recent hit (TR-26a/b): its label and the
 * nutrients for one of it, scaled like the library (×1,000,000).
 */
export const traineeFoodSearchServingSchema = z.object({
  label: z.string().min(1).max(120),
  kcalScaled: z.number().int().nonnegative().nullable(),
  proteinScaled: z.number().int().nonnegative().nullable(),
  carbsScaled: z.number().int().nonnegative().nullable(),
  fatScaled: z.number().int().nonnegative().nullable(),
});
export type TraineeFoodSearchServing = z.infer<
  typeof traineeFoodSearchServingSchema
>;

export const traineeFoodSearchItemSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  /** Library foods: per 100 g or ml. A trainee's own food: per its serving. */
  energyKcalScaled: z.number().int().nullable(),
  defaultServingId: uuidSchema.nullable(),
  aliases: z.array(z.object({ lang: z.string(), text: z.string() })).optional(),
  /**
   * `custom` is a food this trainee created (D-W12-24): it is logged again as
   * a `customFood` item, never by `foodId`. Omitted means library.
   */
  source: z.enum(["library", "custom"]).optional(),
  /** The default serving, when the API knows it (null: none). */
  serving: traineeFoodSearchServingSchema.nullable().optional(),
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
