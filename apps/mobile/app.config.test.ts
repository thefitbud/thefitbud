import { afterEach, describe, expect, it, vi } from "vitest";
import appJson from "./app.json";
import appConfig from "./app.config.js";
import liveActivityTarget from "./targets/FitBudLiveActivity/expo-target.config.js";

const APP_GROUPS = "com.apple.security.application-groups";

function configFor(variant: string | undefined) {
  vi.stubEnv("APP_VARIANT", variant);
  return appConfig({ config: structuredClone(appJson) });
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
