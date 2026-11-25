import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiClientError, type FitBudApiClient, userFacingMessage } from "@fitbud/api-client";
import {
  accountArchivedErrorDetailsSchema,
  type CoachingRelationship,
  type MeResponse,
  type NotificationType,
  type Role,
} from "@fitbud/contracts";
import { AppState, Platform, View } from "react-native";
import { isTestIdToken } from "../lib/testToken";
import { authErrorCopy } from "../lib/authErrors";
import {
  createMobileApiClient,
  createTokenSession,
  isForegroundAppState,
  onApiActivity,
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
  clearMeSnapshot,
  loadMeSnapshot,
  saveMeSnapshot,
  type MeSnapshot,
} from "./meSnapshot";
import { clearSyncDataOnSignOut } from "../sync/userStore";
import { deviceStorage } from "../sync/storage";
import { discardMealPhotoJobs, stopMealPhotoJobs } from "../trainee/food/mealPhotoJobs";
import {
  coachViewSwitchPrompt,
  mobilePermittedRoles,
  resolveAppRoute,
  roleSelectCanGoBack,
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
import { clearDayViews } from "../trainee/dataCache";
import { isNetworkFailure } from "../trainer/attention/offline";

// Z12-29: loaded only when an archived account or the archived notice shows.
const ArchivedAccountOverlay = lazy(() =>
  import("./ReactivateAccountScreen").then((module) => ({
    default: module.ArchivedAccountOverlay,
  })),
);

type AuthContextValue = {
  accessToken: string | null;
  selectedRole: Role | null;
  me: MeResponse | null;
  relationships: CoachingRelationship[];
  route: AppRoute;
  errorMessage: string | null;
  /**
   * Set while the app is open on the stored snapshot of the last `/me`
   * because a cold start could not reach the server (Z12-41). `me` and
   * `relationships` are then the cached ones, saved at `savedAt`. Null once
   * the server has answered.
   */
  offlineSnapshot: { savedAt: string } | null;
  api: FitBudApiClient;
  pendingNotificationLink: NotificationDeepLink | null;
  /**
   * A parsed link for the shells to open. Null while `pendingRoleSwitch` asks
   * first, so the trainee shell never opens a coach link itself.
   */
  pendingDeepLink: ParsedDeepLink | null;
  /**
   * Frame 61 / TM-08c: a link (Z11-14) or a coach push (Z12-49) needs the
   * trainer role while in trainee mode. `pushType` is set for a push.
   */
  pendingRoleSwitch: PendingRoleSwitch | null;
  /** Switch to the trainer role; the trainer shell then opens the link. */
  confirmRoleSwitch: () => Promise<void>;
  /** Drop the link and stay in the current role. */
  cancelRoleSwitch: () => void;
  /** "Remember my choice" as stored (frame 59); ticked after every sign-in. */
  rememberRole: boolean;
  /** Trainer More's "Switch role": show role select (frame 59). */
  requestRoleSelect: () => void;
  /**
   * Role select was opened from More over a role already in use, so it can be
   * left with Back (TM-08a, Z12-49). False on first run, when there is no role
   * to go back to.
   */
  canLeaveRoleSelect: boolean;
  /** Back from role select opened in More: clears the request, keeps the role. */
  leaveRoleSelect: () => void;
  /**
   * A coach push was tapped in trainee mode (Z12-49): ask to switch. `onCancel`
   * runs when the user keeps the client view, so the tap is dropped.
   */
  offerPushRoleSwitch: (pushType: NotificationType, onCancel: () => void) => void;
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
  /**
   * Z12-29: `POST /account/deletion` answered (archived until `purgeAfter`).
   * Ends the session and shows the archived notice.
   */
  finishAccountDeletion: (purgeAfter: string) => void;
};

export type PendingRoleSwitch = {
  targetRole: "trainer";
  linkKind: ParsedDeepLink["kind"] | "push";
  pushType?: NotificationType;
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
 * Every path that ends the session drops the trainer's offline snapshots, the
 * cache owner and the stored `/me` snapshot, so the next person on this phone
 * never reads them (Z11-8, Z12-41).
 */
function endTrainerCacheSession(): void {
  clearTrainerCache();
  setTrainerCacheOwner(null);
  void clearMeSnapshot();
  // The trainee day cache too (hand-off from Z12-40): the next person on this
  // phone, or the next account, never sees the last one's days.
  clearDayViews();
}

/**
 * `purgeAfter` when the API refused the call because the account is archived
 * (Z6-14: 403 ACCOUNT_ARCHIVED with the caller's own purge date), else null.
 */
export function archivedPurgeAfter(error: unknown): string | null {
  if (
    !(error instanceof ApiClientError) ||
    error.status !== 403 ||
    error.code !== "ACCOUNT_ARCHIVED"
  ) {
    return null;
  }
  const details = accountArchivedErrorDetailsSchema.safeParse(error.details);
  return details.success ? details.data.purgeAfter : null;
}

/** How often an app opened on the snapshot asks the server again. */
const SNAPSHOT_RETRY_MS = 30_000;
/**
 * Route resolution only: stands in for the ID token while the app is open on
 * the snapshot and the token has not been minted yet. Never sent anywhere.
 */
const SNAPSHOT_SESSION = "offline-snapshot";

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
  // The account's own time zone for the archived screens' purge date, read
  // just before the account is archived or found archived (Z12-29).
  const meRef = useRef<MeResponse | null>(null);
  meRef.current = me;
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
  const [offlineSnapshot, setOfflineSnapshot] = useState<{
    savedAt: string;
  } | null>(null);
  const snapshotModeRef = useRef(false);
  // Z12-29: signed in to an archived account (reactivate screen), and the
  // notice after this phone deleted the account (no session any more).
  // `timeZone` is the account's own (`me.timezone`) when it was known just
  // before; null falls back to the phone's.
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
  // Which reactivate note to show: the role this phone last used.
  const lastRoleRef = useRef<Role | null>(persisted.selectedRole);
  const leaveSnapshotMode = useCallback(() => {
    snapshotModeRef.current = false;
    setOfflineSnapshot(null);
  }, []);

  const selectedRoleRef = useRef<Role | null>(persisted.selectedRole);
  selectedRoleRef.current = selectedRole;
  // Whether the app already shows a loaded account, read by refreshSession
  // when `/me` fails mid-session (Z11b-7).
  const accountLoadedRef = useRef(false);
  accountLoadedRef.current = me !== null && relationshipsLoaded;
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
    } catch (error) {
      // Push registration is best-effort: never an error on screen.
      reportError("auth-push-register", error);
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
      // data (Z11-8). Set before any trainer screen can mount and read. A
      // different user than the current owner removes the previous trainer's
      // entries and drops any write from a fetch started before (Z12-33).
      setTrainerCacheOwner(meResponse.userId);
      // The server answered: whatever was on screen from the snapshot is
      // replaced by this.
      leaveSnapshotMode();
      setMe(meResponse);
      setSelectedRole(role);
      selectedRoleRef.current = role;
      if (role) lastRoleRef.current = role;
      setNeedsAccountLink(false);
      setArchivedAccount(null);

      if (role === "trainee" || role === "trainer") {
        await loadRelationships(client);
        // Both roles may register a device (D-B9); the route allows trainer
        // and trainee once a role is selected. Z14-3: not awaited, so the first
        // screen renders without waiting on permission prompts and token calls.
        void registerPushToken(client).catch((error: unknown) => {
          reportError("auth-push-register", error);
        });
      } else {
        // Dual-role awaiting explicit selection.
        setRelationships([]);
        setRelationshipsLoaded(true);
      }
    },
    [leaveSnapshotMode, loadRelationships, registerPushToken],
  );

  /**
   * The account is archived (Z12-29): show the reactivate screen instead of
   * the app. Nothing else loads while archived.
   *
   * The token is kept for "Reactivate my account". Reactivation needs a
   * sign-in made after the archive (D-W6-31). A fresh sign-in is one, but a
   * session restored, refreshed or reloaded after the account was archived on
   * another device holds a token from before, which the API refuses with
   * RECENT_SIGN_IN_REQUIRED; `reactivate` then ends the session so the user
   * signs in again first.
   *
   * The `/me` snapshot, the trainer cache and the day views are dropped too,
   * so an offline cold start never opens on the archived account's data.
   */
  const enterArchived = useCallback((purgeAfter: string) => {
    const timeZone = meRef.current?.timezone ?? null;
    snapshotModeRef.current = false;
    setOfflineSnapshot(null);
    setMe(null);
    setRelationships([]);
    setRelationshipsLoaded(true);
    setNeedsAccountLink(false);
    setErrorMessage(null);
    setReactivateError(null);
    endTrainerCacheSession();
    setArchivedAccount({ purgeAfter, timeZone });
  }, []);

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
    /**
     * Cold start with no network (Z12-41): open on this user's stored `/me`
     * instead of the error screen. The trainer cache owner is not set here:
     * it comes only from a `/me` the server answered (Z11-8).
     */
    const openFromSnapshot = (snapshot: MeSnapshot, preferredRole: Role | null) => {
      const autoRole = selectInitialMobileRole(snapshot.me.permittedRoles);
      const role =
        preferredRole && snapshot.me.permittedRoles.includes(preferredRole)
          ? preferredRole
          : autoRole;
      snapshotModeRef.current = true;
      setOfflineSnapshot({ savedAt: snapshot.savedAt });
      setMe(snapshot.me);
      setSelectedRole(role);
      selectedRoleRef.current = role;
      setRelationships(snapshot.relationships);
      setRelationshipsLoaded(true);
      setNeedsAccountLink(false);
      setErrorMessage(null);
      restorePhaseRef.current = "done";
      setRestorePhase("done");
      setBootstrapping(false);
      setSessionHydrated(true);
    };
    // An archived account answers `/me` with 403 ACCOUNT_ARCHIVED, which the
    // restore would read as offline: catch it here and route to reactivate.
    let archivedUntil: string | null = null;
    const result = await restoreSession({
      load: loadNativeSession,
      refreshAuth: (refreshToken) => api.refreshAuth(refreshToken),
      adoptTokens: (token, refresh) => tokens.signIn(token, refresh),
      fetchMe: async () => {
        try {
          return await api.me();
        } catch (error) {
          archivedUntil = archivedPurgeAfter(error);
          throw error;
        }
      },
      clearSession,
      loadSnapshot: loadMeSnapshot,
      holdRefreshToken: (refreshToken) => tokens.hold(refreshToken),
    });
    // Native knows the stored "Remember my choice" only once it has loaded.
    setRememberRole(loadRememberRole());

    if (archivedUntil) {
      enterArchived(archivedUntil);
      restorePhaseRef.current = "done";
      setRestorePhase("done");
      setBootstrapping(false);
      setSessionHydrated(true);
      return;
    }

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
        // `/me` answered but the rest did not (the network dropped between
        // the two calls): the snapshot still opens the app.
        const snapshot = await loadMeSnapshot(result.me.userId).catch(() => null);
        if (snapshot) {
          openFromSnapshot(snapshot, result.preferredRole);
          return;
        }
        offline();
        return;
      }
    }
    if (result.status === "offline") {
      if (result.snapshot) {
        openFromSnapshot(result.snapshot, result.preferredRole);
        return;
      }
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
  }, [api, applyMe, enterArchived, tokens]);

  /** `/me` answered 401 after the client's own refresh: the session is gone. */
  const dropRefusedSession = useCallback(() => {
    leaveSnapshotMode();
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
  }, [leaveSnapshotMode, tokens]);

  /**
   * The app is open on the snapshot: ask the server again, quietly. On
   * success `applyMe` replaces the cached account and leaves snapshot mode.
   * A network failure changes nothing; only a definitive refusal ends the
   * session.
   */
  const snapshotRestoreRunningRef = useRef(false);
  const finishSnapshotRestore = useCallback(async () => {
    if (!snapshotModeRef.current || snapshotRestoreRunningRef.current) return;
    snapshotRestoreRunningRef.current = true;
    try {
      if (!tokens.getAccessToken()) {
        // Held refresh token: a refusal here ends the session through
        // `onExpired`; a network failure returns null.
        const token = await tokens.refresh();
        if (!token) return;
      }
      const meResponse = await api.me();
      if (!snapshotModeRef.current) return;
      await applyMe(meResponse, selectedRoleRef.current, api);
      persistSession({
        accessToken: tokens.getAccessToken(),
        selectedRole: selectedRoleRef.current,
        userId: meResponse.userId,
      });
    } catch (error) {
      const purgeAfter = archivedPurgeAfter(error);
      if (purgeAfter) {
        enterArchived(purgeAfter);
      } else if (error instanceof ApiClientError && error.status === 401) {
        dropRefusedSession();
      } else if (!isNetworkFailure(error)) {
        reportError("auth-snapshot-restore", error);
      }
    } finally {
      snapshotRestoreRunningRef.current = false;
    }
  }, [api, applyMe, dropRefusedSession, enterArchived, tokens]);

  useEffect(() => {
    if (!offlineSnapshot) return;
    const timer = setInterval(() => {
      void finishSnapshotRestore();
    }, SNAPSHOT_RETRY_MS);
    const subscription = AppState.addEventListener("change", (next) => {
      if (isForegroundAppState(next)) void finishSnapshotRestore();
    });
    // Any call that got through (the sync probe included) means the server
    // is reachable again.
    const stopListening = onApiActivity((activity) => {
      if (activity === "success") void finishSnapshotRestore();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      stopListening();
    };
  }, [finishSnapshotRestore, offlineSnapshot]);

  // The held refresh token minted an ID token: finish the restore.
  useEffect(() => {
    if (offlineSnapshot && accessToken) void finishSnapshotRestore();
  }, [accessToken, finishSnapshotRestore, offlineSnapshot]);

  // Keep the snapshot equal to what the server last said. Never written
  // from the snapshot itself. A trainer's client list is left out: the
  // trainer shell does not route on it.
  useEffect(() => {
    if (!me || !relationshipsLoaded || offlineSnapshot) return;
    void saveMeSnapshot({
      me,
      relationships: selectedRole === "trainee" ? relationships : [],
    });
  }, [me, offlineSnapshot, relationships, relationshipsLoaded, selectedRole]);

  const refreshSession = useCallback(async () => {
    if (restorePhaseRef.current === "offline") {
      // Retry after "Can't reach FitBud": run the whole restore again.
      await runRestore();
      return;
    }
    if (!tokens.getAccessToken()) {
      return;
    }
    // Read before the call: applyMe may set `me` before a later step fails.
    const accountLoaded = accountLoadedRef.current;
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
      const purgeAfter = archivedPurgeAfter(error);
      // The client already tried one refresh before this 401 reached us.
      if (purgeAfter) {
        enterArchived(purgeAfter);
      } else if (error instanceof ApiClientError && error.status === 401) {
        dropRefusedSession();
      } else if (accountLoaded && isNetworkFailure(error)) {
        // Offline mid-session (pull to refresh, a notification tap, coaching
        // resume): keep the session and the `me` already on screen, and let
        // the screens' own offline handling show (Z11b-7). Any other failure,
        // or no account yet, still gets the error screen.
        reportError("auth-refresh-offline", error);
      } else {
        setErrorMessage(messageFromError(error));
      }
    } finally {
      setBootstrapping(false);
      setSessionHydrated(true);
    }
  }, [api, applyMe, dropRefusedSession, enterArchived, runRestore, tokens]);

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
      const purgeAfter = archivedPurgeAfter(error);
      if (purgeAfter) {
        enterArchived(purgeAfter);
        return;
      }
      if (error instanceof ApiClientError && error.status === 401) {
        dropRefusedSession();
        return;
      }
      // Quiet: the screen keeps the `me` it has; nothing blames the user.
      reportError("auth-reload-me", error);
    }
  }, [api, applyMe, dropRefusedSession, enterArchived, tokens]);

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
      leaveSnapshotMode();
      void clearMeSnapshot();
      // An account switch: the day views belong to whoever was signed in.
      clearDayViews();
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
      setArchivedAccount(null);
      setArchivedNotice(null);

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
        const purgeAfter = archivedPurgeAfter(error);
        if (purgeAfter) {
          // Z12-29: this sign-in is the fresh proof reactivation needs.
          enterArchived(purgeAfter);
        } else if (error instanceof ApiClientError && error.status === 401) {
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
    [api, applyMe, enterArchived, leaveSnapshotMode, tokens],
  );

  /**
   * Ends the session. An explicit sign-out also drops the unsent logs, as
   * the sign-out sheet says (TR-20f). A session the server ended keeps them:
   * they are keyed by user id, so the same user gets them back on the next
   * sign-in and nobody else can read them (Z12-41).
   */
  const endSession = useCallback((unsentLogs: "drop" | "keep") => {
    // Meal photos still waiting to upload: the runner stops before anything
    // else, so no upload or attach happens as someone else or signed out.
    // A server-ended session keeps the stored jobs for the same user.
    if (unsentLogs === "drop") {
      void discardMealPhotoJobs(deviceStorage().storage).catch((error) =>
        reportError("mealPhoto.signOut.clear", error),
      );
    } else {
      stopMealPhotoJobs();
    }
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
    // The next person on this phone gets their own reactivate note (Z12-29).
    lastRoleRef.current = null;
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
    setArchivedAccount(null);
    setReactivateError(null);
    setReactivating(false);
    clearPersistedSession();
    // Cleared with the session: the next sign-in starts ticked.
    setRememberRole(true);
    endTrainerCacheSession();
    leaveSnapshotMode();
    if (unsentLogs === "drop") void clearSyncDataOnSignOut();
  }, [leaveSnapshotMode, tokens]);
  const signOut = useCallback(() => endSession("drop"), [endSession]);
  onExpiredRef.current = () => endSession("keep");

  /**
   * Z12-29: the account was archived from this phone. The server has already
   * revoked its device tokens and sessions; end this one too, dropping unsent
   * logs (they can no longer sync), then show the archived notice.
   */
  const finishAccountDeletion = useCallback(
    (purgeAfter: string) => {
      // Read before the session ends: the date reads in the account's zone.
      const timeZone = meRef.current?.timezone ?? null;
      endSession("drop");
      setArchivedNotice({ purgeAfter, timeZone });
    },
    [endSession],
  );

  /**
   * "Reactivate my account": `POST /account/reactivation` with the session's
   * token, then load the account as a sign-in does. Coaching stays ended
   * (D-W6-8). The API needs a sign-in made after the archive (D-W6-31): a
   * token from before (a session restored, refreshed or reloaded after the
   * account was archived on another device) gets 403
   * RECENT_SIGN_IN_REQUIRED, which ends the session and lands on sign-in with
   * the API's message, so the user signs in fresh and reactivates then. Any
   * other refusal shows the API's own message or a short code.
   */
  const reactivateRunningRef = useRef(false);
  const reactivate = useCallback(async () => {
    if (reactivateRunningRef.current) return;
    reactivateRunningRef.current = true;
    setReactivating(true);
    setReactivateError(null);
    try {
      await api.reactivateAccount();
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 403 &&
        error.code === "RECENT_SIGN_IN_REQUIRED"
      ) {
        reactivateRunningRef.current = false;
        endSession("keep");
        setErrorMessage(userFacingMessage(error));
        return;
      }
      setReactivateError(authErrorCopy(error, "general", "reactivateAccount"));
      reactivateRunningRef.current = false;
      setReactivating(false);
      return;
    }
    try {
      const meResponse = await api.me();
      await applyMe(meResponse, null, api);
      persistSession({
        accessToken: tokens.getAccessToken(),
        selectedRole: selectedRoleRef.current,
        userId: meResponse.userId,
      });
    } catch (error) {
      // Reactivated, but the account did not load: leave the reactivate
      // screen; the app's own error screen offers Retry.
      setArchivedAccount(null);
      setErrorMessage(messageFromError(error));
    } finally {
      reactivateRunningRef.current = false;
      setReactivating(false);
    }
  }, [api, applyMe, endSession, tokens]);

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

  // Z12-49: a coach push tapped in trainee mode asks before switching too.
  const [pushRoleSwitch, setPushRoleSwitch] = useState<{
    pushType: NotificationType;
  } | null>(null);
  const pushSwitchCancelRef = useRef<(() => void) | null>(null);
  const offerPushRoleSwitch = useCallback(
    (pushType: NotificationType, onCancel: () => void) => {
      pushSwitchCancelRef.current = onCancel;
      setPushRoleSwitch({ pushType });
    },
    [],
  );
  // Leaving trainee mode (or the session) settles the push prompt.
  useEffect(() => {
    if (selectedRole !== "trainee" && pushRoleSwitch) {
      pushSwitchCancelRef.current = null;
      setPushRoleSwitch(null);
    }
  }, [selectedRole, pushRoleSwitch]);

  // Frame 61 (Z11-14): a coach link in trainee mode asks before switching.
  const pendingRoleSwitch = useMemo<PendingRoleSwitch | null>(() => {
    if (pushRoleSwitch && selectedRole === "trainee") {
      return { targetRole: "trainer", linkKind: "push", pushType: pushRoleSwitch.pushType };
    }
    if (!pendingDeepLink || !me) return null;
    const prompt = coachViewSwitchPrompt({
      selectedRole,
      permittedRoles: me.permittedRoles,
      linkKind: pendingDeepLink.kind,
    });
    return prompt
      ? { targetRole: prompt.targetRole, linkKind: pendingDeepLink.kind }
      : null;
  }, [pendingDeepLink, me, selectedRole, pushRoleSwitch]);
  const visibleDeepLink = pendingRoleSwitch ? null : pendingDeepLink;

  const confirmRoleSwitch = useCallback(async () => {
    // The link stays pending; once the role is trainer it is no longer held
    // back, and the trainer shell opens it.
    await selectRole("trainer");
  }, [selectRole]);

  const cancelRoleSwitch = useCallback(() => {
    if (pushRoleSwitch) {
      const onCancel = pushSwitchCancelRef.current;
      pushSwitchCancelRef.current = null;
      setPushRoleSwitch(null);
      onCancel?.();
      return;
    }
    setPendingDeepLink(null);
  }, [pushRoleSwitch]);

  const requestRoleSelect = useCallback(() => {
    if (!me || mobilePermittedRoles(me.permittedRoles).length < 2) return;
    setRoleSelectRequested(true);
  }, [me]);

  const canLeaveRoleSelect = roleSelectCanGoBack({
    roleSelectRequested,
    selectedRole,
    permittedRoles: me?.permittedRoles ?? [],
  });
  const leaveRoleSelect = useCallback(() => {
    setRoleSelectRequested(false);
  }, []);

  const resolvedRoute = resolveAppRoute({
    accessToken: accessToken ?? (offlineSnapshot ? SNAPSHOT_SESSION : null),
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
    restorePhase === "restoring" || archivedAccount
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
      offlineSnapshot,
      api,
      pendingNotificationLink,
      pendingDeepLink: visibleDeepLink,
      pendingRoleSwitch,
      confirmRoleSwitch,
      cancelRoleSwitch,
      rememberRole,
      requestRoleSelect,
      canLeaveRoleSelect,
      leaveRoleSelect,
      offerPushRoleSwitch,
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
      finishAccountDeletion,
    }),
    [
      accessToken,
      selectedRole,
      me,
      relationships,
      route,
      errorMessage,
      offlineSnapshot,
      api,
      pendingNotificationLink,
      visibleDeepLink,
      pendingRoleSwitch,
      confirmRoleSwitch,
      cancelRoleSwitch,
      rememberRole,
      requestRoleSelect,
      canLeaveRoleSelect,
      leaveRoleSelect,
      offerPushRoleSwitch,
      signInWithToken,
      signOut,
      refreshSession,
      reloadMe,
      selectRole,
      setActiveRelationship,
      handleNotificationOpen,
      clearPendingNotificationLink,
      clearPendingDeepLink,
      finishAccountDeletion,
    ],
  );

  // Z12-29: the archived screens cover the app; underneath it shows the
  // splash (archived) or sign-in (after the deletion).
  const archivedView = archivedAccount
    ? ({
        kind: "reactivate",
        purgeAfter: archivedAccount.purgeAfter,
        timeZone: archivedAccount.timeZone ?? undefined,
        role: lastRoleRef.current === "trainer" ? "trainer" : "trainee",
        busy: reactivating,
        error: reactivateError,
        onReactivate: () => {
          void reactivate();
        },
        onSignOut: signOut,
      } as const)
    : archivedNotice
      ? ({
          kind: "notice",
          purgeAfter: archivedNotice.purgeAfter,
          timeZone: archivedNotice.timeZone ?? undefined,
          onDone: () => setArchivedNotice(null),
        } as const)
      : null;

  // The app stays mounted under the archived screens, hidden from screen
  // readers while they show (iOS VoiceOver and Android TalkBack). The wrapper
  // is always there, so showing a screen never remounts the app.
  const coveredByArchived = archivedView !== null;
  return (
    <AuthContext.Provider value={value}>
      <View
        style={APP_STYLE}
        testID="auth-app-content"
        aria-hidden={coveredByArchived || undefined}
        accessibilityElementsHidden={coveredByArchived}
        importantForAccessibility={coveredByArchived ? "no-hide-descendants" : "auto"}
      >
        {children}
      </View>
      {archivedView ? (
        <Suspense fallback={null}>
          <ArchivedAccountOverlay view={archivedView} />
        </Suspense>
      ) : null}
    </AuthContext.Provider>
  );
}

const APP_STYLE = { flex: 1 } as const;

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return value;
}

export { messageFromError };
