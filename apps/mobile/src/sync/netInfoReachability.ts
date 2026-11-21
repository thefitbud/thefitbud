/**
 * NetInfo-backed reachability for Z12-57.
 *
 * NetInfo answers "is there a connection?"; the `/health` probe still has the
 * last word on "can we reach the FitBud API?". Lost link → `report(false)`
 * (which re-probes); regained link → `check()`.
 *
 * When NetInfo is missing (web tests, Expo web without the native module), the
 * probe-only reachability from Z12-41 stays in place.
 */
import type { NetInfoState, NetInfoSubscription } from "@react-native-community/netinfo";
import {
  createProbeReachability,
  type Reachability,
  type ReachabilityFactory,
} from "./reachability";

export type NetInfoLike = {
  addEventListener: (listener: (state: NetInfoState) => void) => NetInfoSubscription;
};

function isOffline(state: NetInfoState): boolean {
  return state.isConnected === false || state.isInternetReachable === false;
}

function isOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

function loadNetInfo(): NetInfoLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native; Metro resolves the package when linked
    const mod = require("@react-native-community/netinfo") as {
      default?: NetInfoLike;
      addEventListener?: NetInfoLike["addEventListener"];
    };
    if (typeof mod.addEventListener === "function") return mod as NetInfoLike;
    if (mod.default && typeof mod.default.addEventListener === "function") {
      return mod.default;
    }
    return null;
  } catch {
    return null;
  }
}

export function createNetInfoReachability(deps: {
  probe: () => Promise<unknown>;
  netInfo?: NetInfoLike | null;
}): Reachability {
  const inner = createProbeReachability({ probe: deps.probe });
  const netInfo =
    deps.netInfo === undefined ? loadNetInfo() : deps.netInfo;
  if (!netInfo) return inner;

  let unsubscribe: NetInfoSubscription = () => undefined;
  try {
    unsubscribe = netInfo.addEventListener((state) => {
      if (isOffline(state)) {
        inner.report(false);
        return;
      }
      if (isOnline(state)) {
        void inner.check();
      }
    });
  } catch {
    return inner;
  }

  return {
    isReachable: () => inner.isReachable(),
    subscribe: (listener) => inner.subscribe(listener),
    check: () => inner.check(),
    report: (reachable) => inner.report(reachable),
    setForeground: (active) => inner.setForeground(active),
    dispose() {
      try {
        unsubscribe();
      } catch {
        // ignore
      }
      inner.dispose();
    },
  };
}

/** Install before SyncProvider creates reachability so NetInfo is the default. */
export function installNetInfoReachability(
  setFactory: (next: ReachabilityFactory) => void,
  netInfo?: NetInfoLike | null,
): void {
  setFactory(({ probe }) => createNetInfoReachability({ probe, netInfo }));
}
