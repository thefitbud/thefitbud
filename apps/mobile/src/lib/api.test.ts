import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  NativeModules: {},
  Platform: { OS: "ios" },
}));

import { DEFAULT_API_BASE_URL, resolveApiBaseUrl } from "./api";

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses EXPO_PUBLIC_API_BASE_URL when it is set", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", "https://api-staging.thefitbud.com/");
    expect(resolveApiBaseUrl()).toBe("https://api-staging.thefitbud.com");
  });

  it("falls back to the local Wrangler default when it is unset", () => {
    vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", undefined);
    expect(resolveApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
  });
});
