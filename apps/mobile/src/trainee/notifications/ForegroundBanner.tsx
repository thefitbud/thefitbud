import { useCallback, useEffect, useState } from "react";
import type { CoachingRelationship, MealAssignment, Notification } from "@fitbud/contracts";
import { MEAL_REMINDER_AFTER_MINUTES, zonedDateTimeFormat } from "@fitbud/core";
import { stage1Api } from "../../lib/stage1Api";
import { useAuth } from "../../auth/AuthProvider";
import { localDateInTimezone } from "../../lib/dates";
import { isMealSnoozed } from "../../notifications/actions";
import { inAppMealBannerCopy, noteBannerCopy } from "../../notifications/copy";
import { setForegroundBannerActive } from "../today/bannerSlot";
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

/** The meal's first foods, e.g. "Vegetable poha · Curd" (frame 29). */
function mealFoods(meal: MealAssignment): string {
  return meal.prescription.items
    .slice(0, 2)
    .map((item) => ("name" in item && typeof item.name === "string" ? item.name.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

export function ForegroundBanner({
  relationship,
  coachName,
  onOpenMeal,
  onGoToday,
}: Props) {
  const { api, me } = useAuth();
  const [meal, setMeal] = useState<MealAssignment | null>(null);
  const [note, setNote] = useState<Notification | null>(null);
  const [notePreview, setNotePreview] = useState<string | null>(null);
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
      setNotePreview(null);
      if (unread) {
        try {
          const notes = await stage1Api(api).listMeCoachNotes();
          const match =
            notes.items.find((item) => item.id === unread.domainEntityId) ??
            notes.items.find((item) => !item.seenAt);
          setNotePreview(match?.body?.trim() || null);
        } catch {
          // The banner still shows; only the preview line is missing.
          setNotePreview(null);
        }
      }
    } catch {
      setNote(null);
    }
  }, [api, me?.timezone, relationship.id]);

  useEffect(() => {
    void load();
  }, [load]);

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
