import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: {},
}));

const EXPO_TOKEN = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const ROTATED_TOKEN = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
let pushListeners: Array<() => void> = [];

const expoConfig: {
  extra?: { eas?: { projectId?: string } };
} = { extra: { eas: { projectId: "proj-1" } } };
vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return expoConfig;
    },
  },
}));

const notificationsMock = {
  getPermissionsAsync: vi.fn(async () => ({ granted: true, canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: EXPO_TOKEN })),
  addPushTokenListener: vi.fn((listener: () => void) => {
    pushListeners.push(listener);
    return {
      // Honest mock: remove really detaches, as expo-notifications does.
      remove: () => {
        pushListeners = pushListeners.filter((item) => item !== listener);
      },
    };
  }),
};
vi.mock("expo-notifications", () => notificationsMock);

import {
  currentPushRegistration,
  installationIdForToken,
  registerDeviceTokenForPush,
  resetPushRegistration,
  signOutPushRegistration,
  unregisterDeviceTokenForPush,
  watchPushTokenChanges,
} from "./register";
import { localInstallationId } from "./routing";

type RegisterCall = {
  provider: string;
  platform: string;
  token: string;
  installationId: string;
};

function fakeApi(
  overrides: {
    register?: (body: RegisterCall) => Promise<{ deviceToken: { id: string } }>;
  } = {},
) {
  const registerDeviceToken = vi.fn(
    overrides.register ??
      (async () => ({ deviceToken: { id: "dt-1" } })),
  );
  const revokeDeviceToken = vi.fn(async () => ({ revoked: 1 }));
  return {
    registerDeviceToken,
    revokeDeviceToken,
    calls: () => registerDeviceToken.mock.calls.map(([body]) => body),
    // The mobile code only uses these two methods of the client.
    client: { registerDeviceToken, revokeDeviceToken } as never,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Shaped like `ApiClientError`: the client throws `status` plus `code`. */
class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

const OWNED = new ApiError(403, "DEVICE_TOKEN_OWNED");

beforeEach(() => {
  resetPushRegistration();
  pushListeners = [];
  expoConfig.extra = { eas: { projectId: "proj-1" } };
  notificationsMock.getPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
  });
  notificationsMock.requestPermissionsAsync.mockResolvedValue({ granted: true });
  notificationsMock.getExpoPushTokenAsync.mockResolvedValue({ data: EXPO_TOKEN });
  notificationsMock.getPermissionsAsync.mockClear();
  notificationsMock.requestPermissionsAsync.mockClear();
  notificationsMock.getExpoPushTokenAsync.mockClear();
  notificationsMock.addPushTokenListener.mockClear();
});

afterEach(() => {
  resetPushRegistration();
});

describe("registerDeviceTokenForPush", () => {
  it("registers the Expo token with provider expo and a stable installation id", async () => {
    const api = fakeApi();
    const outcome = await registerDeviceTokenForPush(api.client);

    expect(outcome).toEqual({
      status: "registered",
      registration: {
        deviceTokenId: "dt-1",
        provider: "expo",
        installationId: installationIdForToken(EXPO_TOKEN),
        platform: "ios",
      },
    });
    expect(api.calls()).toEqual([
      {
        provider: "expo",
        platform: "ios",
        token: EXPO_TOKEN,
        installationId: installationIdForToken(EXPO_TOKEN),
      },
    ]);
    expect(currentPushRegistration()?.provider).toBe("expo");
  });

  it("derives the installation id from the token, stably and without the token in it", () => {
    const id = installationIdForToken(EXPO_TOKEN);
    expect(id).toBe(installationIdForToken(EXPO_TOKEN));
    expect(id).not.toBe(installationIdForToken(ROTATED_TOKEN));
    expect(id).toMatch(/^expo-[0-9a-f]{16}$/);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(EXPO_TOKEN).not.toContain(id);
    expect(id).not.toContain("aaaaaaaa");
  });

  it("asks for permission only when it is not granted yet", async () => {
    notificationsMock.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    const api = fakeApi();

    const outcome = await registerDeviceTokenForPush(api.client);

    expect(notificationsMock.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("registered");
  });

  it("registers nothing and reports no error when permission is denied", async () => {
    notificationsMock.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    notificationsMock.requestPermissionsAsync.mockResolvedValue({
      granted: false,
    });
    const api = fakeApi();

    const outcome = await registerDeviceTokenForPush(api.client);

    expect(outcome).toEqual({ status: "permission_denied" });
    expect(api.registerDeviceToken).not.toHaveBeenCalled();
    expect(notificationsMock.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(currentPushRegistration()).toBeNull();
  });

  it("does not prompt again when permission is denied for good", async () => {
    notificationsMock.getPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });
    const api = fakeApi();

    const outcome = await registerDeviceTokenForPush(api.client);

    expect(outcome).toEqual({ status: "permission_denied" });
    expect(notificationsMock.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("keeps the synthetic token in test mode, without touching expo-notifications", async () => {
    const api = fakeApi();

    const outcome = await registerDeviceTokenForPush(api.client, {
      testMode: true,
    });

    expect(outcome.status).toBe("registered");
    expect(api.calls()).toEqual([
      {
        provider: "fcm",
        platform: "ios",
        token: `local-test-fcm-${localInstallationId()}`,
        installationId: localInstallationId(),
      },
    ]);
    expect(notificationsMock.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("keeps the synthetic token when the build has no EAS project id", async () => {
    expoConfig.extra = {};
    const api = fakeApi();

    const outcome = await registerDeviceTokenForPush(api.client);

    expect(outcome.status).toBe("registered");
    expect(api.calls()[0]?.provider).toBe("fcm");
    expect(notificationsMock.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("reports a 403 as rejected and never retries that token", async () => {
    const api = fakeApi({
      register: async () => {
        throw OWNED;
      },
    });

    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "rejected",
    });
    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "rejected",
    });

    // One attempt only: a token owned by another user is never retried.
    expect(api.registerDeviceToken).toHaveBeenCalledTimes(1);
    expect(currentPushRegistration()).toBeNull();
  });

  it("reports other failures as failed and stays retryable", async () => {
    const api = fakeApi({
      register: async () => {
        throw new ApiError(503, "INTERNAL");
      },
    });

    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "failed",
    });
    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "failed",
    });
    expect(api.registerDeviceToken).toHaveBeenCalledTimes(2);
  });

  it("keeps an unrelated 403 retryable", async () => {
    const api = fakeApi({
      register: async () => {
        throw new ApiError(403, "FORBIDDEN_ROLE");
      },
    });

    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "failed",
    });
    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "failed",
    });
    expect(api.registerDeviceToken).toHaveBeenCalledTimes(2);
  });

  it("reports failed when the Expo token lookup throws", async () => {
    notificationsMock.getExpoPushTokenAsync.mockRejectedValue(
      new Error("no dev build"),
    );
    const api = fakeApi();

    expect(await registerDeviceTokenForPush(api.client)).toEqual({
      status: "failed",
    });
    expect(api.registerDeviceToken).not.toHaveBeenCalled();
  });
});

describe("watchPushTokenChanges", () => {
  it("re-registers once when the token changes and revokes the old token", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);
    const stop = await watchPushTokenChanges(api.client);
    expect(pushListeners).toHaveLength(1);

    notificationsMock.getExpoPushTokenAsync.mockResolvedValue({
      data: ROTATED_TOKEN,
    });
    pushListeners[0]!();
    await flush();

    expect(api.calls()).toEqual([
      {
        provider: "expo",
        platform: "ios",
        token: EXPO_TOKEN,
        installationId: installationIdForToken(EXPO_TOKEN),
      },
      {
        provider: "expo",
        platform: "ios",
        token: ROTATED_TOKEN,
        installationId: installationIdForToken(ROTATED_TOKEN),
      },
    ]);
    expect(api.revokeDeviceToken).toHaveBeenCalledWith({ token: EXPO_TOKEN });
    expect(currentPushRegistration()?.installationId).toBe(
      installationIdForToken(ROTATED_TOKEN),
    );
    stop();
  });

  it("does not re-register when the token is unchanged", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);
    const stop = await watchPushTokenChanges(api.client);

    pushListeners[0]!();
    await flush();
    pushListeners[0]!();
    await flush();

    expect(api.registerDeviceToken).toHaveBeenCalledTimes(1);
    expect(api.revokeDeviceToken).not.toHaveBeenCalled();
    stop();
  });

  it("registers one listener however often it is started", async () => {
    const api = fakeApi();
    await watchPushTokenChanges(api.client);
    await watchPushTokenChanges(api.client);

    expect(notificationsMock.addPushTokenListener).toHaveBeenCalledTimes(1);
  });

  it("watches nothing in test mode", async () => {
    const api = fakeApi();
    const stop = await watchPushTokenChanges(api.client, { testMode: true });

    expect(notificationsMock.addPushTokenListener).not.toHaveBeenCalled();
    expect(stop).toBeTypeOf("function");
    stop();
  });
});

describe("unregisterDeviceTokenForPush", () => {
  it("revokes the registered installation and clears local state", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);

    const revoked = await unregisterDeviceTokenForPush(api.client);

    expect(revoked).toBe(true);
    expect(api.revokeDeviceToken).toHaveBeenCalledWith({
      installationId: installationIdForToken(EXPO_TOKEN),
    });
    expect(currentPushRegistration()).toBeNull();
  });

  it("uses the installation id it is given", async () => {
    const api = fakeApi();

    await unregisterDeviceTokenForPush(api.client, localInstallationId());

    expect(api.revokeDeviceToken).toHaveBeenCalledWith({
      installationId: localInstallationId(),
    });
  });

  it("swallows a failed revoke so sign-out is never blocked", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);
    api.revokeDeviceToken.mockRejectedValue(
      new ApiError(404, "DEVICE_TOKEN_NOT_FOUND"),
    );

    await expect(unregisterDeviceTokenForPush(api.client)).resolves.toBe(false);
    expect(currentPushRegistration()).toBeNull();
  });

  it("does nothing when nothing is registered", async () => {
    const api = fakeApi();

    expect(await unregisterDeviceTokenForPush(api.client)).toBe(false);
    expect(api.revokeDeviceToken).not.toHaveBeenCalled();
  });

});

describe("signOutPushRegistration", () => {
  it("revokes the installation and clears state on the provider's path", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);

    signOutPushRegistration({
      installationId: installationIdForToken(EXPO_TOKEN),
      client: api.client,
    });
    await flush();

    expect(api.revokeDeviceToken).toHaveBeenCalledWith({
      installationId: installationIdForToken(EXPO_TOKEN),
    });
    expect(currentPushRegistration()).toBeNull();
  });

  it("falls back to the registered installation id", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);

    signOutPushRegistration({ installationId: null, client: api.client });
    await flush();

    expect(api.revokeDeviceToken).toHaveBeenCalledWith({
      installationId: installationIdForToken(EXPO_TOKEN),
    });
  });

  /**
   * After a DEVICE_TOKEN_OWNED refusal there is no installation id and the
   * access token may be gone, so sign-out takes the no-revoke path. It must
   * still clear the module state, or the next user in the same app run is
   * refused without the API ever being called.
   */
  it("clears a refused token even when it cannot revoke anything", async () => {
    let refuse = true;
    const api = fakeApi({
      register: async () => {
        if (refuse) throw OWNED;
        return { deviceToken: { id: "dt-2" } };
      },
    });

    expect((await registerDeviceTokenForPush(api.client)).status).toBe(
      "rejected",
    );

    // Exactly what AuthProvider.signOut passes with no registration and no
    // usable access token.
    signOutPushRegistration({ installationId: null, client: null });
    await flush();

    expect(api.revokeDeviceToken).not.toHaveBeenCalled();
    refuse = false;
    expect((await registerDeviceTokenForPush(api.client)).status).toBe(
      "registered",
    );
    expect(api.registerDeviceToken).toHaveBeenCalledTimes(2);
  });

  it("stops the token watch so a rotation cannot re-register the signed-out user", async () => {
    const api = fakeApi();
    await registerDeviceTokenForPush(api.client);
    await watchPushTokenChanges(api.client);

    expect(pushListeners).toHaveLength(1);

    signOutPushRegistration({ installationId: null, client: null });
    await flush();

    // The listener is detached, so a later rotation cannot reach the API with
    // the signed-out user's session.
    expect(pushListeners).toHaveLength(0);
    expect(api.registerDeviceToken).toHaveBeenCalledTimes(1);
  });
});
