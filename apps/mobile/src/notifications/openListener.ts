import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type { Role } from "@fitbud/contracts";
import { pushPayloadSchema } from "@fitbud/contracts";
import { useAuth } from "../auth/AuthProvider";
import { TRAINEE_NOTIFICATION_TYPES } from "./routing";

/**
 * Notification tap routing (X4d).
 *
 * A tap hands the push `data` to `AuthProvider.handleNotificationOpen`, which
 * stores a pending link that `TraineeShell` consumes: it routes, then refetches
 * the session and plan. The payload is routing only and never authoritative.
 *
 * All decisions live in `createNotificationOpenController` so they can be unit
 * tested without React or native modules. The hook below is a thin binding.
 */

/** expo-notifications' `DEFAULT_ACTION_IDENTIFIER`: a tap on the body, not a button. */
export const DEFAULT_TAP_ACTION = "expo.modules.notifications.actions.DEFAULT";

export type OpenSession = {
  userId: string;
  /** Null until the role is chosen after sign-in. */
  role: Role | null;
};

export type NotificationTap = {
  /** Stable per delivered notification; used to never handle one tap twice. */
  key: string;
  actionId: string;
  data: unknown;
};

type Pending = {
  data: unknown;
  /** User who was signed in when the tap happened, or the last one this run. */
  ownerUserId: string | null;
};

const MAX_HANDLED = 50;

export function createNotificationOpenController(input: {
  /** Routes the payload (AuthProvider.handleNotificationOpen). */
  handle: (data: unknown) => unknown;
  /** Shared across controller instances so a remount cannot replay a tap. */
  handled?: Set<string>;
}) {
  const handled = input.handled ?? new Set<string>();
  let session: OpenSession | null = null;
  let lastUserId: string | null = null;
  let pending: Pending | null = null;

  /** Trainee-facing types only; anything unknown or trainer-facing is not routed here. */
  function routable(data: unknown): boolean {
    const parsed = pushPayloadSchema.safeParse(data);
    return (
      parsed.success &&
      TRAINEE_NOTIFICATION_TYPES.includes(parsed.data.notificationType)
    );
  }

  function markHandled(key: string): boolean {
    if (handled.has(key)) return false;
    handled.add(key);
    if (handled.size > MAX_HANDLED) {
      const oldest = handled.values().next().value;
      if (oldest !== undefined) handled.delete(oldest);
    }
    return true;
  }

  return {
    /** Call on every auth change (sign-in, role pick, sign-out, user switch). */
    setSession(next: OpenSession | null): void {
      const prevUserId = session?.userId ?? null;
      session = next;
      if (prevUserId) lastUserId = prevUserId;
      if (next) lastUserId = next.userId;

      if (!pending) return;
      if (!next) {
        // Signing out ends the session the tap belonged to.
        if (prevUserId) pending = null;
        return;
      }
      if (pending.ownerUserId && pending.ownerUserId !== next.userId) {
        pending = null; // Another user signed in: never route them to this tap.
        return;
      }
      if (next.role === null) return; // Wait for the role pick.
      const { data } = pending;
      pending = null;
      if (next.role === "trainee") input.handle(data);
    },

    /** A notification response from the listener or the cold-start lookup. */
    receive(tap: NotificationTap): "routed" | "queued" | "ignored" {
      if (tap.actionId !== DEFAULT_TAP_ACTION) return "ignored"; // Buttons: nativeActions.ts.
      if (!routable(tap.data)) return "ignored";
      // A role that cannot route this tap must not burn its key: the user may
      // switch to the trainee role and tap the same notification again.
      if (session?.role && session.role !== "trainee") return "ignored"; // Trainer routing is X4g.
      if (!markHandled(tap.key)) return "ignored";
      if (!session) {
        pending = { data: tap.data, ownerUserId: lastUserId };
        return "queued";
      }
      if (session.role === null) {
        pending = { data: tap.data, ownerUserId: session.userId };
        return "queued";
      }
      input.handle(tap.data);
      return "routed";
    },
  };
}

const handledTaps = new Set<string>();

type ResponseLike = {
  actionIdentifier: string;
  notification: {
    date: number;
    request: { identifier: string; content: { data: unknown } };
  };
};

/** The slice of expo-notifications this binding uses (injectable for tests). */
export type NotificationsModule = {
  DEFAULT_ACTION_IDENTIFIER: string;
  addNotificationResponseReceivedListener: (
    listener: (response: ResponseLike) => void,
  ) => { remove: () => void };
  getLastNotificationResponseAsync: () => Promise<ResponseLike | null>;
  clearLastNotificationResponseAsync: () => Promise<void>;
};

/**
 * Attaches the response listener, then handles the cold-start response.
 * Returns the cleanup. A torn-down run never consumes or clears the response.
 */
export function bindNotificationResponses(
  controller: Pick<
    ReturnType<typeof createNotificationOpenController>,
    "receive"
  >,
  load: () => Promise<NotificationsModule>,
): () => void {
  let cancelled = false;
  let subscription: { remove: () => void } | null = null;

  void (async () => {
    const Notifications = await load();
    if (cancelled) return;
    const toTap = (response: ResponseLike | null): NotificationTap | null =>
      response && {
        key: `${response.notification.request.identifier}:${response.notification.date}`,
        // Read the library's own identifier so a rename cannot silently drop every tap.
        actionId:
          response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
            ? DEFAULT_TAP_ACTION
            : response.actionIdentifier,
        data: response.notification.request.content.data,
      };
    // Subscribe first so a tap between the two calls is not missed; the
    // shared key set keeps the cold-start response from being handled twice.
    subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const tap = toTap(response);
        if (tap) controller.receive(tap);
      },
    );
    const last = toTap(await Notifications.getLastNotificationResponseAsync());
    if (cancelled || !last) return;
    // Clear only a response we took ownership of; an ignored one stays for a retry.
    if (controller.receive(last) !== "ignored") {
      void Notifications.clearLastNotificationResponseAsync();
    }
  })();

  return () => {
    cancelled = true;
    subscription?.remove();
  };
}

/** Mount once inside `AuthProvider`. */
export function useNotificationOpenListener(): void {
  const { me, selectedRole, handleNotificationOpen } = useAuth();
  const handleRef = useRef(handleNotificationOpen);
  handleRef.current = handleNotificationOpen;
  const controllerRef = useRef<ReturnType<
    typeof createNotificationOpenController
  > | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createNotificationOpenController({
      handle: (data) => handleRef.current(data),
      handled: handledTaps,
    });
  }
  const controller = controllerRef.current;

  const userId = me?.userId ?? null;
  useEffect(() => {
    controller.setSession(userId ? { userId, role: selectedRole } : null);
  }, [controller, userId, selectedRole]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    return bindNotificationResponses(
      controller,
      () => import("expo-notifications"),
    );
  }, [controller]);
}

export function NotificationOpenListener(): null {
  useNotificationOpenListener();
  return null;
}
