import { useCallback, useEffect, useState } from "react";
import type { CoachingRelationship, MealAssignment, Notification } from "@fitbud/contracts";
import { MEAL_REMINDER_AFTER_MINUTES } from "@fitbud/core";
import { useAuth } from "../../auth/AuthProvider";
import { localDateInTimezone } from "../../lib/dates";
import { isMealSnoozed } from "../../notifications/actions";
import {
  inAppMealBannerCopy,
  noteBannerCopy,
} from "../../notifications/copy";
import { useSyncEngine } from "../../sync/SyncProvider";
import { confirmMealAssignment } from "../mealActions";
import { IN_APP_MEAL_ACTIONS, IN_APP_NOTE_ACTIONS, InAppBanner } from "./Surfaces";

type Props = {
  relationship: CoachingRelationship;
  coachName: string;
  onOpenMeal: (assignmentId: string) => void;
  onGoToday: () => void;
};

function localMinutes(timeZone: string, instant = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
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

export function ForegroundBanner({
  relationship,
  coachName,
  onOpenMeal,
  onGoToday,
}: Props) {
  const { api, me } = useAuth();
  const sync = useSyncEngine();
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [note, setNote] = useState<Notification | null>(null);
  const [hidden, setHidden] = useState<"meal" | "note" | null>(null);

  const load = useCallback(async () => {
    const timeZone = me?.timezone ?? "Asia/Kolkata";
    const today = localDateInTimezone(timeZone);
    const nowMinutes = localMinutes(timeZone);
    try {
      const listed = await api.listMealAssignments(relationship.id, {
        fromDate: today,
        toDate: today,
      });
      const due =
        listed.items.find((item) => {
          if (item.status !== "pending" && item.status !== "overdue") return false;
          if (isMealSnoozed(item.id)) return false;
          const slot = hmMinutes(item.prescription.localTime ?? "");
          if (slot == null) return false;
          return nowMinutes >= slot + MEAL_REMINDER_AFTER_MINUTES;
        }) ?? null;
      setMeal(due);
    } catch {
      setMeal(null);
    }
    try {
      const page = await api.listNotifications();
      const unread = page.items.find(
        (item) => item.type === "trainer_note_shared" && item.readAt == null,
      );
      setNote(unread ?? null);
    } catch {
      setNote(null);
    }
  }, [api, me?.timezone, relationship.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const showMeal = meal != null && hidden !== "meal";
  if (showMeal && meal) {
    const copy = inAppMealBannerCopy(meal.mealName?.trim() || "Meal");
    return (
      <InAppBanner
        floating
        mark="F"
        kicker={copy.kicker}
        title={copy.title}
        body={copy.body}
        primaryLabel={IN_APP_MEAL_ACTIONS[0]}
        secondaryLabel={IN_APP_MEAL_ACTIONS[1]}
        onPrimary={() => {
          void (async () => {
            try {
              await confirmMealAssignment(
                api,
                sync,
                relationship.id,
                meal,
                coachName,
              );
            } catch {
              // The outbox keeps the confirm if the network drops.
            } finally {
              setHidden("meal");
            }
          })();
        }}
        onSecondary={() => {
          setHidden("meal");
          onOpenMeal(meal.id);
        }}
      />
    );
  }

  if (note && hidden !== "note") {
    const copy = noteBannerCopy(coachName);
    return (
      <InAppBanner
        floating
        mark={copy.mark}
        kicker={copy.kicker}
        title={copy.title}
        body={copy.body}
        primaryLabel={IN_APP_NOTE_ACTIONS[0]}
        secondaryLabel={IN_APP_NOTE_ACTIONS[1]}
        onPrimary={() => {
          setHidden("note");
          onGoToday();
        }}
        onSecondary={() => setHidden("note")}
      />
    );
  }

  return null;
}
