import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAuth } from "../../auth/AuthProvider";
import { useNoticeQueue } from "./NoticeContext";
import {
  bindForegroundPushes,
  showForegroundPush,
  type ForegroundPushContext,
  type ReceivedNotificationsModule,
} from "./foregroundPush";

/**
 * Mounted once inside `NoticeHost` (AppRouter). Turns pushes received while
 * the app is open into banners for the signed-in role, and clears the queue
 * when the user or the role changes, so nothing from one session shows in the
 * next.
 */
export function ForegroundPushNotices({
  load = () => import("expo-notifications") as unknown as Promise<ReceivedNotificationsModule>,
}: {
  load?: () => Promise<ReceivedNotificationsModule>;
}): null {
  const queue = useNoticeQueue();
  const { api, me, selectedRole, route, handleNotificationOpen } = useAuth();
  const coachName =
    route.name === "trainee_shell" ? route.relationship.trainerDisplayName?.trim() || null : null;

  const contextRef = useRef<ForegroundPushContext>({
    api,
    role: selectedRole,
    coachName,
    openPayload: handleNotificationOpen,
  });
  contextRef.current = { api, role: selectedRole, coachName, openPayload: handleNotificationOpen };

  const userId = me?.userId ?? null;
  useEffect(() => {
    queue?.reset();
  }, [queue, userId, selectedRole]);

  useEffect(() => {
    if (!queue || Platform.OS === "web") return undefined;
    return bindForegroundPushes(load, (data) => {
      void showForegroundPush(queue, data, contextRef.current);
    });
    // `load` is a module loader; binding once per queue is enough.
  }, [queue]);

  return null;
}
