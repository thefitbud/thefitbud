import { beforeEach, describe, expect, it, vi } from "vitest";

// The module boundary: react-native's module registry and the Health Connect
// library. Nothing else is replaced.
const nativeModules: { HealthConnect?: object } = {};
let importFails = true;

vi.mock("react-native", () => ({
  NativeModules: nativeModules,
  TurboModuleRegistry: { get: () => null },
}));
vi.mock("react-native-health-connect", () => {
  if (importFails) throw new Error("native module failed to load");
  return { getSdkStatus: async () => 3 };
});

beforeEach(() => {
  vi.resetModules();
  delete nativeModules.HealthConnect;
  importFails = true;
});

describe("provider.android", () => {
  it("is unavailable, without importing the library, when the native module is not linked", async () => {
    const { loadHealthStepsProvider } = await import("./provider.android");
    const provider = await loadHealthStepsProvider();
    expect(provider.platformKnowsIfAsked).toBe(false);
    expect(await provider.availability()).toBe("unavailable");
  });

  it("does not keep a failed load: the next call imports again", async () => {
    nativeModules.HealthConnect = {};
    const { loadHealthStepsProvider } = await import("./provider.android");
    // vitest wraps the factory error in its own message.
    await expect(loadHealthStepsProvider()).rejects.toThrow(/native module failed to load|error when mocking/);

    importFails = false;
    const provider = await loadHealthStepsProvider();
    expect(provider.source).toBe("health_connect");
    expect(await provider.availability()).toBe("available");
  });
});
