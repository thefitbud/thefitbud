import { describe, expect, it } from "vitest";
import type { NetInfoState } from "@react-native-community/netinfo";
import {
  createNetInfoReachability,
  installNetInfoReachability,
  type NetInfoLike,
} from "./netInfoReachability";
import {
  createProbeReachability,
  setReachabilityFactory,
  type ReachabilityFactory,
} from "./reachability";

function fakeNetInfo(): {
  netInfo: NetInfoLike;
  emit: (state: Partial<NetInfoState>) => void;
} {
  let listener: ((state: NetInfoState) => void) | null = null;
  return {
    netInfo: {
      addEventListener(next) {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
    emit(partial) {
      listener?.({
        type: "wifi",
        isConnected: true,
        isInternetReachable: true,
        details: null,
        ...partial,
      } as NetInfoState);
    },
  };
}

describe("NetInfo reachability (Z12-57)", () => {
  it("re-probes when NetInfo reports offline", async () => {
    const { netInfo, emit } = fakeNetInfo();
    let probes = 0;
    const r = createNetInfoReachability({
      probe: async () => {
        probes += 1;
        if (probes === 1) return undefined;
        throw new Error("down");
      },
      netInfo,
    });
    await r.check();
    expect(r.isReachable()).toBe(true);
    expect(probes).toBe(1);

    emit({ isConnected: false, isInternetReachable: false });
    await Promise.resolve();
    await Promise.resolve();
    expect(probes).toBe(2);
    expect(r.isReachable()).toBe(false);
    r.dispose();
  });

  it("checks the API again when NetInfo comes back online", async () => {
    const { netInfo, emit } = fakeNetInfo();
    let probes = 0;
    const r = createNetInfoReachability({
      probe: async () => {
        probes += 1;
        if (probes === 1) throw new Error("down");
        return undefined;
      },
      netInfo,
    });
    await r.check();
    expect(r.isReachable()).toBe(false);

    emit({ isConnected: true, isInternetReachable: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(probes).toBe(2);
    expect(r.isReachable()).toBe(true);
    r.dispose();
  });

  it("installNetInfoReachability wires the factory", async () => {
    const { netInfo } = fakeNetInfo();
    let installed: ReachabilityFactory | null = null;
    installNetInfoReachability((next) => {
      installed = next;
    }, netInfo);
    expect(installed).not.toBeNull();
    const r = installed!({ probe: async () => undefined });
    await expect(r.check()).resolves.toBe(true);
    r.dispose();

    // Restore the default probe factory for other tests in this worker.
    setReachabilityFactory(({ probe }) => createProbeReachability({ probe }));
  });
});
