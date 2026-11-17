import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { CoachingRelationship, MealAssignment, Notification } from "@fitbud/contracts";
import { MEAL_REMINDER_AFTER_MINUTES, zonedDateTimeFormat } from "@fitbud/core";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { reportError } from "../../lib/reportError";
import { localDateInTimezone } from "../../lib/dates";
import { isMealSnoozed } from "../../notifications/actions";
import { coachGivenName, inAppMealBannerCopy, noteBannerCopy } from "../../notifications/copy";
import { setForegroundBannerActive } from "../today/bannerSlot";
import { useNoticeQueue } from "../../components/notice/NoticeContext";
import type { NoticeQueue } from "../../components/notice/noticeQueue";
import { InAppBanner } from "./Surfaces";

type Props = {
  relationship: CoachingRelationship;
  coachName: string;
  onOpenMeal: (assignmentId: string) => void;
  onGoToday: () => void;
};

function localMinutes(timeZone: string, instant = new Date()): number {
  const parts = zonedDateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function hmMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The meal's first two foods, comma-separated, e.g. "Vegetable poha, Curd" (frame 29). */
function mealFoods(meal: MealAssignment): string {
  return meal.prescription.items
    .slice(0, 2)
    .map((item) => ("name" in item && typeof item.name === "string" ? item.name.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

type Loaded = {
  meal: MealAssignment | null;
  note: Notification | null;
  notePreview: string | null;
};

/** What the banners show, read once per mount (Today opening). */
function useForegroundState(relationship: CoachingRelationship): Loaded | null {
  const { api, me } = useAuth();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const timeZone = me?.timezone ?? "Asia/Kolkata";
    const today = localDateInTimezone(timeZone);
    const nowMinutes = localMinutes(timeZone);
    let meal: MealAssignment | null = null;
    let note: Notification | null = null;
    let notePreview: string | null = null;
    try {
      const listed = await api.listMealAssignments(relationship.id, {
        fromDate: today,
        toDate: today,
      });
      meal =
        listed.items.find((item) => {
          if (item.status !== "pending" && item.status !== "overdue") return false;
          if (isMealSnoozed(item.id)) return false;
          const slot = hmMinutes(item.prescription.localTime ?? "");
          if (slot == null) return false;
          return nowMinutes >= slot + MEAL_REMINDER_AFTER_MINUTES;
        }) ?? null;
    } catch {
      meal = null;
    }
    try {
      const page = await api.listNotifications();
      note =
        page.items.find(
          (item) => item.type === "trainer_note_shared" && item.readAt == null,
        ) ?? null;
      const unread = note;
      if (unread) {
        try {
          const notes = await stage1Api(api).listMeCoachNotes();
          // No match means no preview; never show some other note's text.
          const match = notes.items.find((item) => item.id === unread.domainEntityId);
          notePreview = match?.body?.trim() || null;
        } catch (err) {
          // The banner still shows; only the preview line is missing.
          reportError("ForegroundBanner.listMeCoachNotes", err);
        }
      }
    } catch {
      note = null;
    }
    return { meal, note, notePreview };
  }, [api, me?.timezone, relationship.id]);

  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setLoaded(next);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  return loaded;
}

/**
 * The trainee's in-app banners from state (frames 29, 29b; v3 TR-06h): a meal
 * that is due and not logged, and an unread coach note. Read when Today opens.
 *
 * Inside the app's `NoticeHost` (Z12-38) each one is queued once per session
 * on the shared notice queue, which shows one banner at a time and removes it
 * after about 4 s, on a swipe up, or on a tap that opens it (a note is then
 * marked read). While a queued banner is up, Today's own check-in reviewed
 * banner waits (`bannerSlot`). Outside a host (render tests) the banner draws
 * in place, as it did before the queue.
 */
export function ForegroundBanner(props: Props) {
  const queue = useNoticeQueue();
  return queue ? (
    <QueuedForegroundBanner {...props} queue={queue} />
  ) : (
    <InlineForegroundBanner {...props} />
  );
}

function QueuedForegroundBanner({
  relationship,
  coachName,
  onOpenMeal,
  onGoToday,
  queue,
}: Props & { queue: NoticeQueue }) {
  const { api } = useAuth();
  const loaded = useForegroundState(relationship);

  useEffect(() => {
    if (!loaded) return;
    const { meal, note, notePreview } = loaded;
    if (meal) {
      const label = meal.mealName?.trim() || "Meal";
      queue.showBanner({
        key: `meal:${meal.id}`,
        target: `meal:${meal.id}`,
        title: inAppMealBannerCopy(label).title,
        body: [mealFoods(meal), "tap to log"].filter(Boolean).join(" · "),
        leading: { kind: "meal" },
        openLabel: `Open ${label}`,
        onOpen: () => onOpenMeal(meal.id),
      });
    }
    if (note) {
      queue.showBanner({
        key: `note:${note.domainEntityId}`,
        title: noteBannerCopy(coachName).title,
        body: notePreview ?? undefined,
        leading: coachGivenName(coachName)
          ? { kind: "initials", name: coachName, tone: "coach" }
          : { kind: "app" },
        openLabel: "Open",
        onOpen: () => {
          stage1Api(api)
            .markNotificationRead(note.id)
            .catch((err: unknown) => reportError("ForegroundBanner.markRead", err));
          onGoToday();
        },
      });
    }
    // Queue once per load; the queue keeps each key to one showing per session.
  }, [loaded, queue]);

  // Today's check-in reviewed banner waits while a queued banner is up.
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const bannerUp = snapshot.banner != null;
  useEffect(() => {
    setForegroundBannerActive(bannerUp);
  }, [bannerUp]);
  useEffect(() => () => setForegroundBannerActive(false), []);

  return null;
}

/** Hostless fallback (render tests): the pre-queue banner, drawn in place. */
function InlineForegroundBanner({
  relationship,
  coachName,
  onOpenMeal,
  onGoToday,
}: Props) {
  const loaded = useForegroundState(relationship);
  const [hidden, setHidden] = useState<"meal" | "note" | null>(null);
  const meal = loaded?.meal ?? null;
  const note = loaded?.note ?? null;
  const notePreview = loaded?.notePreview ?? null;

  const showMeal = meal != null && hidden !== "meal";
  const showNote = !showMeal && note != null && hidden !== "note";
  useEffect(() => {
    setForegroundBannerActive(showMeal || showNote);
    return () => setForegroundBannerActive(false);
  }, [showMeal, showNote]);

  if (showMeal && meal) {
    const label = meal.mealName?.trim() || "Meal";
    const copy = inAppMealBannerCopy(label);
    return (
      <InAppBanner
        floating
        title={copy.title}
        body={[mealFoods(meal), "tap to log"].filter(Boolean).join(" · ")}
        openLabel={`Open ${label}`}
        onOpen={() => {
          setHidden("meal");
          onOpenMeal(meal.id);
        }}
      />
    );
  }

  if (showNote) {
    const copy = noteBannerCopy(coachName);
    return (
      <InAppBanner
        floating
        title={copy.title}
        body={notePreview ? `"${notePreview}"` : undefined}
        openLabel="Open"
        onOpen={() => {
          setHidden("note");
          onGoToday();
        }}
      />
    );
  }

  return null;
}
