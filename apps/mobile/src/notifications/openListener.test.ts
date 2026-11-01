import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationType, PushPayload } from "@fitbud/contracts";

// The controller is pure; stub the two React Native modules the hook imports.
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: vi.fn() }));

import {
  bindNotificationResponses,
  createNotificationOpenController,
  type NotificationsModule,
  DEFAULT_TAP_ACTION,
  type NotificationTap,
} from "./openListener.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function payload(
  type: NotificationType,
  entity: PushPayload["domainEntityType"],
): PushPayload {
  return {
    notificationId: "11111111-1111-4111-8111-111111111111",
    notificationType: type,
    domainEntityType: entity,
    domainEntityId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-11-02T04:00:00.000Z",
  };
}

const workoutData = payload("workout_reminder", "workout_assignment");

function tap(
  key: string,
  data: unknown,
  actionId = DEFAULT_TAP_ACTION,
): NotificationTap {
  return { key, actionId, data };
}

describe("notification open controller", () => {
  const handle = vi.fn();
  beforeEach(() => handle.mockReset());

  it("routes a background tap in a signed-in trainee session with the payload data", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(c.receive(tap("n1", workoutData))).toBe("routed");
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(workoutData);
  });

  it("handles the cold-start response once even if the listener also delivers it", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    c.receive(tap("n1", workoutData)); // cold-start lookup
    expect(c.receive(tap("n1", workoutData))).toBe("ignored"); // same response via listener
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("does not replay a handled tap on a fresh controller sharing the handled set", () => {
    const handled = new Set<string>();
    const first = createNotificationOpenController({ handle, handled });
    first.setSession({ userId: USER_A, role: "trainee" });
    first.receive(tap("n1", workoutData));
    const remounted = createNotificationOpenController({ handle, handled });
    remounted.setSession({ userId: USER_A, role: "trainee" });
    remounted.receive(tap("n1", workoutData));
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["undefined", undefined],
    ["empty", {}],
    ["wrong shape", { notificationType: "workout_reminder" }],
    ["extra keys (strict)", { ...workoutData, body: "Leg day" }],
    ["unknown type", { ...workoutData, notificationType: "nope" }],
    ["local meal snooze", { mealAssignmentId: "x" }],
  ])("malformed payload (%s) does nothing", (_name, data) => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(c.receive(tap("n1", data))).toBe("ignored");
    expect(handle).not.toHaveBeenCalled();
  });

  it("leaves notification buttons (meal Snooze/Open) to the meal listener", () => {
    const meal = payload("meal_reminder", "meal_assignment");
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(c.receive(tap("n1", meal, "meal_snooze_30"))).toBe("ignored");
    expect(c.receive(tap("n2", meal, "meal_open"))).toBe("ignored");
    expect(handle).not.toHaveBeenCalled();
  });

  it("ignores trainer-type payloads in a trainee session", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    for (const type of [
      "trainer_ask_coach",
      "trainer_checkin_submitted",
      "trainer_intake_submitted",
      "trainer_critical_digest",
      "trainer_renewal",
      "trainer_meal_times_changed",
      "admin_whatsapp_budget",
    ] as const) {
      expect(c.receive(tap(type, payload(type, "coaching_relationship")))).toBe(
        "ignored",
      );
    }
    expect(handle).not.toHaveBeenCalled();
  });

  it("does not route a trainee payload while a trainer role is selected", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(c.receive(tap("n1", workoutData))).toBe("ignored");
    expect(handle).not.toHaveBeenCalled();
  });

  describe("signed out / cold start before sign-in", () => {
    it("queues the tap and opens it once after sign-in as a trainee", () => {
      const c = createNotificationOpenController({ handle });
      expect(c.receive(tap("n1", workoutData))).toBe("queued");
      expect(handle).not.toHaveBeenCalled();
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledWith(workoutData);
      // Later auth updates (token refresh, role re-set) do not replay it.
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it("waits for the role pick, then routes", () => {
      const c = createNotificationOpenController({ handle });
      c.receive(tap("n1", workoutData));
      c.setSession({ userId: USER_A, role: null });
      expect(handle).not.toHaveBeenCalled();
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it("drops a queued tap when the user picks the trainer role", () => {
      const c = createNotificationOpenController({ handle });
      c.receive(tap("n1", workoutData));
      c.setSession({ userId: USER_A, role: "trainer" });
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).not.toHaveBeenCalled();
    });

    it("does not route a tap queued after user A signed out to user B", () => {
      const c = createNotificationOpenController({ handle });
      c.setSession({ userId: USER_A, role: "trainee" });
      c.setSession(null); // A signs out
      expect(c.receive(tap("n1", workoutData))).toBe("queued");
      c.setSession({ userId: USER_B, role: "trainee" });
      expect(handle).not.toHaveBeenCalled();
    });

    it("still opens a tap queued after sign-out when the same user signs back in", () => {
      const c = createNotificationOpenController({ handle });
      c.setSession({ userId: USER_A, role: "trainee" });
      c.setSession(null);
      c.receive(tap("n1", workoutData));
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it("drops a queued tap when its user signs out before the role is picked", () => {
      const c = createNotificationOpenController({ handle });
      c.setSession({ userId: USER_A, role: null });
      c.receive(tap("n1", workoutData));
      c.setSession(null);
      c.setSession({ userId: USER_B, role: "trainee" });
      expect(handle).not.toHaveBeenCalled();
    });

    it("drops a queued tap when a different user replaces the session directly", () => {
      const c = createNotificationOpenController({ handle });
      c.setSession({ userId: USER_A, role: null });
      c.receive(tap("n1", workoutData));
      c.setSession({ userId: USER_B, role: "trainee" });
      expect(handle).not.toHaveBeenCalled();
    });

    it("keeps a tap queued across the signed-out start of the app (no prior user)", () => {
      const c = createNotificationOpenController({ handle });
      c.setSession(null); // initial bootstrap with no session
      c.receive(tap("n1", workoutData));
      c.setSession(null);
      expect(handle).not.toHaveBeenCalled();
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
    });

    it("keeps only the latest queued tap", () => {
      const c = createNotificationOpenController({ handle });
      const meal = payload("meal_reminder", "meal_assignment");
      c.receive(tap("n1", workoutData));
      c.receive(tap("n2", meal));
      c.setSession({ userId: USER_A, role: "trainee" });
      expect(handle).toHaveBeenCalledTimes(1);
      expect(handle).toHaveBeenCalledWith(meal);
    });
  });
});

describe("re-tap after a role that could not route it", () => {
  it("does not burn the key while the trainer role is selected", () => {
    const handle = vi.fn();
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(c.receive(tap("n1", workoutData))).toBe("ignored");
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(c.receive(tap("n1", workoutData))).toBe("routed");
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe("trainer taps (X4g)", () => {
  const handle = vi.fn();
  beforeEach(() => handle.mockReset());
  const trainerTypes = [
    "trainer_ask_coach",
    "trainer_checkin_submitted",
    "trainer_intake_submitted",
    "trainer_meal_times_changed",
  ] as const;
  const askData = payload("trainer_ask_coach", "coaching_relationship");

  it.each(trainerTypes)("routes %s in a signed-in trainer session", (type) => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    const data = payload(
      type,
      type === "trainer_checkin_submitted" ? "checkin" : "coaching_relationship",
    );
    expect(c.receive(tap(type, data))).toBe("routed");
    expect(handle).toHaveBeenCalledWith(data);
  });

  it.each(["trainer_critical_digest", "trainer_renewal", "admin_whatsapp_budget"] as const)(
    "does not route %s (no producer in the beta)",
    (type) => {
      const c = createNotificationOpenController({ handle });
      c.setSession({ userId: USER_A, role: "trainer" });
      expect(c.receive(tap(type, payload(type, "coaching_relationship")))).toBe(
        "ignored",
      );
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it("ignores a trainer payload in a trainee session without burning its key", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(c.receive(tap("t1", askData))).toBe("ignored");
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(c.receive(tap("t1", askData))).toBe("routed");
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("rejects a trainer payload with extra keys or an unknown type", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(c.receive(tap("t1", { ...askData, body: "Rahul asked" }))).toBe("ignored");
    expect(c.receive(tap("t2", { ...askData, notificationType: "trainer_x" }))).toBe(
      "ignored",
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it("queues a signed-out trainer tap and routes it once for the same trainer", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    c.setSession(null);
    expect(c.receive(tap("t1", askData))).toBe("queued");
    c.setSession({ userId: USER_A, role: null });
    expect(handle).not.toHaveBeenCalled();
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(handle).toHaveBeenCalledTimes(1);
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("never routes a queued trainer tap to a different trainer", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    c.setSession(null);
    c.receive(tap("t1", askData));
    c.setSession({ userId: USER_B, role: "trainer" });
    expect(handle).not.toHaveBeenCalled();
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("drops a queued trainer tap when the same user picks the trainee role", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    c.setSession(null);
    c.receive(tap("t1", askData));
    c.setSession({ userId: USER_A, role: null });
    c.setSession({ userId: USER_A, role: "trainee" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("drops a queued trainer tap when its user signs out before the role is picked", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: null });
    c.receive(tap("t1", askData));
    c.setSession(null);
    c.setSession({ userId: USER_A, role: "trainer" });
    expect(handle).not.toHaveBeenCalled();
  });

  it("does not route the same trainer tap twice", () => {
    const c = createNotificationOpenController({ handle });
    c.setSession({ userId: USER_A, role: "trainer" });
    c.receive(tap("t1", askData));
    expect(c.receive(tap("t1", askData))).toBe("ignored");
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe("bindNotificationResponses", () => {
  const NATIVE_DEFAULT = "native.default.id";
  const calls: string[] = [];
  let listener: ((r: never) => void) | null;
  let last: unknown;
  const remove = vi.fn();

  function response(actionIdentifier: string, key = "req-1") {
    return {
      actionIdentifier,
      notification: {
        date: 1,
        request: { identifier: key, content: { data: workoutData } },
      },
    };
  }

  function fakeModule(): NotificationsModule {
    return {
      DEFAULT_ACTION_IDENTIFIER: NATIVE_DEFAULT,
      addNotificationResponseReceivedListener: (l) => {
        calls.push("listen");
        listener = l as never;
        return { remove };
      },
      getLastNotificationResponseAsync: async () => {
        calls.push("getLast");
        return last as never;
      },
      clearLastNotificationResponseAsync: async () => {
        calls.push("clear");
      },
    };
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(() => {
    calls.length = 0;
    listener = null;
    last = null;
    remove.mockReset();
  });

  it("attaches the listener before the cold-start lookup, then clears after handling", async () => {
    last = response(NATIVE_DEFAULT);
    const receive = vi.fn(() => "routed" as const);
    bindNotificationResponses({ receive }, async () => fakeModule());
    await flush();
    expect(calls).toEqual(["listen", "getLast", "clear"]);
    expect(receive).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: DEFAULT_TAP_ACTION, data: workoutData }),
    );
  });

  it("maps the library's own default identifier, not a hardcoded string", async () => {
    const seen: NotificationTap[] = [];
    const receive = (t: NotificationTap) => {
      seen.push(t);
      return "routed" as const;
    };
    bindNotificationResponses({ receive }, async () => fakeModule());
    await flush();
    listener?.(response(NATIVE_DEFAULT, "req-2") as never);
    listener?.(response("meal_snooze_30", "req-3") as never);
    expect(seen[0]?.actionId).toBe(DEFAULT_TAP_ACTION);
    expect(seen[1]?.actionId).toBe("meal_snooze_30");
  });

  it("does not clear a response that was ignored", async () => {
    last = response(NATIVE_DEFAULT);
    bindNotificationResponses({ receive: () => "ignored" }, async () => fakeModule());
    await flush();
    expect(calls).toEqual(["listen", "getLast"]);
  });

  it("a torn-down run neither consumes nor clears the response", async () => {
    last = response(NATIVE_DEFAULT);
    const receive = vi.fn(() => "routed" as const);
    let resolveModule: (m: NotificationsModule) => void = () => {};
    const cleanup = bindNotificationResponses(
      { receive },
      () => new Promise((r) => (resolveModule = r)),
    );
    cleanup(); // torn down before the module loaded
    resolveModule(fakeModule());
    await flush();
    expect(calls).toEqual([]);
    expect(receive).not.toHaveBeenCalled();
  });

  it("a run torn down during the cold-start lookup does not handle or clear", async () => {
    last = response(NATIVE_DEFAULT);
    const receive = vi.fn(() => "routed" as const);
    const mod = fakeModule();
    let release: () => void = () => {};
    mod.getLastNotificationResponseAsync = async () => {
      calls.push("getLast");
      await new Promise<void>((r) => (release = r));
      return last as never;
    };
    const cleanup = bindNotificationResponses({ receive }, async () => mod);
    await flush();
    cleanup();
    release();
    await flush();
    expect(calls).toEqual(["listen", "getLast"]);
    expect(receive).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
