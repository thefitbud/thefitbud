import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Z5-11 (BT2b gap G6). The Metro config must be built through Sentry's Expo
 * entry point so release bundles get a debug id. The serializer it installs is
 * opaque, so this loads the REAL metro.config.js and records what it asks
 * Expo's `getDefaultConfig` for: Sentry's `getSentryExpoConfig` forwards its
 * debug-id plugin there, and a config built without Sentry does not.
 */
const nodeRequire = createRequire(import.meta.url);

type Plugin = (...args: unknown[]) => unknown;
type MetroConfig = {
  serializer?: { customSerializer?: unknown };
  server?: { enhanceMiddleware?: unknown };
  watchFolders?: string[];
};

function loadMetroConfig(): { config: MetroConfig; plugins: Plugin[] } {
  const expoPath = nodeRequire.resolve("expo/metro-config");
  const expo = nodeRequire(expoPath) as {
    getDefaultConfig: (root: string, options?: Record<string, unknown>) => unknown;
  };
  const original = expo.getDefaultConfig;
  let plugins: Plugin[] = [];
  expo.getDefaultConfig = (root, options) => {
    plugins = (options?.unstable_beforeAssetSerializationPlugins ?? []) as Plugin[];
    return original(root, options);
  };
  const configPath = nodeRequire.resolve("./metro.config.js");
  delete nodeRequire.cache[configPath];
  try {
    return { config: nodeRequire(configPath) as MetroConfig, plugins };
  } finally {
    expo.getDefaultConfig = original;
    delete nodeRequire.cache[configPath];
  }
}

describe("metro.config.js", () => {
  it("is built with Sentry's debug-id serializer plugin", () => {
    const sentry = nodeRequire("@sentry/react-native/metro") as {
      unstable_beforeAssetSerializationPlugin: Plugin;
    };
    const { config, plugins } = loadMetroConfig();
    expect(sentry.unstable_beforeAssetSerializationPlugin).toBeTypeOf("function");
    expect(plugins).toContain(sentry.unstable_beforeAssetSerializationPlugin);
    expect(config.serializer?.customSerializer).toBeTypeOf("function");
  });

  it("keeps the FitBud customisations", () => {
    const { config } = loadMetroConfig();
    expect(config.watchFolders?.length).toBeGreaterThan(0);
    expect(config.server?.enhanceMiddleware).toBeTypeOf("function");
  });
});
