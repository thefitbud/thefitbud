import { FitBudApiClient } from "@fitbud/api-client";
import type { Role } from "@fitbud/contracts";

/** Local Wrangler default. Override with EXPO_PUBLIC_API_BASE_URL. */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

function readEnvApiBaseUrl(): string | undefined {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return env?.EXPO_PUBLIC_API_BASE_URL;
}

export function resolveApiBaseUrl(): string {
  const fromEnv = readEnvApiBaseUrl();
  return (fromEnv?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");
}

export type ApiSession = {
  getAccessToken: () => string | null;
  getSelectedRole: () => Role | null;
};

export function createMobileApiClient(session: ApiSession): FitBudApiClient {
  return new FitBudApiClient({
    baseUrl: resolveApiBaseUrl(),
    getAccessToken: session.getAccessToken,
    getSelectedRole: session.getSelectedRole,
  });
}
