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
import { AppState } from "react-native";
import { isTestIdToken } from "../lib/testToken";
import {
  createMobileApiClient,
  createTokenSession,
  isForegroundAppState,
  resolveApiBaseUrl,
  type SessionRefresh,
  type TokenSession,
} from "../lib/api";
import {
  clearPersistedSession,
  loadPersistedSession,
  persistSession,
  persistTokenState,
} from "../lib/sessionStorage";
import {
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

type AuthContextValue = {
  accessToken: string | null;
  selectedRole: Role | null;
  me: MeResponse | null;
  relationships: CoachingRelationship[];
  route: AppRoute;
  errorMessage: string | null;
  api: FitBudApiClient;
  pendingNotificationLink: NotificationDeepLink | null;
  pendingDeepLink: ParsedDeepLink | null;
  signInWithToken: (token: string, refresh?: SessionRefresh) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
  refreshSession: () => Promise<void>;
  selectRole: (role: Role) => Promise<void>;
  setActiveRelationship: (relationship: CoachingRelationship) => void;
  /** Handle a push notification open. Payload is routing only — not domain state. */
  handleNotificationOpen: (rawPayload: unknown) => NotificationDeepLink | null;
  clearPendingNotificationLink: () => void;
  clearPendingDeepLink: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function messageFromError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.message;
  }
  const message =
    error instanceof Error ? error.message : "Something went wrong.";
  if (message === "Network request failed") {
    return `Network request failed. Could not reach ${resolveApiBaseUrl()}.`;
  }
  return message;
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
  const [sessionHydrated, setSessionHydrated] = useState(
    !persisted.accessToken,
  );

  const selectedRoleRef = useRef<Role | null>(persisted.selectedRole);
  selectedRoleRef.current = selectedRole;
  // Set once signOut exists; the token session calls it when refresh is refused.
  const onExpiredRef = useRef<() => void>(() => undefined);

  // The token session owns the access token, refresh token and expiry
  // (D-W2-3). Web persists them in localStorage; native keeps them in memory
  // only (D-W2-13).
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
   * (D-B9). Best-effort: permission denied, a refused token or a failed call
   * never surfaces an error and never blocks the app.
   */
  const registerPushToken = useCallback(async (client: FitBudApiClient) => {
    const testMode = isTestIdToken(tokens.getAccessToken() ?? "");
    try {
      const outcome = await registerDeviceTokenForPush(client, { testMode });
      if (outcome.status !== "registered") {
        // permission_denied, rejected (DEVICE_TOKEN_OWNED) or failed: push
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

  const refreshSession = useCallback(async () => {
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
      });
    } catch (error) {
      // The client already tried one refresh before this 401 reached us.
      if (error instanceof ApiClientError && error.status === 401) {
        setMe(null);
        setSelectedRole(null);
        selectedRoleRef.current = null;
        tokens.clear();
        clearPersistedSession();
        setRelationships([]);
        setRelationshipsLoaded(true);
        setNeedsAccountLink(true);
      } else {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      setBootstrapping(false);
      setSessionHydrated(true);
    }
  }, [api, applyMe, tokens]);

  useEffect(() => {
    if (!persisted.accessToken) return;
    void refreshSession();
  }, []);

  const selectRole = useCallback(
    async (role: Role) => {
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
      } catch (error) {
        setErrorMessage(messageFromError(error));
      } finally {
        setBootstrapping(false);
      }
    },
    [api, applyMe, me],
  );

  const signInWithToken = useCallback(
    async (token: string, refresh?: SessionRefresh) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setErrorMessage("Enter a test identity token or Firebase UID.");
        return;
      }
      selectedRoleRef.current = null;
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

      try {
        // Probe without a role first so single-role users resolve selectedRole.
        selectedRoleRef.current = null;
        const meResponse = await api.me();
        await applyMe(meResponse, null, api);
        persistSession({
          accessToken: tokens.getAccessToken(),
          selectedRole: selectedRoleRef.current,
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          // No FitBud user yet — accept invite will create/link the account.
          setNeedsAccountLink(true);
          setRelationshipsLoaded(true);
        } else {
          tokens.clear();
          clearPersistedSession();
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
    setPendingNotificationLink(null);
    setPendingDeepLink(null);
    clearPersistedSession();
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

  const route = resolveAppRoute({
    accessToken,
    bootstrapping: bootstrapping || !sessionHydrated,
    me,
    selectedRole,
    needsAccountLink,
    relationships: relationshipsLoaded ? relationships : null,
  });

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
      pendingDeepLink,
      signInWithToken,
      signOut,
      clearError: () => setErrorMessage(null),
      refreshSession,
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
      pendingDeepLink,
      signInWithToken,
      signOut,
      refreshSession,
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
