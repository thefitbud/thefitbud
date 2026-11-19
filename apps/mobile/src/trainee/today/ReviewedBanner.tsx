import { useCallback, useEffect, useRef, useState } from "react";
import type { Checkin, Notification } from "@fitbud/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import { useNoticeQueue } from "../../components/notice/NoticeContext";
import { coachGivenName } from "../../notifications/copy";
import { InAppBanner } from "../notifications/Surfaces";
import { useForegroundBannerActive } from "./bannerSlot";

/** The reviewed check-in the notification points at, else the newest reviewed one. */
export function reviewedCheckinFor(
  items: readonly Checkin[],
  notification: Pick<Notification, "domainEntityId">,
): Checkin | null {
  const reviewed = items.filter(
    (item) => Boolean(item.review) || item.status === "reviewed",
  );
  return (
    reviewed.find((item) => item.id === notification.domainEntityId) ??
    reviewed
      .slice()
      .sort((a, b) => b.localDate.localeCompare(a.localDate))[0] ??
    null
  );
}

/**
 * "<Coach> reviewed your check-in" over Today (TR-06h). Source: an unread
 * `checkin_reviewed` notification. The coach's gender is not on file, so the
 * line reads "Tap to read the note", not "his note" as the mock paints it.
 *
 * Inside the app's `NoticeHost` (Z12-38) it goes on the shared notice queue:
 * one banner at a time, gone after about 4 s or a swipe up, a tap opens the
 * review, shown once per notification, and not shown while that check-in is
 * already open. Outside a host (render tests) it draws in place, and waits
 * while another in-app banner is up (`bannerSlot`).
 */
export function ReviewedBanner(props: {
  coachName: string;
  onOpenCheckin: (checkin: Checkin) => void;
}) {
  const queue = useNoticeQueue();
  const { api, me } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const otherBannerUp = useForegroundBannerActive();
  const { coachName, onOpenCheckin } = props;

  useEffect(() => {
    let cancelled = false;
    api
      .listNotifications()
      .then((page) => {
        if (cancelled) return;
        setNotification(
          page.items.find(
            (item) => item.type === "checkin_reviewed" && item.readAt == null,
          ) ?? null,
        );
      })
      .catch((err: unknown) => {
        // Optional banner: a failed read leaves it out.
        reportError("ReviewedBanner.listNotifications", err);
      });
    return () => {
      cancelled = true;
    };
  }, [api, me?.userId]);

  const open = useCallback(async () => {
    if (!notification) return;
    setDismissed(true);
    stage1Api(api)
      .markNotificationRead(notification.id)
      .catch((err: unknown) => reportError("ReviewedBanner.markRead", err));
    const relationshipId = notification.coachingRelationshipId;
    if (!relationshipId) return;
    try {
      const listed = await api.listCheckins(relationshipId);
      const target = reviewedCheckinFor(listed.items, notification);
      if (target) onOpenCheckin(target);
    } catch (err) {
      reportError("ReviewedBanner.listCheckins", err);
    }
  }, [api, notification, onOpenCheckin]);

  // Latest `open` for the queued banner's tap, without re-queueing on each render.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!queue || !notification) return;
    const given = coachGivenName(coachName);
    queue.showBanner({
      key: `checkin-reviewed:${notification.id}`,
      target: `checkin:${notification.domainEntityId}`,
      title: `${coachName} reviewed your check-in`,
      body: "Tap to read the note",
      leading: given
        ? { kind: "initials", name: coachName, tone: "coach" }
        : { kind: "app" },
      openLabel: "Open check-in review",
      onOpen: () => void openRef.current(),
    });
  }, [queue, notification, coachName]);

  if (queue) return null;
  if (!notification || dismissed || otherBannerUp) return null;
  return (
    <InAppBanner
      floating
      title={`${coachName} reviewed your check-in`}
      body="Tap to read the note"
      openLabel="Open check-in review"
      onOpen={() => void open()}
    />
  );
}
