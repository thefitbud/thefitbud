/** Allowed MIME types for MVP media uploads. */
export const ALLOWED_MEDIA_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedMediaContentType =
  (typeof ALLOWED_MEDIA_CONTENT_TYPES)[number];

export function isAllowedMediaContentType(
  contentType: string,
): contentType is AllowedMediaContentType {
  const normalized = contentType.trim().toLowerCase().split(";")[0]?.trim();
  return (ALLOWED_MEDIA_CONTENT_TYPES as readonly string[]).includes(
    normalized ?? "",
  );
}

export function defaultUnitForMeasurementType(
  type: "body_weight_kg" | "waist_cm" | "hip_cm" | "chest_cm" | "other",
): string {
  switch (type) {
    case "body_weight_kg":
      return "kg";
    case "waist_cm":
    case "hip_cm":
    case "chest_cm":
      return "cm";
    case "other":
      return "unit";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}
