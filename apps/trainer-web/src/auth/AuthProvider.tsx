import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import { apiClient } from "../lib/api";
import {
  AuthFlowError,
  establishTrainerSession,
  signInWithPassword,
} from "../lib/auth-flow";
import {
  clearSession,
  getStoredAccessToken,
  getStoredEmail,
} from "../lib/session";
import { createTestIdToken } from "../lib/test-token";

type AuthContextValue = {
  me: MeResponse | null;
  email: string | null;
  loading: boolean;
  sessionError: string | null;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  signInWithToken: (token: string, identifier: string) => Promise<void>;
  signInDevTest: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearSessionError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState<string | null>(getStoredEmail());
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setMe(null);
      return;
    }
    const profile = await apiClient.me();
    setMe(profile);
    setEmail(getStoredEmail());
    setSessionError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!getStoredAccessToken()) {
          if (!cancelled) setMe(null);
          return;
        }
        await refreshMe();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) {
          clearSession();
          setMe(null);
          setEmail(null);
          setSessionError(null);
          return;
        }
        setSessionError(
          err instanceof Error
            ? err.message
            : "Can't reach FitBud. Check your connection and try again.",
        );
        setMe(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const signInWithPasswordHandler = useCallback(
    async (identifier: string, password: string) => {
      setSessionError(null);
      const profile = await signInWithPassword(identifier, password);
      setMe(profile);
      setEmail(profile.email ?? getStoredEmail());
    },
    [],
  );

  const signInWithToken = useCallback(async (token: string, identifier: string) => {
    setSessionError(null);
    const profile = await establishTrainerSession(token, identifier);
    setMe(profile);
    setEmail(profile.email ?? identifier);
  }, []);

  const signInDevTest = useCallback(async (rawEmail: string) => {
    if (!import.meta.env.DEV) {
      throw new AuthFlowError("generic", "Test sign-in is only available in development.");
    }
    const normalized = rawEmail.trim().toLowerCase();
    const uid = `trainer-${normalized}`;
    const idToken = createTestIdToken(uid, normalized);
    await signInWithToken(idToken, normalized);
  }, [signInWithToken]);

  const signOut = useCallback(async () => {
    try {
      await apiClient.endWebSession();
    } catch {
      // Local sessions may rely on Bearer only; still clear client state.
    }
    clearSession();
    setMe(null);
    setEmail(null);
    setSessionError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      email,
      loading,
      sessionError,
      signInWithPassword: signInWithPasswordHandler,
      signInWithToken,
      signInDevTest,
      signOut,
      refreshMe,
      clearSessionError: () => setSessionError(null),
    }),
    [
      me,
      email,
      loading,
      sessionError,
      signInWithPasswordHandler,
      signInWithToken,
      signInDevTest,
      signOut,
      refreshMe,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export { AuthFlowError };
