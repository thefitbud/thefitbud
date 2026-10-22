export const FEATURE_FLAG_KEYS = [
  "wa_otp",
  "wa_automation",
  "steps_enabled",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  wa_otp: false,
  wa_automation: false,
  steps_enabled: false,
};

export function envFlagOverride(
  env: Record<string, string | undefined>,
  key: FeatureFlagKey,
): boolean | undefined {
  const raw = env[`FLAG_${key.toUpperCase()}`];
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}
