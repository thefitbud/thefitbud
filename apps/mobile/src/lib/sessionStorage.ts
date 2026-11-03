import { Platform } from "react-native";
import type { Role } from "@fitbud/contracts";
import { secureDelete, secureGet, secureSet } from "./secureSessionStore";
import { isTestIdToken } from "./testToken";

const TOKEN_KEY = "fitbud.accessToken";
const ROLE_KEY = "fitbud.selectedRole";
const REFRESH_TOKEN_KEY = "fitbud.refreshToken";
/** Epoch milliseconds when the access token expires. */
const EXPIRES_AT_KEY = "fitbud.accessTokenExpiresAt";

type SessionRole = Extract<Role, "trainee" | "trainer">;

// Native (D-W3-11): the OS keychain/keystore through expo-secure-store. Small
// values under separate keys; the ~1 KB Firebase ID token is never stored.
const NATIVE_REFRESH_KEY = "fitbud.refreshToken";
const NATIVE_SESSION_KEY = "fitbud.session";
const NATIVE_TEST_TOKEN_KEY = "fitbud.testToken";
const NATIVE_KEYS = [NATIVE_REFRESH_KEY, NATIVE_SESSION_KEY, NATIVE_TEST_TOKEN_KEY] as const;
/** SecureStore warns above about 2048 bytes on some Android versions. */
export const SECURE_VALUE_MAX_BYTES = 2000;

type NativeTokenKind = "test_id_token" | "firebase_id_token";

export type NativeStoredSession = {
  refreshToken: string | null;
  testToken: string | null;
  userId: string | null;
  tokenKind: NativeTokenKind | null;
  selectedRole: SessionRole | null;
};

function isNative(): boolean {
  return Platform.OS !== "web";
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function warn(message: string): void {
  // Key names and outcomes only, never a value.
  console.warn(`[session] ${message}`);
}

// Native writes are async but callers are sync. One chain keeps them in call
// order, so a late write can never undo a later clear.
let nativeQueue: Promise<void> = Promise.resolve();
// Mirror of fitbud.session, so partial updates merge without a read.
let nativeMeta: {
  userId: string | null;
  tokenKind: NativeTokenKind | null;
  selectedRole: SessionRole | null;
} = { userId: null, tokenKind: null, selectedRole: null };

function enqueue(job: () => Promise<void>): void {
  nativeQueue = nativeQueue.then(job).catch(() => {
    warn("secure storage write failed; the session is memory-only until the next write");
  });
}

function writeKey(key: string, value: string): Promise<void> {
  if (utf8Bytes(value) > SECURE_VALUE_MAX_BYTES) {
    warn(`${key} is over ${SECURE_VALUE_MAX_BYTES} bytes; not stored`);
    return secureDelete(key);
  }
  return secureSet(key, value);
}

/** Resolves when every queued native write has finished (tests, and load). */
export function flushPersistedSession(): Promise<void> {
  return nativeQueue;
}

function writeNativeMeta(): void {
  const meta = { ...nativeMeta };
  // Metadata is written once `/me` has said who the user is.
  if (!meta.userId || !meta.tokenKind) return;
  enqueue(() =>
    writeKey(NATIVE_SESSION_KEY, JSON.stringify({ v: 1, ...meta, savedAt: new Date().toISOString() })),
  );
}

/**
 * Native only: read what a previous run stored. Waits for queued writes. A
 * read that throws propagates, so the caller treats it as "try again", never
 * as "signed out".
 */
export async function loadNativeSession(): Promise<NativeStoredSession> {
  await flushPersistedSession();
  const [refreshToken, sessionRaw, testToken] = await Promise.all([
    secureGet(NATIVE_REFRESH_KEY),
    secureGet(NATIVE_SESSION_KEY),
    secureGet(NATIVE_TEST_TOKEN_KEY),
  ]);
  let userId: string | null = null;
  let tokenKind: NativeTokenKind | null = null;
  let selectedRole: SessionRole | null = null;
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as Record<string, unknown> | null;
      if (parsed && parsed.v === 1) {
        if (typeof parsed.userId === "string") userId = parsed.userId;
        if (parsed.tokenKind === "test_id_token" || parsed.tokenKind === "firebase_id_token") {
          tokenKind = parsed.tokenKind;
        }
        if (parsed.selectedRole === "trainee" || parsed.selectedRole === "trainer") {
          selectedRole = parsed.selectedRole;
        }
      }
    } catch {
      // Unreadable metadata only costs the remembered role.
    }
  }
  nativeMeta = { userId, tokenKind, selectedRole };
  return {
    refreshToken: refreshToken || null,
    testToken: testToken || null,
    userId,
    tokenKind,
    selectedRole,
  };
}

function webStorage(): Storage | null {
  if (Platform.OS !== "web") return null;
  if (typeof globalThis === "undefined") return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Web only: read the persisted session synchronously. Native returns nulls
 * here and restores through `loadNativeSession()` (D-W3-11).
 */
export function loadPersistedSession(): {
  accessToken: string | null;
  selectedRole: SessionRole | null;
  refreshToken: string | null;
  expiresAt: number | null;
} {
  const storage = webStorage();
  if (!storage) {
    return { accessToken: null, selectedRole: null, refreshToken: null, expiresAt: null };
  }
  const accessToken = storage.getItem(TOKEN_KEY);
  const roleRaw = storage.getItem(ROLE_KEY);
  const selectedRole: SessionRole | null =
    roleRaw === "trainee" || roleRaw === "trainer" ? roleRaw : null;
  const refreshToken = storage.getItem(REFRESH_TOKEN_KEY);
  const expiresRaw = storage.getItem(EXPIRES_AT_KEY);
  const expiresNumber = expiresRaw ? Number(expiresRaw) : NaN;
  const expiresAt = Number.isFinite(expiresNumber) ? expiresNumber : null;
  return { accessToken, selectedRole, refreshToken, expiresAt };
}

/**
 * Keep the refresh token (and, on web, the expiry) with the session. Pass
 * nulls to remove them (test mode, sign-out). Native stores only the refresh
 * token, in SecureStore.
 */
export function persistRefreshState(input: {
  refreshToken: string | null;
  expiresAt: number | null;
}): void {
  if (isNative()) {
    const { refreshToken } = input;
    enqueue(() =>
      refreshToken ? writeKey(NATIVE_REFRESH_KEY, refreshToken) : secureDelete(NATIVE_REFRESH_KEY),
    );
    return;
  }
  const storage = webStorage();
  if (!storage) return;
  if (input.refreshToken && input.expiresAt !== null) {
    storage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
    storage.setItem(EXPIRES_AT_KEY, String(input.expiresAt));
  } else {
    storage.removeItem(REFRESH_TOKEN_KEY);
    storage.removeItem(EXPIRES_AT_KEY);
  }
}

export function persistSession(input: {
  accessToken: string | null;
  selectedRole: Role | null;
  /** Native only: known once `/me` has answered. */
  userId?: string;
}): void {
  if (isNative()) {
    // The ID token itself is never stored on native.
    if (!input.accessToken) return;
    nativeMeta = {
      userId: input.userId ?? nativeMeta.userId,
      tokenKind: isTestIdToken(input.accessToken) ? "test_id_token" : "firebase_id_token",
      selectedRole:
        input.selectedRole === "trainee" || input.selectedRole === "trainer"
          ? input.selectedRole
          : null,
    };
    writeNativeMeta();
    return;
  }
  const storage = webStorage();
  if (!storage) return;
  if (input.accessToken) storage.setItem(TOKEN_KEY, input.accessToken);
  else storage.removeItem(TOKEN_KEY);
  if (
    input.selectedRole === "trainee" ||
    input.selectedRole === "trainer"
  ) {
    storage.setItem(ROLE_KEY, input.selectedRole);
  } else {
    storage.removeItem(ROLE_KEY);
  }
}

/**
 * Persist a token-session change (AU1d). Keeps the current role with the new
 * access token; a cleared state removes the refresh keys. Native stores the
 * refresh token, and in test mode (no refresh token) the short test token.
 */
export function persistTokenState(
  state: { accessToken: string | null; refreshToken: string | null; expiresAt: number | null },
  selectedRole: Role | null,
): void {
  if (isNative()) {
    const { accessToken, refreshToken } = state;
    persistRefreshState({ refreshToken, expiresAt: state.expiresAt });
    enqueue(() =>
      accessToken && !refreshToken && isTestIdToken(accessToken)
        ? writeKey(NATIVE_TEST_TOKEN_KEY, accessToken)
        : secureDelete(NATIVE_TEST_TOKEN_KEY),
    );
    return;
  }
  if (state.accessToken) {
    persistSession({ accessToken: state.accessToken, selectedRole });
  }
  persistRefreshState({ refreshToken: state.refreshToken, expiresAt: state.expiresAt });
}

/** Sign out, a definitive refusal and (when it exists) account deletion all call this. */
export function clearPersistedSession(): void {
  if (isNative()) {
    nativeMeta = { userId: null, tokenKind: null, selectedRole: null };
    for (const key of NATIVE_KEYS) {
      enqueue(() => secureDelete(key));
    }
    return;
  }
  persistSession({ accessToken: null, selectedRole: null });
  persistRefreshState({ refreshToken: null, expiresAt: null });
}
