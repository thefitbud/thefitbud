import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { isForegroundAppState, onApiActivity } from "../lib/api";
import { reportError } from "../lib/reportError";
import { clearDayViews } from "../trainee/dataCache";
import { createSyncEngine, type SyncEngine } from "./engine";
import { installNetInfoReachability } from "./netInfoReachability";
import {
  createReachability,
  setReachabilityFactory,
  type Reachability,
} from "./reachability";
import { startSyncTriggers } from "./triggers";
import { syncStoreForUser } from "./userStore";

// Z12-57: NetInfo drives reconnect; the /health probe still has the last word.
installNetInfoReachability(setReachabilityFactory);

const SyncContext = createContext<SyncEngine | null>(null);
const ReachabilityContext = createContext<Reachability | null>(null);

/**
 * Owns the signed-in user's sync engine and the triggers that send the
 * outbox on its own (Z12-41). The store is keyed by the user id, so the
 * engine changes with the user and never carries one account's logs into
 * another's session.
 */
export function SyncProvider({ children }: { children: ReactNode }) {
  const { api, me, selectedRole } = useAuth();
  const userId = me?.userId ?? null;

  // A switch from trainee to trainer drops the trainee's day views and the
  // snapshots on the phone (Z14-2), as a sign-out does. The outbox is not
  // touched: unsent logs stay and send under the same account.
  const lastRole = useRef<{ userId: string; role: string | null } | null>(null);
  useEffect(() => {
    const previous = lastRole.current;
    lastRole.current = userId ? { userId, role: selectedRole ?? null } : null;
    if (
      previous &&
      previous.userId === userId &&
      previous.role === "trainee" &&
      selectedRole != null &&
      selectedRole !== "trainee"
    ) {
      clearDayViews();
    }
  }, [userId, selectedRole]);

  const reachability = useMemo(
    () => createReachability({ probe: () => api.health() }),
    [api],
  );
  const engine = useMemo(
    () =>
      createSyncEngine(
        syncStoreForUser(userId),
        {
          pushSync: (body) => api.pushSync(body),
          pullSync: (query) => api.pullSync(query),
        },
        {
          onError: reportError,
          // Unknown counts as reachable: only a failed probe holds a send
          // back. No screen waits on a log's push any more (Z14-2), so an
          // unknown network only means the background push tries.
          isReachable: () => reachability.isReachable() !== false,
        },
      ),
    [api, reachability, userId],
  );

  useEffect(() => () => reachability.dispose(), [reachability]);

  useEffect(() => {
    // Nobody signed in: there is no outbox to send.
    if (!userId) return;
    return startSyncTriggers({
      engine,
      reachability,
      appState: {
        // "unknown" this early still means the app is on screen.
        isActive: () => AppState.currentState !== "background",
        subscribe: (listener) => {
          const subscription = AppState.addEventListener("change", (next) => {
            listener(isForegroundAppState(next));
          });
          return () => subscription.remove();
        },
      },
      onApiSuccess: (listener) =>
        onApiActivity((activity) => {
          if (activity === "success") listener();
        }),
      onApiUnreachable: (listener) =>
        onApiActivity((activity) => {
          if (activity === "unreachable") listener();
        }),
    });
  }, [engine, reachability, userId]);

  return (
    <SyncContext.Provider value={engine}>
      <ReachabilityContext.Provider value={reachability}>
        {children}
      </ReachabilityContext.Provider>
    </SyncContext.Provider>
  );
}

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext);
  if (!engine) {
    throw new Error("useSyncEngine must be used within SyncProvider");
  }
  return engine;
}

/** Null outside the provider (tests that render one screen on its own). */
export function useReachability(): Reachability | null {
  return useContext(ReachabilityContext);
}
