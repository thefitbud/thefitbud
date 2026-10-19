import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import { createBrowserDurableSyncStore } from "./durableStore";
import {
  createMemorySyncStore,
  createSyncEngine,
  type SyncEngine,
} from "./engine";

const SyncContext = createContext<SyncEngine | null>(null);

/** Process-wide store. Web persists to localStorage; tests stay in memory. */
const sharedStore = createBrowserDurableSyncStore() ?? createMemorySyncStore();

export function SyncProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const engine = useMemo(
    () =>
      createSyncEngine(sharedStore, {
        pushSync: (body) => api.pushSync(body),
        pullSync: (query) => api.pullSync(query),
      }),
    [api],
  );
  return (
    <SyncContext.Provider value={engine}>{children}</SyncContext.Provider>
  );
}

export function useSyncEngine(): SyncEngine {
  const engine = useContext(SyncContext);
  if (!engine) {
    throw new Error("useSyncEngine must be used within SyncProvider");
  }
  return engine;
}

export { sharedStore as traineeSyncStore };
