import { createContext, useContext, useEffect } from "react";
import type { NotificationDeepLink } from "../../notifications/routing";
import type { NoticeQueue } from "./noticeQueue";

/**
 * The queue `NoticeHost` renders. Null outside a host (render tests, the
 * primitive gallery, previews): `Snackbar` and the trainee foreground banner
 * then draw themselves in place, as they did before the queue.
 */
export const NoticeContext = createContext<NoticeQueue | null>(null);

export function useNoticeQueue(): NoticeQueue | null {
  return useContext(NoticeContext);
}

/**
 * Tell the queue which screen is open, so a banner for it is not shown (and
 * leaves if it is up). Keys come from `noticeScreenKey` / `noticeTargetKey`.
 */
export function useNoticeScreen(key: string | null): void {
  const queue = useNoticeQueue();
  useEffect(() => {
    if (!queue) return undefined;
    queue.setScreen(key);
    return () => {
      if (queue.getScreen() === key) queue.setScreen(null);
    };
  }, [queue, key]);
}

/**
 * Screen keys are entity screens only: a workout, a meal, a check-in. A tab
 * is never a banner's suppressing screen (a coach note opens Today, and
 * TR-06h paints its banner over Today), so tab-level targets always show.
 */
export function noticeTargetKey(link: NotificationDeepLink | null): string | null {
  const route = link?.route;
  if (!route) return null;
  switch (route.type) {
    case "workout_overview":
    case "workout_active":
      return `workout:${route.assignmentId}`;
    case "meal":
      return `meal:${route.assignmentId}`;
    case "checkin":
      return `checkin:${route.checkinId}`;
    default:
      return null;
  }
}
