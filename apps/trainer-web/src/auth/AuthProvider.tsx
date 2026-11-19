import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError } from "@fitbud/api-client";
import type { MeResponse } from "@fitbud/contracts";
import {
  accountDeletionCopy,
  formatPurgeDate,
} from "@fitbud/core";
import {
  apiClient,
  cancelTokenRefresh,
  scheduleTokenRefresh,
  setSessionExpiredListener,
} from "../lib/api";
import {
  ArchivedAccountError,
  AuthFlowError,
  establishTrainerSession,
  signInWithPassword,
} from "../lib/auth-flow";
import {
  clearSession,
  getStoredAccessToken,
  getStoredEmail,
  type SessionRefresh,
} from "../lib/session";
import { createTestIdToken } from "../lib/test-token";
import { archivedPurgeAfter } from "./archivedAccount";
import { ReactivateAccountPage } from "./ReactivateAccountPage";
import "./ReactivateAccountPage.css";

type AuthContextValue = {
  me: MeResponse | null;
  email: string | null;
  loading: boolean;
  sessionError: string | null;
  /** True while the delete flow's archived notice is showing (session cleared). */
  archivedNotice: { purgeAfter: string; timeZone: string | null } | null;
  signInWithPassword: (identifier: string, password: string) => Promise<void>;
  signInWithToken: (
    token: string,
    identifier: string,
    refresh?: SessionRefresh,
  ) => Promise<void>;
  signInDevTest: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  clearSessionError: () => void;
  /**
   * Z12-30: DELETE succeeded. Ends the session and shows the archived notice
   * (same outcome as mobile `finishAccountDeletion`).
   */
  finishAccountDeletion: (purgeAfter: string) => void;
  dismissArchivedNotice: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [email, setEmail] = useState<string | null>(getStoredEmail());
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [archivedAccount, setArchivedAccount] = useState<{
    purgeAfter: string;
    timeZone: string | null;
  } | null>(null);
  const [archivedNotice, setArchivedNotice] = useState<{
    purgeAfter: string;
    timeZone: string | null;
  } | null>(null);
  const [reactivating, setReactivating] = useState(false);
  const [reactivateError, setReactivateError] = useState<string | null>(null);
  const meRef = useRef(me);
  meRef.current = me;
  const reactivateRunningRef = useRef(false);

  const enterArchived = useCallback((purgeAfter: string, timeZone: string | null) => {
    setArchivedAccount({ purgeAfter, timeZone });
    setMe(null);
    setSessionError(null);
    setArchivedNotice(null);
    setReactivateError(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getStoredAccessToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const profile = await apiClient.me();
      setMe(profile);
      setEmail(getStoredEmail());
      setSessionError(null);
      setArchivedAccount(null);
    } catch (err) {
      const purgeAfter = archivedPurgeAfter(err);
      if (purgeAfter) {
        enterArchived(purgeAfter, meRef.current?.timezone ?? null);
        return;
      }
      throw err;
    }
  }, [enterArchived]);

  // Refresh failed (refresh token refused): the session is already cleared;
  // dropping `me` sends RequireAuth to the sign-in page.
  useEffect(() => {
    setSessionExpiredListener(() => {
      setMe(null);
      setEmail(null);
      setSessionError(null);
      setArchivedAccount(null);
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleTokenRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      setSessionExpiredListener(null);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!getStoredAccessToken()) {
          if (!cancelled) setMe(null);
          return;
        }
        scheduleTokenRefresh();
        await refreshMe();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError && err.status === 401) {
          cancelTokenRefresh();
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
      setReactivateError(null);
      try {
        const profile = await signInWithPassword(identifier, password);
        setMe(profile);
        setEmail(profile.email ?? getStoredEmail());
        setArchivedAccount(null);
        setArchivedNotice(null);
      } catch (err) {
        if (err instanceof ArchivedAccountError) {
          enterArchived(err.purgeAfter, null);
          setEmail(getStoredEmail());
          return;
        }
        throw err;
      }
    },
    [enterArchived],
  );

  const signInWithToken = useCallback(
    async (token: string, identifier: string, refresh?: SessionRefresh) => {
      setSessionError(null);
      setReactivateError(null);
      try {
        const profile = await establishTrainerSession(token, identifier, refresh);
        setMe(profile);
        setEmail(profile.email ?? identifier);
        setArchivedAccount(null);
        setArchivedNotice(null);
      } catch (err) {
        if (err instanceof ArchivedAccountError) {
          enterArchived(err.purgeAfter, null);
          setEmail(identifier.trim().toLowerCase());
          return;
        }
        throw err;
      }
    },
    [enterArchived],
  );

  const signInDevTest = useCallback(
    async (rawEmail: string) => {
      if (!import.meta.env.DEV) {
        throw new AuthFlowError("generic", "Test sign-in is only available in development.");
      }
      const normalized = rawEmail.trim().toLowerCase();
      const uid = `trainer-${normalized}`;
      const idToken = createTestIdToken(uid, normalized);
      await signInWithToken(idToken, normalized);
    },
    [signInWithToken],
  );

  const signOut = useCallback(async () => {
    try {
      await apiClient.endWebSession();
    } catch {
      // Local sessions may rely on Bearer only; still clear client state.
    }
    cancelTokenRefresh();
    clearSession();
    setMe(null);
    setEmail(null);
    setSessionError(null);
    setArchivedAccount(null);
    setReactivateError(null);
  }, []);

  const finishAccountDeletion = useCallback((purgeAfter: string) => {
    const timeZone = meRef.current?.timezone ?? null;
    cancelTokenRefresh();
    void apiClient.endWebSession().catch(() => undefined);
    clearSession();
    setMe(null);
    setEmail(null);
    setArchivedAccount(null);
    setArchivedNotice({ purgeAfter, timeZone });
  }, []);

  const dismissArchivedNotice = useCallback(() => {
    setArchivedNotice(null);
  }, []);

  const reactivate = useCallback(async () => {
    if (reactivateRunningRef.current) return;
    reactivateRunningRef.current = true;
    setReactivating(true);
    setReactivateError(null);
    try {
      await apiClient.reactivateAccount();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === "RECENT_SIGN_IN_REQUIRED"
      ) {
        // Stale pre-archive session: end it and land on sign-in with the API's
        // own message (mobile Z12-29 parity). SignInPage reads sessionError;
        // RequireAuth navigates there when no token remains.
        reactivateRunningRef.current = false;
        await signOut();
        setSessionError(error.message);
        setReactivating(false);
        return;
      }
      setReactivateError(
        error instanceof ApiClientError
          ? error.message
          : "Something went wrong. Try again.",
      );
      reactivateRunningRef.current = false;
      setReactivating(false);
      return;
    }
    try {
      const profile = await apiClient.me();
      setMe(profile);
      setEmail(profile.email ?? getStoredEmail());
      setArchivedAccount(null);
    } catch (error) {
      setArchivedAccount(null);
      setSessionError(
        error instanceof Error ? error.message : "Something went wrong. Try again.",
      );
    } finally {
      reactivateRunningRef.current = false;
      setReactivating(false);
    }
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      email,
      loading,
      sessionError,
      archivedNotice,
      signInWithPassword: signInWithPasswordHandler,
      signInWithToken,
      signInDevTest,
      signOut,
      refreshMe,
      clearSessionError: () => setSessionError(null),
      finishAccountDeletion,
      dismissArchivedNotice,
    }),
    [
      me,
      email,
      loading,
      sessionError,
      archivedNotice,
      signInWithPasswordHandler,
      signInWithToken,
      signInDevTest,
      signOut,
      refreshMe,
      finishAccountDeletion,
      dismissArchivedNotice,
    ],
  );

  let body: ReactNode = children;
  if (archivedAccount) {
    body = (
      <ReactivateAccountPage
        purgeAfter={archivedAccount.purgeAfter}
        busy={reactivating}
        error={reactivateError}
        onReactivate={() => void reactivate()}
        onSignOut={() => void signOut()}
        timeZone={archivedAccount.timeZone ?? undefined}
        signedInAs={email}
      />
    );
  } else if (archivedNotice) {
    body = (
      <ArchivedNotice
        purgeAfter={archivedNotice.purgeAfter}
        timeZone={archivedNotice.timeZone}
        onDone={dismissArchivedNotice}
      />
    );
  }

  return <AuthContext.Provider value={value}>{body}</AuthContext.Provider>;
}

function ArchivedNotice({
  purgeAfter,
  timeZone,
  onDone,
}: {
  purgeAfter: string;
  timeZone: string | null;
  onDone: () => void;
}) {
  const zone = timeZone ?? "Asia/Kolkata";
  const date = formatPurgeDate(purgeAfter, zone);
  return (
    <main className="reactivate-shell" data-testid="account-archived">
      <div className="reactivate-brand">
        <span className="reactivate-brand-dot" aria-hidden="true" />
        <span>FitBud</span>
      </div>
      <section className="auth-panel reactivate-card" aria-labelledby="archived-title">
        <h1 id="archived-title">Account archived</h1>
        <p role="alert">{accountDeletionCopy.archived(date)}</p>
        <button
          type="button"
          className="button-primary"
          onClick={onDone}
          data-testid="account-archived-ok"
        >
          {accountDeletionCopy.archivedOk}
        </button>
      </section>
    </main>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export { AuthFlowError, ArchivedAccountError };
