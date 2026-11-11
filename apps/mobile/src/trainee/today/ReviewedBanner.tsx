import { useCallback, useEffect, useState } from "react";
import type { Checkin, Notification } from "@fitbud/contracts";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
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
 * "<Coach> reviewed your check-in" over Today (frame 113). Source: an unread
 * `checkin_reviewed` notification. The coach's gender is not on file, so the
 * line reads "Tap to read the note", not "his note" as the frame paints it.
 * Meal and coach-note banners take the slot first (one banner at a time).
 */
export function ReviewedBanner({
  coachName,
  onOpenCheckin,
}: {
  coachName: string;
  onOpenCheckin: (checkin: Checkin) => void;
}) {
  const { api, me } = useAuth();
  const [notification, setNotification] = useState<Notification | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const otherBannerUp = useForegroundBannerActive();

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
