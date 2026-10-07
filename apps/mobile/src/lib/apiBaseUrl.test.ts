import { describe, expect, it } from "vitest";
import {
  apiBaseUrlForDevice,
  deviceApiHost,
  preferredDevServerHost,
} from "./apiBaseUrl.js";

describe("device API base URL", () => {
  it("uses the Metro LAN host on a physical device", () => {
    const host = deviceApiHost({
      platform: "android",
      devServerHost: "192.168.1.10:8081",
    });
    expect(apiBaseUrlForDevice("http://127.0.0.1:8787", host)).toBe(
      "http://192.168.1.10:8787",
    );
  });

  it("uses the Android emulator host when Metro is on loopback", () => {
    const host = deviceApiHost({
      platform: "android",
      devServerHost: "http://127.0.0.1:8081/index.bundle",
    });
    expect(apiBaseUrlForDevice("http://127.0.0.1:8787", host)).toBe(
      "http://10.0.2.2:8787",
    );
  });

  it("keeps loopback for the iOS simulator", () => {
    const host = deviceApiHost({
      platform: "ios",
      devServerHost: "127.0.0.1:8081",
    });
    expect(apiBaseUrlForDevice("http://127.0.0.1:8787", host)).toBe(
      "http://127.0.0.1:8787",
    );
  });

  it("prefers the address that loaded the bundle over loopback", () => {
    expect(
      preferredDevServerHost([
        "127.0.0.1:8081",
        "http://192.168.1.10:8081/index.bundle?platform=android",
      ]),
    ).toBe("http://192.168.1.10:8081/index.bundle?platform=android");
  });

  it("keeps an explicit non-loopback API URL", () => {
    expect(apiBaseUrlForDevice("http://10.0.2.2:8787", "192.168.1.10")).toBe(
      "http://10.0.2.2:8787",
    );
  });
});
