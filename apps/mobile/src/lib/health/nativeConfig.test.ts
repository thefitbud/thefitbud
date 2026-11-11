import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import appJson from "../../../app.json";
import pkg from "../../../package.json";

// app.config.js is CommonJS with no type declarations.
const appConfig = createRequire(import.meta.url)("../../../app.config.js") as (context: {
  config: unknown;
}) => unknown;

type PluginEntry = string | [string, Record<string, unknown>];

function configFor(variant: string) {
  vi.stubEnv("APP_VARIANT", variant);
  return appConfig({ config: structuredClone(appJson) }) as {
    plugins: PluginEntry[];
    android: { permissions?: string[] };
  };
}

function pluginName(entry: PluginEntry): string {
  return typeof entry === "string" ? entry : entry[0];
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("steps native config (D-W9-6)", () => {
  it("pins the health libraries for Expo SDK 52", () => {
    expect(pkg.dependencies.expo).toBe("~52.0.46");
    expect(pkg.dependencies["@kingstinct/react-native-healthkit"]).toBe("~8.7.2");
    expect(pkg.dependencies["react-native-health-connect"]).toBe("~3.5.3");
    expect(pkg.dependencies["expo-health-connect"]).toBe("~0.1.1");
    expect(pkg.dependencies["expo-build-properties"]).toBe("~0.13.3");
  });

  it.each(["development", "staging", "production"])("%s: adds the three plugins without reordering the existing chain, and READ_STEPS", (variant) => {
    const config = configFor(variant);
    const names = config.plugins.map(pluginName);
    const steps = ["@kingstinct/react-native-healthkit", "expo-health-connect", "expo-build-properties"];
    // Between expo-notifications and the existing tail, which keeps its order.
    expect(names.slice(-5)).toEqual([...steps, "@bacons/apple-targets", "@sentry/react-native/expo"]);
    expect(names.indexOf("expo-notifications")).toBeLessThan(names.indexOf(steps[0]!));

    const healthkit = config.plugins.find((p) => pluginName(p) === "@kingstinct/react-native-healthkit");
    expect(healthkit).toEqual([
      "@kingstinct/react-native-healthkit",
      {
        NSHealthShareUsageDescription: "FitBud reads your daily step count so your coach can see it next to your plan.",
        // Read only: the plugin would otherwise write a default update string.
        NSHealthUpdateUsageDescription: false,
        background: false,
      },
    ]);
    expect(config.plugins.find((p) => pluginName(p) === "expo-build-properties")).toEqual([
      "expo-build-properties",
      { android: { minSdkVersion: 26 } },
    ]);
    expect(config.android.permissions).toContain("android.permission.health.READ_STEPS");
  });
});
