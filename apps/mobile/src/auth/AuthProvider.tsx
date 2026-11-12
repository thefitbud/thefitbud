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
import {
  ApiClientError,
  type FitBudApiClient,
} from "@fitbud/api-client";
import type {
  CoachingRelationship,
  MeResponse,
  Role,
} from "@fitbud/contracts";
import { AppState, Platform } from "react-native";
import { isTestIdToken } from "../lib/testToken";
import { authErrorCopy } from "../lib/authErrors";
import {
  createMobileApiClient,
  createTokenSession,
  isForegroundAppState,
  type SessionRefresh,
  type TokenSession,
} from "../lib/api";
import {
  clearPersistedSession,
  loadNativeSession,
  loadPersistedSession,
  loadRememberRole,
  persistRememberRole,
  persistSession,
  persistTokenState,
} from "../lib/sessionStorage";
import { reportError } from "../lib/reportError";
import {
  OFFLINE_MESSAGE,
  SIGNED_OUT_MESSAGE,
  restoreSession,
} from "./sessionRestore";
import {
  coachViewSwitchPrompt,
  mobilePermittedRoles,
  resolveAppRoute,
  selectInitialMobileRole,
  type AppRoute,
} from "../navigation/resolveRoute";
import type { ParsedDeepLink } from "../navigation/linking";
import { useAppDeepLinks } from "../navigation/useAppDeepLinks";
import {
  registerDeviceTokenForPush,
  signOutPushRegistration,
  watchPushTokenChanges,
} from "../notifications/register";
import type { NotificationDeepLink } from "../notifications/routing";
import { deepLinkFromNotificationPayload } from "../notifications/routing";
import { clearTrainerCache, setTrainerCacheOwner } from "../trainer/cache";

type AuthContextValue = {
  accessToken: string | null;
  selectedRole: Role | null;
  me: MeResponse | null;
  relationships: CoachingRelationship[];
  route: AppRoute;
  errorMessage: string | null;
  api: FitBudApiClient;
  pendingNotificationLink: NotificationDeepLink | null;
  /**
   * A parsed link for the shells to open. Null while `pendingRoleSwitch` asks
   * first, so the trainee shell never opens a coach link itself.
   */
  pendingDeepLink: ParsedDeepLink | null;
  /** Frame 61: a link needs the trainer role while in trainee mode (Z11-14). */
  pendingRoleSwitch: { targetRole: "trainer"; linkKind: ParsedDeepLink["kind"] } | null;
  /** Switch to the trainer role; the trainer shell then opens the link. */
  confirmRoleSwitch: () => Promise<void>;
  /** Drop the link and stay in the current role. */
  cancelRoleSwitch: () => void;
  /** "Remember my choice" as stored (frame 59); ticked after every sign-in. */
  rememberRole: boolean;
  /** Trainer More's "Switch role": show role select (frame 59). */
  requestRoleSelect: () => void;
  signInWithToken: (token: string, refresh?: SessionRefresh) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
  refreshSession: () => Promise<void>;
  /**
   * Reload `/me` without the loading state, so the current screen and tab
   * stay put (profile Save, Z11-14). Never shows an error screen.
   */
  reloadMe: () => Promise<void>;
  /** `remember` stores "Remember my choice"; omitted keeps the stored value. */
  selectRole: (role: Role, options?: { remember?: boolean }) => Promise<void>;
  setActiveRelationship: (relationship: CoachingRelationship) => void;
  /** Handle a push notification open. Payload is routing only — not domain state. */
  handleNotificationOpen: (rawPayload: unknown) => NotificationDeepLink | null;
  clearPendingNotificationLink: () => void;
  clearPendingDeepLink: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * User-facing text for a failed call. Never a raw `error.message` (a ZodError's
 * is a JSON dump): API errors keep the API's own message, known failure
 * classes get a short code (`AUTH-NET`, `AUTH-PARSE`, ...), and a dev build
 * logs the details (D-W3-12).
 */
function messageFromError(error: unknown): string {
  return authErrorCopy(error, "general", "messageFromError");
}

/**
 * Every path that ends the session drops the trainer's offline snapshots and
 * the cache owner, so the next person on this phone never reads them (Z11-8).
 */
function endTrainerCacheSession(): void {
  clearTrainerCache();
  setTrainerCacheOwner(null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Read once: later renders must not re-read storage.
  const [persisted] = useState(() => loadPersistedSession());
  const [accessToken, setAccessToken] = useState<string | null>(
    persisted.accessToken,
  );
  const [selectedRole, setSelectedRole] = useState<Role | null>(
    persisted.selectedRole,
  );
  const [me, setMe] = useState<MeResponse | null>(null);
  const [relationships, setRelationships] = useState<CoachingRelationship[]>(
    [],
  );
  const [relationshipsLoaded, setRelationshipsLoaded] = useState(false);
  const [needsAccountLink, setNeedsAccountLink] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(
    Boolean(persisted.accessToken),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingNotificationLink, setPendingNotificationLink] =
    useState<NotificationDeepLink | null>(null);
  const [pendingDeepLink, setPendingDeepLink] =
    useState<ParsedDeepLink | null>(null);
  const [rememberRole, setRememberRole] = useState(() => loadRememberRole());
  const [roleSelectRequested, setRoleSelectRequested] = useState(false);
  // Native reads SecureStore asynchronously (D-W3-11): hold the splash until
  // that restore has answered, so sign-in never flashes for a signed-in user.
  const [restorePhase, setRestorePhase] = useState<"restoring" | "offline" | "done">(
    Platform.OS === "web" ? "done" : "restoring",
  );
  const [sessionHydrated, setSessionHydrated] = useState(
    !persisted.accessToken && Platform.OS === "web",
  );

  const selectedRoleRef = useRef<Role | null>(persisted.selectedRole);
  selectedRoleRef.current = selectedRole;
  // Set once signOut exists; the token session calls it when refresh is refused.
  const onExpiredRef = useRef<() => void>(() => undefined);

  // The token session owns the access token, refresh token and expiry
  // (D-W2-3). Web persists them in localStorage; native persists only the
  // refresh token, in SecureStore (D-W3-11).
  const { api, tokens } = useMemo(() => {
    let client: FitBudApiClient | null = null;
    const session: TokenSession = createTokenSession({
      initial: {
        accessToken: persisted.accessToken,
        refreshToken: persisted.refreshToken,
        expiresAt: persisted.expiresAt,
      },
      refreshAuth: (refreshToken) => client!.refreshAuth(refreshToken),
      persist: (state) => {
        setAccessToken(state.accessToken);
        persistTokenState(state, selectedRoleRef.current);
      },
      onExpired: () => onExpiredRef.current(),
    });
    client = createMobileApiClient({
      getAccessToken: () => session.getAccessToken(),
      getSelectedRole: () => selectedRoleRef.current,
      refreshAccessToken: () => session.refresh(),
    });
    return { api: client, tokens: session };
  }, []);

  // Timer runs in the foreground only; on return to the foreground it
  // refreshes straight away if the expiry has passed.
  useEffect(() => {
    // The provider mounts while the app is on screen; currentState can still
    // read "unknown" this early on some platforms.
    tokens.setForeground(AppState.currentState !== "background");
    const subscription = AppState.addEventListener("change", (next) => {
      tokens.setForeground(isForegroundAppState(next));
    });
    return () => {
      subscription.remove();
      tokens.setForeground(false);
    };
  }, [tokens]);

  const loadRelationships = useCallback(
    async (client: FitBudApiClient) => {
      const page = await client.listRelationships({ limit: 50 });
      setRelationships(page.items);
      setRelationshipsLoaded(true);
      return page.items;
    },
    [],
  );

  // Set when a device token is registered, so sign-out can unregister it.
  const pushInstallationRef = useRef<string | null>(null);
  const stopPushTokenWatchRef = useRef<(() => void) | null>(null);

  /**
   * Register this device for push after `/me` succeeds, for either role
   * (D-B9). Best-effort: permission denied, or a failed call
   * never surfaces an error and never blocks the app.
   */
  const registerPushToken = useCallback(async (client: FitBudApiClient) => {
    const testMode = isTestIdToken(tokens.getAccessToken() ?? "");
    try {
      const outcome = await registerDeviceTokenForPush(client, { testMode });
      if (outcome.status !== "registered") {
        // permission_denied or failed: push
        // stays off for this install, the app carries on.
        return;
      }
      pushInstallationRef.current = outcome.registration.installationId;
      if (!stopPushTokenWatchRef.current) {
        stopPushTokenWatchRef.current = await watchPushTokenChanges(client, {
          testMode,
        });
      }
    } catch {
      // Push registration is best-effort.
    }
  }, [tokens]);

  useEffect(
    () => () => {
      stopPushTokenWatchRef.current?.();
      stopPushTokenWatchRef.current = null;
    },
    [],
  );

  const applyMe = useCallback(
    async (
      meResponse: MeResponse,
      preferredRole: Role | null,
      client: FitBudApiClient,
    ) => {
      const autoRole = selectInitialMobileRole(meResponse.permittedRoles);
      const role =
        preferredRole && meResponse.permittedRoles.includes(preferredRole)
          ? preferredRole
          : autoRole;
      // The cache owner comes only from the server's `/me`, never from cached
      // data (Z11-8). Set before any trainer screen can mount and read.
      setTrainerCacheOwner(meResponse.userId);
      setMe(meResponse);
      setSelectedRole(role);
      selectedRoleRef.current = role;
      setNeedsAccountLink(false);

      if (role === "trainee" || role === "trainer") {
        await loadRelationships(client);
        // Both roles may register a device (D-B9); the route allows trainer
        // and trainee once a role is selected.
        await registerPushToken(client);
      } else {
        // Dual-role awaiting explicit selection.
        setRelationships([]);
        setRelationshipsLoaded(true);
      }
    },
    [loadRelationships, registerPushToken],
  );

  const restorePhaseRef = useRef(restorePhase);
  restorePhaseRef.current = restorePhase;
  const restoreStartedRef = useRef(false);

  /**
   * Native startup restore and its Retry (AB3). Reads SecureStore, refreshes
   * the ID token, then loads `/me`. Only a definitive refusal signs the user
   * out; a network problem keeps the stored session and offers Retry.
   */
  const runRestore = useCallback(async () => {
    restorePhaseRef.current = "restoring";
    setRestorePhase("restoring");
    setErrorMessage(null);
    const offline = () => {
      restorePhaseRef.current = "offline";
      setRestorePhase("offline");
      setErrorMessage(OFFLINE_MESSAGE);
      setBootstrapping(false);
      setSessionHydrated(true);
    };
    const clearSession = () => {
      tokens.clear();
      clearPersistedSession();
      endTrainerCacheSession();
    };
    const result = await restoreSession({
      load: loadNativeSession,
      refreshAuth: (refreshToken) => api.refreshAuth(refreshToken),
      adoptTokens: (token, refresh) => tokens.signIn(token, refresh),
      fetchMe: () => api.me(),
      clearSession,
    });
    // Native knows the stored "Remember my choice" only once it has loaded.
    setRememberRole(loadRememberRole());

    if (result.status === "signed_in") {
      try {
        await applyMe(result.me, result.preferredRole, api);
        persistSession({
          accessToken: tokens.getAccessToken(),
          selectedRole: selectedRoleRef.current,
          userId: result.me.userId,
        });
        restorePhaseRef.current = "done";
        setRestorePhase("done");
        setBootstrapping(false);
        setSessionHydrated(true);
        return;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          clearSession();
          setMe(null);
          setSelectedRole(null);
          selectedRoleRef.current = null;
          setRelationships([]);
          setErrorMessage(SIGNED_OUT_MESSAGE);
          restorePhaseRef.current = "done";
          setRestorePhase("done");
          setBootstrapping(false);
          setSessionHydrated(true);
          return;
        }
        offline();
        return;
      }
    }
    if (result.status === "offline") {
      offline();
      return;
    }
    // Signed out: nothing stored, or the server refused the session.
    setMe(null);
    setSelectedRole(null);
    selectedRoleRef.current = null;
    setRelationships([]);
    setErrorMessage(result.reason === "refused" ? SIGNED_OUT_MESSAGE : null);
    restorePhaseRef.current = "done";
    setRestorePhase("done");
    setBootstrapping(false);
    setSessionHydrated(true);
  }, [api, applyMe, tokens]);

  /** `/me` answered 401 after the client's own refresh: the session is gone. */
  const dropRefusedSession = useCallback(() => {
    setMe(null);
    setSelectedRole(null);
    selectedRoleRef.current = null;
    tokens.clear();
    clearPersistedSession();
    endTrainerCacheSession();
    setRelationships([]);
    setRelationshipsLoaded(true);
    setNeedsAccountLink(true);
    setRoleSelectRequested(false);
  }, [tokens]);

  const refreshSession = useCallback(async () => {
    if (restorePhaseRef.current === "offline") {
      // Retry after "Can't reach FitBud": run the whole restore again.
      await runRestore();
      return;
    }
    if (!tokens.getAccessToken()) {
      return;
    }
    setBootstrapping(true);
    setErrorMessage(null);
    try {
      const meResponse = await api.me();
      await applyMe(meResponse, selectedRoleRef.current, api);
      persistSession({
        accessToken: tokens.getAccessToken(),
        selectedRole: selectedRoleRef.current,
        userId: meResponse.userId,
      });
    } catch (error) {
      // The client already tried one refresh before this 401 reached us.
      if (error instanceof ApiClientError && error.status === 401) {
        dropRefusedSession();
      } else {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      setBootstrapping(false);
      setSessionHydrated(true);
    }
  }, [api, applyMe, dropRefusedSession, runRestore, tokens]);

  const reloadMe = useCallback(async () => {
    if (!tokens.getAccessToken() || restorePhaseRef.current !== "done") {
      return;
    }
    try {
      const meResponse = await api.me();
      const role = selectedRoleRef.current;
      if (role && meResponse.permittedRoles.includes(role)) {
        // Same role: only `me` changes, so no screen remounts.
        setTrainerCacheOwner(meResponse.userId);
        setMe(meResponse);
      } else {
        // The server no longer permits the role: resolve it as a launch would.
        await applyMe(meResponse, role, api);
      }
      persistSession({
        accessToken: tokens.getAccessToken(),
        selectedRole: selectedRoleRef.current,
        userId: meResponse.userId,
      });
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        dropRefusedSession();
        return;
      }
      // Quiet: the screen keeps the `me` it has; nothing blames the user.
      reportError("auth-reload-me", error);
    }
  }, [api, applyMe, dropRefusedSession, tokens]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      if (restoreStartedRef.current) return;
      restoreStartedRef.current = true;
      void runRestore();
      return;
    }
    if (!persisted.accessToken) return;
    void refreshSession();
  }, []);

  const selectRole = useCallback(
    async (role: Role, options?: { remember?: boolean }) => {
      if (!me || !me.permittedRoles.includes(role)) {
        setErrorMessage("That role is not permitted for this account.");
        return;
      }
      setBootstrapping(true);
      setErrorMessage(null);
      try {
        setSelectedRole(role);
        selectedRoleRef.current = role;
        // Re-fetch /me with the role header so selectedRole is authoritative.
        const meResponse = await api.me();
        await applyMe(meResponse, role, api);
        // "Remember my choice" first: when it is off, the role below is not
        // stored and the next launch asks again (frame 59, Z11-14).
        if (options?.remember !== undefined) {
          persistRememberRole(options.remember);
          setRememberRole(options.remember);
        }
        persistSession({
          accessToken: tokens.getAccessToken(),
          selectedRole: selectedRoleRef.current,
          userId: meResponse.userId,
        });
        setRoleSelectRequested(false);
      } catch (error) {
        setErrorMessage(messageFromError(error));
      } finally {
        setBootstrapping(false);
      }
    },
    [api, applyMe, me, tokens],
  );

  const signInWithToken = useCallback(
    async (token: string, refresh?: SessionRefresh) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setErrorMessage("Enter a test identity token or Firebase UID.");
        return;
      }
      selectedRoleRef.current = null;
      // No owner until this sign-in's `/me` answers (Z11-8).
      setTrainerCacheOwner(null);
      tokens.signIn(trimmed, refresh);
      persistSession({ accessToken: trimmed, selectedRole: null });
      setBootstrapping(true);
      setErrorMessage(null);
      setNeedsAccountLink(false);
      setMe(null);
      setSelectedRole(null);
      selectedRoleRef.current = null;
      setRelationships([]);
      setRelationshipsLoaded(false);
      setRoleSelectRequested(false);
      setRememberRole(loadRememberRole());

      try {
        // Probe without a role first so single-role users resolve selectedRole.
        selectedRoleRef.current = null;
        const meResponse = await api.me();
        await applyMe(meResponse, null, api);
        persistSession({
          accessToken: tokens.getAccessToken(),
          selectedRole: selectedRoleRef.current,
          userId: meResponse.userId,
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          // No FitBud user yet — accept invite will create/link the account.
          setNeedsAccountLink(true);
          setRelationshipsLoaded(true);
        } else {
          tokens.clear();
          clearPersistedSession();
          endTrainerCacheSession();
          setErrorMessage(messageFromError(error));
        }
      } finally {
        setBootstrapping(false);
        setSessionHydrated(true);
      }
    },
    [api, applyMe, tokens],
  );

  const signOut = useCallback(() => {
    // Clear push state and unregister this installation before the session is
    // cleared. The revoke runs on a client that holds the current token and
    // role, so the request is authenticated whatever order the promises settle
    // in. Fire-and-forget: sign-out never waits on it and never fails because
    // of it; the module state is cleared either way.
    const installationId = pushInstallationRef.current;
    const accessToken = tokens.getAccessToken();
    const role = selectedRoleRef.current;
    stopPushTokenWatchRef.current?.();
    stopPushTokenWatchRef.current = null;
    pushInstallationRef.current = null;
    signOutPushRegistration({
      installationId,
      client: accessToken
        ? createMobileApiClient({
            getAccessToken: () => accessToken,
            getSelectedRole: () => role,
          })
        : null,
    });

    tokens.clear();
    selectedRoleRef.current = null;
    setAccessToken(null);
    setSelectedRole(null);
    setMe(null);
    setRelationships([]);
    setRelationshipsLoaded(false);
    setNeedsAccountLink(false);
    setErrorMessage(null);
    setBootstrapping(false);
    setSessionHydrated(true);
    restorePhaseRef.current = "done";
    setRestorePhase("done");
    setPendingNotificationLink(null);
    setPendingDeepLink(null);
    setRoleSelectRequested(false);
    clearPersistedSession();
    // Cleared with the session: the next sign-in starts ticked.
    setRememberRole(true);
    endTrainerCacheSession();
  }, [tokens]);
  onExpiredRef.current = signOut;

  const setActiveRelationship = useCallback(
    (relationship: CoachingRelationship) => {
      setRelationships((current) => {
        const without = current.filter((item) => item.id !== relationship.id);
        return [relationship, ...without];
      });
      setRelationshipsLoaded(true);
      // Keep needsAccountLink until /me succeeds so we do not flash to auth.
    },
    [],
  );

  const handleNotificationOpen = useCallback((rawPayload: unknown) => {
    const link = deepLinkFromNotificationPayload(rawPayload);
    setPendingNotificationLink(link);
    return link;
  }, []);

  const clearPendingNotificationLink = useCallback(() => {
    setPendingNotificationLink(null);
  }, []);

  const clearPendingDeepLink = useCallback(() => {
    setPendingDeepLink(null);
  }, []);

  const onDeepLink = useCallback((link: ParsedDeepLink) => {
    setPendingDeepLink(link);
  }, []);
  useAppDeepLinks(onDeepLink);

  // Frame 61 (Z11-14): a coach link in trainee mode asks before switching.
  const pendingRoleSwitch = useMemo(() => {
    if (!pendingDeepLink || !me) return null;
    const prompt = coachViewSwitchPrompt({
      selectedRole,
      permittedRoles: me.permittedRoles,
      linkKind: pendingDeepLink.kind,
    });
    return prompt
      ? { targetRole: prompt.targetRole, linkKind: pendingDeepLink.kind }
      : null;
  }, [pendingDeepLink, me, selectedRole]);
  const visibleDeepLink = pendingRoleSwitch ? null : pendingDeepLink;

  const confirmRoleSwitch = useCallback(async () => {
    // The link stays pending; once the role is trainer it is no longer held
    // back, and the trainer shell opens it.
    await selectRole("trainer");
  }, [selectRole]);

  const cancelRoleSwitch = useCallback(() => {
    setPendingDeepLink(null);
  }, []);

  const requestRoleSelect = useCallback(() => {
    if (!me || mobilePermittedRoles(me.permittedRoles).length < 2) return;
    setRoleSelectRequested(true);
  }, [me]);

  const resolvedRoute = resolveAppRoute({
    accessToken,
    bootstrapping: bootstrapping || !sessionHydrated,
    me,
    selectedRole,
    needsAccountLink,
    relationships: relationshipsLoaded ? relationships : null,
    roleSelectRequested,
  });
  // Native restore (AB3). While SecureStore and the refresh answer, show the
  // splash, never sign-in. If the network failed, any route other than "auth"
  // and "loading" makes AppRouter show its error screen (message + Retry +
  // Sign out), so the stored session is kept and never replaced by sign-in.
  const route: AppRoute =
    restorePhase === "restoring"
      ? { name: "loading" }
      : restorePhase === "offline"
        ? errorMessage
          ? { name: "unsupported_role" }
          : { name: "loading" }
        : resolvedRoute;

  const value = useMemo<AuthContextValue>(
    () => ({
      accessToken,
      selectedRole,
      me,
      relationships,
      route,
      errorMessage,
      api,
      pendingNotificationLink,
      pendingDeepLink: visibleDeepLink,
      pendingRoleSwitch,
      confirmRoleSwitch,
      cancelRoleSwitch,
      rememberRole,
      requestRoleSelect,
      signInWithToken,
      signOut,
      clearError: () => setErrorMessage(null),
      refreshSession,
      reloadMe,
      selectRole,
      setActiveRelationship,
      handleNotificationOpen,
      clearPendingNotificationLink,
      clearPendingDeepLink,
    }),
    [
      accessToken,
      selectedRole,
      me,
      relationships,
      route,
      errorMessage,
      api,
      pendingNotificationLink,
      visibleDeepLink,
      pendingRoleSwitch,
      confirmRoleSwitch,
      cancelRoleSwitch,
      rememberRole,
      requestRoleSelect,
      signInWithToken,
      signOut,
      refreshSession,
      reloadMe,
      selectRole,
      setActiveRelationship,
      handleNotificationOpen,
      clearPendingNotificationLink,
      clearPendingDeepLink,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return value;
}

export { messageFromError };
