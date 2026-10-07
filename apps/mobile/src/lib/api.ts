import { FitBudApiClient } from "@fitbud/api-client";
import type { Role } from "@fitbud/contracts";
import { getExpoGoProjectConfig } from "expo/src/environment/ExpoGo";
import { NativeModules, Platform } from "react-native";
import getDevServer from "react-native/Libraries/Core/Devtools/getDevServer";
import { apiBaseUrlForDevice, deviceApiHost, preferredDevServerHost } from "./apiBaseUrl";

/** Local Wrangler default. Override with EXPO_PUBLIC_API_BASE_URL. */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

function readEnvApiBaseUrl(): string | undefined {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return env?.EXPO_PUBLIC_API_BASE_URL;
}

function readBundleDevServerUrl(): string | null {
  try {
    const info = getDevServer();
    if (info.bundleLoadedFromServer && info.url) return info.url;
  } catch {
    return null;
  }
  return null;
}

function readManifestDevServerHosts(): string[] {
  const constants = NativeModules.ExponentConstants as
    | { manifest?: unknown; experienceUrl?: string }
    | undefined;
  if (!constants) return [];
  const hosts: string[] = [];
  if (constants.experienceUrl) hosts.push(constants.experienceUrl);

  let manifest: Record<string, unknown> | null = null;
  if (typeof constants.manifest === "string") {
    try {
      manifest = JSON.parse(constants.manifest) as Record<string, unknown>;
    } catch {
      manifest = null;
    }
  } else if (constants.manifest && typeof constants.manifest === "object") {
    manifest = constants.manifest as Record<string, unknown>;
  }
  if (!manifest) return hosts;

  for (const key of ["debuggerHost", "hostUri", "logUrl", "bundleUrl"]) {
    const value = manifest[key];
    if (typeof value === "string") hosts.push(value);
  }
  return hosts;
}

function readDevServerHost(): string | null {
  const sourceCode = NativeModules.SourceCode as
    | {
        scriptURL?: string;
        getConstants?: () => { scriptURL?: string };
      }
    | undefined;

  return preferredDevServerHost([
    readBundleDevServerUrl(),
    getExpoGoProjectConfig()?.debuggerHost,
    ...readManifestDevServerHosts(),
    sourceCode?.scriptURL,
    sourceCode?.getConstants?.()?.scriptURL,
  ]);
}

export function resolveApiBaseUrl(): string {
  const fromEnv = readEnvApiBaseUrl();
  const configured = (fromEnv?.trim() || DEFAULT_API_BASE_URL).replace(/\/$/, "");
  return apiBaseUrlForDevice(
    configured,
    deviceApiHost({
      platform: Platform.OS,
      devServerHost: readDevServerHost(),
    }),
  );
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
