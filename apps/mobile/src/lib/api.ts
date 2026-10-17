import { FitBudApiClient } from "@fitbud/api-client";
import type { Role } from "@fitbud/contracts";
import { NativeModules, Platform } from "react-native";
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
  if (Platform.OS === "web") return null;
  try {
    const getDevServer = (
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("react-native/Libraries/Core/Devtools/getDevServer") as {
        default: () => {
          bundleLoadedFromServer?: boolean;
          url?: string;
        };
      }
    ).default;
    const _typedGetDevServer = getDevServer as () => {
        bundleLoadedFromServer?: boolean;
        url?: string;
      };
    const info = _typedGetDevServer();
    if (info.bundleLoadedFromServer && info.url) return info.url;
  } catch {
    return null;
  }
  return null;
}

function readManifestDevServerHosts(): string[] {
  if (Platform.OS === "web") return [];
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

function readExpoGoDebuggerHost(): string | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getExpoGoProjectConfig } = require("expo/src/environment/ExpoGo") as {
      getExpoGoProjectConfig: () => { debuggerHost?: string } | null;
    };
    return getExpoGoProjectConfig()?.debuggerHost ?? null;
  } catch {
    return null;
  }
}

function readDevServerHost(): string | null {
  if (Platform.OS === "web") return null;
  const sourceCode = NativeModules.SourceCode as
    | {
        scriptURL?: string;
        getConstants?: () => { scriptURL?: string };
      }
    | undefined;

  return preferredDevServerHost([
    readBundleDevServerUrl(),
    readExpoGoDebuggerHost(),
    ...readManifestDevServerHosts(),
    sourceCode?.scriptURL,
    sourceCode?.getConstants?.()?.scriptURL,
  ]);
}

export function resolveApiBaseUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/__fitbud_api`;
  }
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
  const client = new FitBudApiClient({
    baseUrl: resolveApiBaseUrl(),
    getAccessToken: session.getAccessToken,
    getSelectedRole: session.getSelectedRole,
  });
  return client;
}
