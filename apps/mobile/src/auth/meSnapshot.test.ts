import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  meResponseSchema,
  type CoachingRelationship,
  type MeResponse,
} from "@fitbud/contracts";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../lib/secureSessionStore", () => ({
  secureGet: async () => null,
  secureSet: async () => undefined,
  secureDelete: async () => undefined,
}));

import { ApiClientError } from "@fitbud/api-client";
import { createMemoryKeyValue, type AsyncKeyValue } from "../sync/storage";
import {
  clearMeSnapshot,
  flushMeSnapshot,
  loadMeSnapshot,
  saveMeSnapshot,
  setMeSnapshotStorageForTests,
} from "./meSnapshot";
import { restoreSession, type RestoreDeps } from "./sessionRestore";

/**
 * Z12-41: the stored `/me` snapshot is keyed by user, cleared on sign-out,
 * and never read for another user.
 */

const AARAV = "6f1c2f0e-8f58-4d3a-9d5c-0a4d2f1b7c11";
const PRIYA = "0b8f6a3e-2c1d-4e5f-9a7b-3c2d1e0f9a8b";

const relationship = { id: "rel-1" } as unknown as CoachingRelationship;

let bag: Map<string, string>;
let storage: AsyncKeyValue;

beforeEach(() => {
  bag = new Map();
  storage = createMemoryKeyValue(bag);
  setMeSnapshotStorageForTests(storage);
});

/** A `/me` the contract accepts, as the server would send it. */
async function validMe(userId: string): Promise<MeResponse> {
  return meResponseSchema.parse({
    userId,
    firebaseUid: `uid-${userId.slice(0, 8)}`,
    accountState: "active",
    timezone: "Asia/Kolkata",
    email: `${userId.slice(0, 4)}@demo.fitbud.test`,
    permittedRoles: ["trainee"],
    selectedRole: "trainee",
    surface: "mobile",
    trainerProfileId: null,
    traineeProfileId: "3d2c1b0a-9f8e-4d7c-8b6a-5f4e3d2c1b0a",
  });
}

describe("me snapshot", () => {
  it("gives the snapshot back to the user it was saved for", async () => {
    const me = await validMe(AARAV);
    await saveMeSnapshot({ me, relationships: [] });

    const snapshot = await loadMeSnapshot(AARAV);

    expect(snapshot?.me).toEqual(me);
    expect(snapshot?.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("is never read for another user", async () => {
    await saveMeSnapshot({ me: await validMe(AARAV), relationships: [] });

    expect(await loadMeSnapshot(PRIYA)).toBeNull();
    expect(await loadMeSnapshot("")).toBeNull();
  });

  it("a record whose /me belongs to someone else is not returned, whatever its label says", async () => {
    await saveMeSnapshot({ me: await validMe(AARAV), relationships: [] });
    const stored = JSON.parse([...bag.values()][0]!) as { userId: string };
    stored.userId = PRIYA;
    bag.set([...bag.keys()][0]!, JSON.stringify(stored));

    expect(await loadMeSnapshot(PRIYA)).toBeNull();
  });

  it("a new user's save replaces the previous user's snapshot", async () => {
    await saveMeSnapshot({ me: await validMe(AARAV), relationships: [] });
    await saveMeSnapshot({ me: await validMe(PRIYA), relationships: [] });

    expect(await loadMeSnapshot(AARAV)).toBeNull();
    expect((await loadMeSnapshot(PRIYA))?.me.userId).toBe(PRIYA);
    expect(bag.size).toBe(1);
  });

  it("is cleared on sign-out: nothing is left in storage", async () => {
    await saveMeSnapshot({ me: await validMe(AARAV), relationships: [] });
    expect(bag.size).toBe(1);

    await clearMeSnapshot();

    expect(bag.size).toBe(0);
    expect(await loadMeSnapshot(AARAV)).toBeNull();
  });

  it("a save asked for before the clear never lands after it", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: AsyncKeyValue = {
      get: (key) => storage.get(key),
      set: async (key, value) => {
        await gate;
        await storage.set(key, value);
      },
      remove: (key) => storage.remove(key),
    };
    setMeSnapshotStorageForTests(slow);
    const me = await validMe(AARAV);

    // The first save is already writing; the second is still queued.
    void saveMeSnapshot({ me, relationships: [] });
    void saveMeSnapshot({ me, relationships: [] });
    const cleared = clearMeSnapshot();
    release();
    await cleared;
    await flushMeSnapshot();

    expect(bag.size).toBe(0);
  });

  it("unreadable or foreign-shaped storage reads as no snapshot", async () => {
    await storage.set("fitbud.me.snapshot", "{not json");
    expect(await loadMeSnapshot(AARAV)).toBeNull();
    await storage.set(
      "fitbud.me.snapshot",
      JSON.stringify({
        v: 1,
        userId: AARAV,
        me: await validMe(AARAV),
        relationships: [relationship],
      }),
    );
    // A relationship this build cannot read is dropped, never handed to the
    // router as it is.
    expect((await loadMeSnapshot(AARAV))?.relationships).toEqual([]);
  });
});

describe("cold start with no network (restoreSession)", () => {
  function deps(overrides: Partial<RestoreDeps>): RestoreDeps {
    return {
      load: async () => ({
        refreshToken: "refresh-stored",
        testToken: null,
        selectedRole: "trainee",
        userId: AARAV,
      }),
      refreshAuth: async () => {
        throw new TypeError("Network request failed");
      },
      adoptTokens: () => undefined,
      fetchMe: async () => {
        throw new TypeError("Network request failed");
      },
      clearSession: () => undefined,
      loadSnapshot: loadMeSnapshot,
      ...overrides,
    };
  }

  it("opens on the stored snapshot and keeps the refresh token for later", async () => {
    const me = await validMe(AARAV);
    await saveMeSnapshot({ me, relationships: [] });
    const held: string[] = [];

    const result = await restoreSession(
      deps({ holdRefreshToken: (token) => held.push(token) }),
    );

    expect(result).toMatchObject({
      status: "offline",
      preferredRole: "trainee",
      snapshot: { me },
    });
    expect(held).toEqual(["refresh-stored"]);
  });

  it("no snapshot for this user: offline with nothing cached (the Retry screen)", async () => {
    await saveMeSnapshot({ me: await validMe(PRIYA), relationships: [] });

    const result = await restoreSession(deps({}));

    expect(result).toEqual({ status: "offline", snapshot: null, preferredRole: "trainee" });
  });

  it("/me unreachable after a good refresh still opens on the snapshot", async () => {
    const me = await validMe(AARAV);
    await saveMeSnapshot({ me, relationships: [] });

    const result = await restoreSession(
      deps({
        refreshAuth: async () => ({ token: "id", refreshToken: "r2", expiresIn: 3600 }),
      }),
    );

    expect(result).toMatchObject({ status: "offline", snapshot: { me } });
  });

  it("a refused session is signed out, never opened from the snapshot", async () => {
    await saveMeSnapshot({ me: await validMe(AARAV), relationships: [] });
    let cleared = 0;

    const result = await restoreSession(
      deps({
        refreshAuth: async () => {
          throw new ApiClientError({
            code: "INVALID_REFRESH_TOKEN",
            message: "refused",
            requestId: "req-1",
            status: 401,
          });
        },
        clearSession: () => {
          cleared += 1;
        },
      }),
    );

    expect(result).toEqual({ status: "signed_out", reason: "refused" });
    expect(cleared).toBe(1);
  });

  it("a snapshot that cannot be read is 'nothing cached', not signed out", async () => {
    const result = await restoreSession(
      deps({
        loadSnapshot: async () => {
          throw new Error("keystore unavailable");
        },
      }),
    );

    expect(result).toMatchObject({ status: "offline", snapshot: null });
  });
});
