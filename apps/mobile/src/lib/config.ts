import type { ConfigResponse } from "@fitbud/contracts";
import { FitBudApiClient } from "@fitbud/api-client";

let cached: { at: number; value: ConfigResponse } | null = null;
const TTL_MS = 60 * 60 * 1000;

export function createConfigClient(baseUrl: string): FitBudApiClient {
  return new FitBudApiClient({ baseUrl });
}

export async function loadConfig(
  client: FitBudApiClient,
  force = false,
): Promise<ConfigResponse> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.value;
  }
  const value = await client.getConfig(force);
  cached = { at: Date.now(), value };
  return value;
}

export function isWhatsAppOtpEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.wa_otp === true;
}

export function isWhatsAppAutomationEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.wa_automation === true;
}

export function isStepsEnabled(config: ConfigResponse | null): boolean {
  return config?.flags.steps_enabled === true;
}
