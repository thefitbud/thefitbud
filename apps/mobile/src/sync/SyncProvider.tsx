import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth/AuthProvider";
import { isForegroundAppState, onApiActivity } from "../lib/api";
import { reportError } from "../lib/reportError";
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
  const { api, me } = useAuth();
  const userId = me?.userId ?? null;

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
          // Unknown counts as reachable: only a failed probe holds a send back.
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
