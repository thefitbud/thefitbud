import { ApiClientError, FitBudApiClient } from "@fitbud/api-client";
import type { AuthRefreshResponse, Role } from "@fitbud/contracts";
import { NativeModules, Platform } from "react-native";
import { apiBaseUrlForDevice, deviceApiHost, preferredDevServerHost } from "./apiBaseUrl";

/** Local Wrangler default. Override with EXPO_PUBLIC_API_BASE_URL. */
export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

/**
 * Keep the literal `process.env.EXPO_PUBLIC_API_BASE_URL` member expression:
 * Expo's Babel transform only inlines that exact form into the bundle.
 */
function readEnvApiBaseUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_API_BASE_URL;
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
  /** AU1c hook: refresh once on 401, then retry once. Omit for no refresh. */
  refreshAccessToken?: () => Promise<string | null>;
};

export function createMobileApiClient(session: ApiSession): FitBudApiClient {
  const client = new FitBudApiClient({
    baseUrl: resolveApiBaseUrl(),
    getAccessToken: session.getAccessToken,
    getSelectedRole: session.getSelectedRole,
    ...(session.refreshAccessToken
      ? { refreshAccessToken: session.refreshAccessToken }
      : {}),
  });
  return client;
}

/** Refresh this long before the ID token expires. */
export const REFRESH_LEAD_MS = 60_000;
/** After a transient refresh failure (offline, 429, 5xx), try again after this long. */
export const REFRESH_RETRY_MS = 30_000;

/** `refreshToken` and `expiresIn` (seconds) from a `firebase_id_token` response. */
export type SessionRefresh = { refreshToken: string; expiresIn: number };

/** Pick refresh fields off an auth response; test-mode responses have none. */
export function pickSessionRefresh(response: object): SessionRefresh | undefined {
  const { refreshToken, expiresIn } = response as {
    refreshToken?: unknown;
    expiresIn?: unknown;
  };
  if (
    typeof refreshToken === "string" &&
    refreshToken.length > 0 &&
    typeof expiresIn === "number" &&
    expiresIn > 0
  ) {
    return { refreshToken, expiresIn };
  }
  return undefined;
}

export type TokenState = {
  accessToken: string | null;
  refreshToken: string | null;
  /** Epoch ms when the access token expires; null when unknown (test mode). */
  expiresAt: number | null;
};

export type TokenSessionDeps = {
  initial?: TokenState;
  /** Calls `POST /auth/refresh` (the client's `refreshAuth`). */
  refreshAuth: (refreshToken: string) => Promise<AuthRefreshResponse>;
  /** Persist after every change (web: localStorage; native: no-op). */
  persist: (state: TokenState) => void;
  /** The API refused the refresh token; the state is already cleared. */
  onExpired: () => void;
  now?: () => number;
};

/**
 * Holds the access token, refresh token and expiry (D-W2-3). One refresh in
 * flight at a time; a timer refreshes about 60 s before expiry while the app
 * is in the foreground. Never logs the refresh token.
 */
export function createTokenSession(deps: TokenSessionDeps) {
  const now = deps.now ?? (() => Date.now());
  let state: TokenState = deps.initial ?? {
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  };
  let inFlight: Promise<string | null> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let foreground = true;

  function write(next: TokenState) {
    state = next;
    deps.persist(state);
  }

  function cancel() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function arm(delay: number) {
    cancel();
    if (!foreground) return;
    timer = setTimeout(() => {
      timer = null;
      void refresh();
    }, delay);
  }

  function schedule() {
    if (state.expiresAt === null || !state.refreshToken) {
      cancel();
      return;
    }
    arm(Math.max(0, state.expiresAt - REFRESH_LEAD_MS - now()));
  }

  function clear() {
    cancel();
    write({ accessToken: null, refreshToken: null, expiresAt: null });
  }

  function refresh(): Promise<string | null> {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const refreshToken = state.refreshToken;
      if (!refreshToken) return null;
      try {
        const result = await deps.refreshAuth(refreshToken);
        // Signed out or signed in again meanwhile: drop the result.
        if (state.refreshToken !== refreshToken) return null;
        write({
          accessToken: result.token,
          refreshToken: result.refreshToken,
          expiresAt: now() + result.expiresIn * 1000,
        });
        schedule();
        return result.token;
      } catch (err) {
        if (state.refreshToken !== refreshToken) return null;
        if (
          err instanceof ApiClientError &&
          (err.status === 400 || err.status === 401 || err.status === 403)
        ) {
          clear();
          deps.onExpired();
        } else {
          arm(REFRESH_RETRY_MS);
        }
        return null;
      }
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    getAccessToken: () => state.accessToken,
    getState: (): TokenState => ({ ...state }),
    /** New sign-in. Without `refresh` (test mode) no refresh state is kept. */
    signIn(token: string, refreshFields?: SessionRefresh) {
      write({
        accessToken: token,
        refreshToken: refreshFields?.refreshToken ?? null,
        expiresAt: refreshFields ? now() + refreshFields.expiresIn * 1000 : null,
      });
      schedule();
    },
    clear,
    refresh,
    /** Re-arm the timer; if expiry is already near or past, refresh now. */
    setForeground(active: boolean) {
      foreground = active;
      if (active) schedule();
      else cancel();
    },
    schedule,
  };
}

export type TokenSession = ReturnType<typeof createTokenSession>;
