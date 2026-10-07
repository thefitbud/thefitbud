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
  clearSession,
  getStoredAccessToken,
  getStoredEmail,
  storeSession,
} from "../lib/session";
import { createTestIdToken } from "../lib/test-token";

type AuthContextValue = {
  me: MeResponse | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState<string | null>(getStoredEmail());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMe = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setMe(null);
      return;
    }
    const profile = await apiClient.me();
    setMe(profile);
    setEmail(getStoredEmail());
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
        clearSession();
        if (!cancelled) {
          setMe(null);
          setEmail(null);
          if (err instanceof ApiClientError && err.status === 401) {
            setError(null);
          } else {
            setError(formatAuthError(err));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMe]);

  const signIn = useCallback(async (rawEmail: string) => {
    const normalized = rawEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      throw new Error("Enter a valid email address.");
    }

    setError(null);
    const uid = `trainer-${normalized}`;
    const idToken = createTestIdToken(uid, normalized);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    // Provisions trainer role/profile and sets an HTTP-only cookie when Secure
    // cookies are allowed. Local HTTP still authenticates via the stored Bearer.
    await apiClient.createWebSession({ idToken, timezone });
    storeSession(idToken, normalized);
    const profile = await apiClient.me();
    if (profile.selectedRole !== "trainer") {
      clearSession();
      throw new Error("This account cannot use trainer web.");
    }
    setMe(profile);
    setEmail(normalized);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiClient.endWebSession();
    } catch {
      // Local sessions may rely on Bearer only; still clear client state.
    }
    clearSession();
    setMe(null);
    setEmail(null);
    setError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      email,
      loading,
      error,
      signIn,
      signOut,
      refreshMe,
    }),
    [me, email, loading, error, signIn, signOut, refreshMe],
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
