import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import appJson from "./app.json";
import appConfig from "./app.config.js";
import liveActivityPlugin from "./plugins/withLiveActivity.js";
import liveActivityTarget from "./targets/FitBudLiveActivity/expo-target.config.js";

const APP_GROUPS = "com.apple.security.application-groups";

function configFor(variant: string | undefined) {
  vi.stubEnv("APP_VARIANT", variant);
  return appConfig({ config: structuredClone(appJson) });
}

/**
 * Runs the plugin's iOS prebuild mod into a throwaway project root and returns
 * the Swift the widget compiles. `expo config` never runs mods, and nothing
 * else can catch a regression here: eslint does not look at `plugins/`, tsc
 * does not typecheck it, and the Swift is only compiled by a device build.
 */
async function generatedAppGroupSwift(
  config: ReturnType<typeof configFor>,
): Promise<string> {
  const mod = config.mods?.ios?.dangerous;
  expect(typeof mod).toBe("function");
  const projectRoot = mkdtempSync(join(tmpdir(), "fitbud-app-group-"));
  try {
    await mod({
      ...config,
      modRequest: { platform: "ios", projectRoot, nextMod: (c: unknown) => c },
      modResults: {},
    });
    return readFileSync(
      join(projectRoot, liveActivityPlugin.APP_GROUP_SWIFT_PATH),
      "utf8",
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

/** The one line the widget's `LiveActivityOutbox.suite` resolves to. */
function appGroupInGeneratedSwift(source: string): string | undefined {
  return /static let identifier = "([^"]*)"/.exec(source)?.[1];
}

describe("app.config.js variants", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["production", "FitBud", "com.thefitbud.mobile", "group.com.thefitbud.mobile"],
    [
      "staging",
      "FitBud Staging",
      "com.thefitbud.mobile.staging",
      "group.com.thefitbud.mobile.staging",
    ],
    [
      "development",
      "FitBud Staging",
      "com.thefitbud.mobile.staging",
      "group.com.thefitbud.mobile.staging",
    ],
  ])("%s: name, bundle id, package and App Group", (variant, name, id, appGroup) => {
    const config = configFor(variant);
    expect(config.name).toBe(name);
    expect(config.ios.bundleIdentifier).toBe(id);
    expect(config.android.package).toBe(id);
    expect(config.ios.entitlements[APP_GROUPS]).toEqual([appGroup]);
    expect(config.ios.infoPlist.FitBudAppGroup).toBe(appGroup);
    expect(liveActivityTarget(config).entitlements[APP_GROUPS]).toEqual([appGroup]);
  });

  it.each([
    ["production", "group.com.thefitbud.mobile"],
    ["staging", "group.com.thefitbud.mobile.staging"],
    ["development", "group.com.thefitbud.mobile.staging"],
  ])("%s: the widget compiles in the same App Group as the app", async (variant, appGroup) => {
    const config = configFor(variant);
    const source = await generatedAppGroupSwift(config);
    expect(source).toContain(`static let identifier = "${appGroup}"`);
    // The invariant the app side depends on: it reads FitBudAppGroup from the
    // host app's Info.plist (modules/live-activity/ios/LiveActivityModule.swift),
    // the widget reads this constant. If the two ever differ, lock-screen sets
    // are written where the app cannot see them and silently vanish.
    expect(appGroupInGeneratedSwift(source)).toBe(
      config.ios.infoPlist.FitBudAppGroup,
    );
  });

  it("rejects an App Group name that is not a plain group identifier", () => {
    const { appGroupSwiftSource } = liveActivityPlugin;
    expect(() => appGroupSwiftSource("com.thefitbud.mobile")).toThrow(
      /not a usable App Group name/,
    );
    expect(() => appGroupSwiftSource('group.a" + evil + "')).toThrow(
      /not a usable App Group name/,
    );
    expect(appGroupSwiftSource("group.com.thefitbud.mobile")).toContain(
      'static let identifier = "group.com.thefitbud.mobile"',
    );
  });

  it.each([
    ["production", "production", "com.thefitbud.mobile"],
    ["staging", "development", "com.thefitbud.mobile.staging"],
    ["development", "development", "com.thefitbud.mobile.staging"],
    [undefined, "development", "com.thefitbud.mobile.staging"],
  ])(
    "%s: iOS signing, push and widget id (APNs %s)",
    (variant, aps, hostId) => {
      const config = configFor(variant);
      expect(config.ios.appleTeamId).toBe("26257QDTHP");
      expect(config.ios.supportsTablet).toBe(true);
      expect(config.ios.config.usesNonExemptEncryption).toBe(false);
      expect(config.ios.entitlements["aps-environment"]).toBe(aps);
      expect(config.ios.entitlements[APP_GROUPS]).toHaveLength(1);

      const entry = config.plugins.find(
        (p: unknown) => Array.isArray(p) && p[0] === "expo-notifications",
      );
      expect(entry).toBeDefined();
      // Same value as the entitlement, and nothing that changes Android.
      expect(entry).toEqual(["expo-notifications", { mode: aps }]);

      const names = config.plugins.map((p: unknown) => (Array.isArray(p) ? p[0] : p));
      expect(names.slice(0, 2)).toEqual(["expo-dev-client", "expo-secure-store"]);
      expect(names.indexOf("expo-notifications")).toBeLessThan(
        names.indexOf("@bacons/apple-targets"),
      );
      expect(names[names.length - 1]).toBe("@bacons/apple-targets");

      // A leading "." is appended to the host app's id by @bacons/apple-targets.
      const target = liveActivityTarget(config);
      expect(target.bundleIdentifier.startsWith(".")).toBe(true);
      expect(`${config.ios.bundleIdentifier}${target.bundleIdentifier}`).toBe(
        `${hostId}.widget`,
      );
    },
  );

  it("treats an unset APP_VARIANT as development", () => {
    expect(configFor(undefined).ios.bundleIdentifier).toBe("com.thefitbud.mobile.staging");
  });

  it("throws for an unknown variant", () => {
    expect(() => configFor("qa")).toThrow(/Unknown APP_VARIANT "qa"/);
  });

  it("sets googleServicesFile only from the EAS file variable", () => {
    expect(configFor("staging").android.googleServicesFile).toBeUndefined();
    vi.stubEnv("GOOGLE_SERVICES_JSON", "/tmp/eas/google-services.json");
    expect(configFor("staging").android.googleServicesFile).toBe(
      "/tmp/eas/google-services.json",
    );
  });
});
