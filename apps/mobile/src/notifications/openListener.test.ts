import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationType, PushPayload } from "@fitbud/contracts";

// The controller is pure; stub the two React Native modules the hook imports.
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: vi.fn() }));

import {
  createNotificationOpenController,
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
