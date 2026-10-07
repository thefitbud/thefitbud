import {
  createContext,
  useCallback,
  useContext,
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
import { createMobileApiClient, resolveApiBaseUrl } from "../lib/api";
import {
  resolveAppRoute,
  selectInitialMobileRole,
  type AppRoute,
} from "../navigation/resolveRoute";
import { registerLocalDeviceToken } from "../notifications/register";
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
  signInWithToken: (token: string) => Promise<void>;
  signOut: () => void;
  clearError: () => void;
  refreshSession: () => Promise<void>;
  selectRole: (role: Role) => Promise<void>;
  setActiveRelationship: (relationship: CoachingRelationship) => void;
  /** Handle a push notification open. Payload is routing only — not domain state. */
  handleNotificationOpen: (rawPayload: unknown) => NotificationDeepLink | null;
  clearPendingNotificationLink: () => void;
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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [relationships, setRelationships] = useState<CoachingRelationship[]>(
    [],
  );
  const [relationshipsLoaded, setRelationshipsLoaded] = useState(false);
  const [needsAccountLink, setNeedsAccountLink] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingNotificationLink, setPendingNotificationLink] =
    useState<NotificationDeepLink | null>(null);

  const accessTokenRef = useRef<string | null>(null);
  const selectedRoleRef = useRef<Role | null>(null);
  accessTokenRef.current = accessToken;
  selectedRoleRef.current = selectedRole;

  const api = useMemo(
    () =>
      createMobileApiClient({
        getAccessToken: () => accessTokenRef.current,
        getSelectedRole: () => selectedRoleRef.current,
      }),
    [],
  );

  const loadRelationships = useCallback(
    async (client: FitBudApiClient) => {
      const page = await client.listRelationships({ limit: 50 });
      setRelationships(page.items);
      setRelationshipsLoaded(true);
      return page.items;
    },
    [],
  );

  const registerPushToken = useCallback(async (client: FitBudApiClient) => {
    try {
      await registerLocalDeviceToken(client);
    } catch {
      // Push registration is best-effort in local test mode.
    }
  }, []);

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
    if (!accessTokenRef.current) {
      return;
    }
    setBootstrapping(true);
    setErrorMessage(null);
    try {
      const meResponse = await api.me();
      await applyMe(meResponse, selectedRoleRef.current, api);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setMe(null);
        setSelectedRole(null);
        selectedRoleRef.current = null;
        setRelationships([]);
        setRelationshipsLoaded(true);
        setNeedsAccountLink(true);
      } else {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      setBootstrapping(false);
    }
  }, [api, applyMe]);

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
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setErrorMessage("Enter a test identity token or Firebase UID.");
        return;
      }
      accessTokenRef.current = trimmed;
      setAccessToken(trimmed);
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
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          // No FitBud user yet — accept invite will create/link the account.
          setNeedsAccountLink(true);
          setRelationshipsLoaded(true);
        } else {
          setAccessToken(null);
          accessTokenRef.current = null;
          setErrorMessage(messageFromError(error));
        }
      } finally {
        setBootstrapping(false);
      }
    },
    [api, applyMe],
  );

  const signOut = useCallback(() => {
    accessTokenRef.current = null;
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
  }, []);

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

  const route = resolveAppRoute({
    accessToken,
    bootstrapping,
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
      signInWithToken,
      signOut,
      clearError: () => setErrorMessage(null),
      refreshSession,
      selectRole,
      setActiveRelationship,
      handleNotificationOpen,
      clearPendingNotificationLink,
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
      signInWithToken,
      signOut,
      refreshSession,
      selectRole,
      setActiveRelationship,
      handleNotificationOpen,
      clearPendingNotificationLink,
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
