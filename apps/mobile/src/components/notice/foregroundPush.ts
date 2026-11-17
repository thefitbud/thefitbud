import type { FitBudApiClient } from "@fitbud/api-client";
import {
  pushPayloadSchema,
  type Notification,
  type PushPayload,
  type Role,
} from "@fitbud/contracts";
import { notificationInboxRoute } from "@fitbud/core";
import { reportError } from "../../lib/reportError";
import { stage1Api } from "../../lib/stage1Api";
import {
  coachGivenName,
  noteBannerCopy,
  notificationRowBody,
  notificationRowTitle,
} from "../../notifications/copy";
import {
  deepLinkFromNotificationPayload,
  notificationAudience,
} from "../../notifications/routing";
import { noticeTargetKey } from "./NoticeContext";
import type { BannerInput, NoticeLeading, NoticeQueue } from "./noticeQueue";

/**
 * A push that arrives while the app is open (Z12-38, TR-06h, TM-13b).
 *
 * The app sets no foreground notification handler, so expo-notifications does
 * not show the system banner while FitBud is open; the push reaches
 * `addNotificationReceivedListener` instead and becomes one banner on the
 * notice queue. The payload is routing only (ids), so the banner's words come
 * from the authoritative notification record and, for a coach note, the note
 * itself; the app's own copy is the fallback. A tap routes exactly like a tap
 * on the system notification (`handleNotificationOpen`) and marks it read.
 */

export type ForegroundPushContext = {
  api: FitBudApiClient;
  /** Signed-in role; a push for the other role is not shown. */
  role: Role | null;
  /** Signed-in user; a banner built for one user is never shown to the next. */
  userId: string | null;
  /** Trainee only: the coach's display name, for the copy and the avatar. */
  coachName: string | null;
  /** Routes like a system notification tap (AuthProvider.handleNotificationOpen). */
  openPayload: (data: unknown) => void;
};

/** The fields the app's notification copy reads, when the record itself is not found. */
function copyRecord(payload: PushPayload): Notification {
  return {
    type: payload.notificationType,
    notificationType: payload.notificationType,
    domainEntityType: payload.domainEntityType,
    domainEntityId: payload.domainEntityId,
    dedupeKey: payload.notificationType,
    route: notificationInboxRoute(payload),
  } as Notification;
}

/** One showing per thing: the same meal or note from a push and from Today is one banner. */
export function pushNoticeKey(payload: PushPayload): string {
  if (payload.notificationType === "meal_reminder" && payload.domainEntityType === "meal_assignment") {
    return `meal:${payload.domainEntityId}`;
  }
  if (payload.notificationType === "trainer_note_shared") {
    return `note:${payload.domainEntityId}`;
  }
  return `notification:${payload.notificationId}`;
}

/** Build the banner for a received push, or null when it is not for this role. */
export async function bannerForPush(
  data: unknown,
  context: ForegroundPushContext,
): Promise<BannerInput | null> {
  const parsed = pushPayloadSchema.safeParse(data);
  if (!parsed.success) return null; // A local notification or another app's shape.
  const payload = parsed.data;
  const audience = notificationAudience(payload.notificationType);
  if (!audience || audience !== context.role) return null;

  let record: Notification | null = null;
  try {
    const page = await context.api.listNotifications();
    record = page.items.find((item) => item.id === payload.notificationId) ?? null;
  } catch (err) {
    reportError("foregroundPush.listNotifications", err);
  }
  const source = record ?? copyRecord(payload);
  const coachName = context.coachName;
  let title = record?.title ?? notificationRowTitle(source, { coachName });
  let body: string | undefined = record?.body ?? notificationRowBody(source, { coachName });

  if (payload.notificationType === "trainer_note_shared") {
    title = noteBannerCopy(coachName).title;
    body = undefined;
    try {
      const notes = await stage1Api(context.api).listMeCoachNotes();
      // No match means no preview; never show some other note's text.
      body = notes.items.find((item) => item.id === payload.domainEntityId)?.body?.trim() || undefined;
    } catch (err) {
      reportError("foregroundPush.listMeCoachNotes", err);
    }
  }

  let leading: NoticeLeading = { kind: "app" };
  if (payload.notificationType === "meal_reminder") {
    leading = { kind: "meal" };
  } else if (audience === "trainee" && coachGivenName(coachName)) {
    leading = { kind: "initials", name: coachName!, tone: "coach" };
  } else if (audience === "trainer" && record?.clientDisplayName?.trim()) {
    leading = { kind: "initials", name: record.clientDisplayName, tone: "client" };
  }

  return {
    key: pushNoticeKey(payload),
    target: noticeTargetKey(deepLinkFromNotificationPayload(payload)),
    title,
    body: body || undefined,
    leading,
    openLabel: "Open",
    onOpen: () => {
      stage1Api(context.api)
        .markNotificationRead(payload.notificationId)
        .catch((err: unknown) => reportError("foregroundPush.markRead", err));
      context.openPayload(payload);
    },
  };
}

/**
 * The receive handler: builds each push's banner (the reads run at once) and
 * queues them in arrival order, so two pushes in a row show in the order they
 * came even when the first needs one more read (a coach note's text).
 */
export function createForegroundPushHandler(
  queue: NoticeQueue,
  context: () => ForegroundPushContext,
): (data: unknown) => Promise<void> {
  let chain: Promise<void> = Promise.resolve();
  return (data) => {
    // The reads below take time. If the user signs out (or switches user or
    // role) meanwhile, `reset()` has bumped the queue's epoch and the banner,
    // with its `onOpen`, belongs to the old session: drop it.
    const epoch = queue.getEpoch();
    const received = context();
    const { role, userId } = received;
    const built = bannerForPush(data, received);
    chain = chain
      .then(async () => {
        const banner = await built;
        if (!banner) return;
        const current = context();
        if (
          queue.getEpoch() !== epoch ||
          current.role !== role ||
          current.userId !== userId ||
          current.userId == null
        ) {
          return;
        }
        queue.showBanner(banner);
      })
      .catch((err: unknown) => reportError("foregroundPush.show", err));
    return chain;
  };
}

type ReceivedNotification = {
  request: { content: { data: unknown } };
};

/** The slice of expo-notifications this binding uses (injectable for tests). */
export type ReceivedNotificationsModule = {
  addNotificationReceivedListener: (
    listener: (notification: ReceivedNotification) => void,
  ) => { remove: () => void };
};

/** Subscribe to pushes received in the foreground. Returns the cleanup. */
export function bindForegroundPushes(
  load: () => Promise<ReceivedNotificationsModule>,
  onData: (data: unknown) => void,
): () => void {
  let cancelled = false;
  let subscription: { remove: () => void } | null = null;
  void load()
    .then((Notifications) => {
      if (cancelled) return;
      subscription = Notifications.addNotificationReceivedListener((notification) =>
        onData(notification.request.content.data),
      );
    })
    .catch((err: unknown) => reportError("foregroundPush.load", err));
  return () => {
    cancelled = true;
    subscription?.remove();
  };
}
